const Net = require('net')
const { makeMiddleware } = require('@kmamal/util/function/middleware')
const { DummyLogger } = require('@kmamal/logging/dummy')

const _makeConnectionHandler = (handler, options = {}) => {
	const { logger: _logger = new DummyLogger() } = options

	let nextId = 0

	return async (socket) => {
		const requestId = nextId++
		const logger = _logger.child({ requestId })

		logger.debug("connected")

		let closed = false
		const cleanup = (error) => {
			if (closed) { return }
			closed = true

			if (error) { logger.error({ error }) }
			logger.debug("disconnecting")
			socket
				.off('end', cleanup)
				.off('close', cleanup)
				.off('error', cleanup)
			if (!socket.destroyed) { socket.destroy() }
			logger.debug("disconnected")
		}

		socket
			.on('end', cleanup)
			.on('close', cleanup)
			.on('error', cleanup)

		const ctx = { socket, requestId, logger }

		let error
		try {
			await handler(ctx)
		} catch (_error) {
			error = _error
		}

		cleanup(error)
	}
}

const createServer = (handlers, options) => {
	const handler = makeMiddleware(handlers)
	const connectionHandler = _makeConnectionHandler(handler, options)
	return Net.createServer(connectionHandler)
}

module.exports = { createServer }
