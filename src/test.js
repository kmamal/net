const { createServer } = require('./server')
const { http } = require('./middleware/http')
const HTTP_CODES = require('./http/codes')
const { respond: httpRespond } = require('./http/respond')
const { httpStatic } = require('./middleware/http-static')
const { ConsoleLogger } = require('@kmamal/logging/console')
const { fromTimestamp } = require('@kmamal/date/date')

const logger = new ConsoleLogger({
	formatDate: (timestamp) => {
		const {
			year,
			month,
			day,
			hour,
			minute,
			second,
			millisecond,
		} = fromTimestamp(timestamp)
		return `${year}/${month}/${day} ${hour}:${minute}:${second} .${millisecond}`
	},
})

const staticPrefix = '/public/'
const staticHandler = httpStatic({
	root: __dirname,
	prefix: staticPrefix,
	showListings: true,
})

createServer(
	[
		http(),
		async (next, ctx) => {
			const { request } = ctx
			const { url } = request
			if (!url.startsWith(staticPrefix)) {
				next()
				return
			}

			await staticHandler(next, ctx)
		},
		(next, ctx) => {
			const statusCode = HTTP_CODES.NotFound
			logger.debug({ statusCode }, "response (not found)")
			httpRespond(ctx.socket, statusCode, {}, true)
		},
	],
	{ logger },
).listen(8080)
