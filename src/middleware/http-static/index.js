const CODES = require('../../http/codes')
const { respond } = require('../../http/respond')
const { writeListing } = require('./listing')
const Fsp = require('fs/promises')
const Path = require('path')
const MimeTypes = require('mime-types')
const { pipeline } = require('stream/promises')

const METHODS = [ 'GET', 'HEAD', 'OPTIONS' ]

const RANGE_REGEXP = /^bytes=(?<start>\d+)?-(?<end>\d+)?$/u

const httpStatic = (options = {}) => {
	const {
		root,
		prefix: _prefix,
		showListings,
		index,
		mimeTypes,
	} = options

	const prefix = _prefix.endsWith('/') ? _prefix : `${_prefix}/`

	return async (next, { socket, logger, request, url: parsedUrl }) => {
		const staticLogger = logger.child({ middleware: "http-static" })
		const { method } = request

		if (!METHODS.includes(method)) {
			next()
			return
		}

		if (method === 'OPTIONS') {
			await respond(socket, CODES.OK, {
				'access-control-allow-origin': '*',
				'access-control-allow-methods': METHODS.join(', '),
				'access-control-allow-headers': [
					...Object.keys(request.headers),
					...request.headers['access-control-request-headers'].split(', '),
				].join(', '),
			}, true)
			return
		}

		const baseUrl = `http://${request.headers.host}`
		const url = parsedUrl ?? new URL(request.url, baseUrl)
		const urlPath = url.pathname.slice(prefix.length - 1)
		const pathFromRoot = Path.resolve('/', urlPath).slice(1)

		let filePath
		let stats
		try {
			filePath = Path.resolve(root, pathFromRoot)
			stats = await Fsp.stat(filePath)

			if (stats.isDirectory()) {
				if (!request.url.endsWith('/')) {
					const statusCode = CODES.SeeOther
					const headers = { location: `${request.url}/` }
					staticLogger.debug({ statusCode, headers }, "response (redirect dirs to /)")
					await respond(socket, statusCode, headers, true)
					return
				}

				if (showListings) {
					const statusCode = CODES.OK
					const headers = { 'transfer-encoding': 'chunked' }
					staticLogger.debug({ statusCode, headers }, "response (dir listing)")
					await respond(socket, statusCode, headers)
					await writeListing(socket, filePath, pathFromRoot || '/')
					return
				}

				if (!index) {
					const statusCode = CODES.Forbidden
					staticLogger.debug({ statusCode }, "response (requested a dir)")
					await respond(socket, statusCode, {}, true)
					return
				}

				filePath = Path.join(filePath, index)
				stats = await Fsp.stat(filePath)
			}
		} catch (error) {
			switch (error.code) {
				case 'ENOENT': {
					const statusCode = CODES.NotFound
					staticLogger.debug({ statusCode }, "response (not found)")
					await respond(socket, statusCode, {}, true)
					return
				}

				case 'EACCESS': {
					const statusCode = CODES.Forbidden
					staticLogger.debug({ statusCode }, "response (forbidden)")
					await respond(socket, statusCode, {}, true)
					return
				}

				default: {
					const statusCode = CODES.InternalServerError
					staticLogger.debug({ statusCode }, "response (error)")
					await respond(socket, statusCode, {}, true)
					throw error
				}
			}
		}

		const { size } = stats
		let start = 0
		let end = size - 1
		let isRange

		rangeRequest: {
			const rangeHeader = request.headers.range
			if (!rangeHeader) { break rangeRequest }
			const match = rangeHeader.match(RANGE_REGEXP)
			if (!match) { break rangeRequest }

			const rangeStart = parseInt(match.groups.start, 10)
			const rangeEnd = parseInt(match.groups.end, 10)
			if (Number.isNaN(rangeStart) && Number.isNaN(rangeEnd)) {
				const statusCode = CODES.BadRequest
				staticLogger.debug({ statusCode }, "response (bad range)")
				await respond(socket, statusCode, {}, true)
				return
			}

			if (Number.isNaN(rangeStart)) {
				start = size - end
			} else {
				start = rangeStart
				end = Number.isNaN(rangeEnd) ? end : rangeEnd
			}

			if (start < 0 || end > size) {
				const statusCode = CODES.RangeNotSatisfiable
				const headers = { 'content-range': `*/${size}` }
				staticLogger.debug({ statusCode, headers }, "response (bad range)")
				await respond(socket, statusCode, headers, true)
				return
			}

			isRange = true
		}

		let statusCode = CODES.OK
		const headers = {
			'access-control-allow-origin': '*',
			'accept-ranges': 'bytes',
			'content-length': (end - start) + 1,
		}

		if (isRange) {
			statusCode = CODES.PartialContent
			headers['content-range'] = `bytes ${start}-${end}/${size}`
		}

		let mimeType = MimeTypes.lookup(filePath)
		if (!mimeType && mimeTypes) {
			mimeType = mimeTypes.get(Path.extname(filePath))
		}
		if (mimeType) {
			headers['content-type'] = MimeTypes.contentType(mimeType)
		}

		try {
			staticLogger.debug({ statusCode, headers }, "response")
			await respond(socket, statusCode, headers)

			if (method === 'HEAD') {
				socket.end()
				return
			}

			const file = await Fsp.open(filePath)
			const body = file.createReadStream({ start, end })
			await pipeline(body, socket)
			socket.end()
		} catch (error) {
			socket.destroy(error)
			throw error
		}
	}
}

module.exports = { httpStatic }
