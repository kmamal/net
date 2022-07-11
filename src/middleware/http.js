const CODES = require('../http/codes')
const { readRequest } = require('../http/protocol')
const { respond } = require('../http/respond')

const http = () =>
	async (next, ctx) => {
		const { socket, logger } = ctx
		const httpLogger = logger.child({ middleware: "http" })

		const sendError = async (code, _error) => {
			try {
				await respond(socket, code, {}, true)
			} catch (_) {}

			const error = new Error("http parsing error")
			error.code = code
			error.error = _error
			throw error
		}

		let request
		try {
			request = await readRequest(socket)
		} catch (error) {
			await sendError(CODES.BadRequest, error)
		}

		const { protocol } = request
		if (protocol !== 'HTTP/1.1' && protocol !== 'HTTP/1.0') {
			await sendError(CODES.HTTPVersionNotSupported)
		}

		httpLogger.debug({ request }, "request")

		ctx.request = request
		next()
	}

module.exports = { http }
