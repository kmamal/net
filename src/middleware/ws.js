const { handleHandshake } = require('../ws/handshake')

const ws = () =>
	async (next, ctx) => {
		ctx.ws = await handleHandshake(ctx.socket, ctx.request)
		next()
	}

module.exports = { ws }
