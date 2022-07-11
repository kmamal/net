
const httpUrl = () =>
	(next, ctx) => {
		const { request } = ctx
		ctx.url = new URL(request.url, `http://${request.headers.host}`)
		next()
	}

module.exports = { httpUrl }
