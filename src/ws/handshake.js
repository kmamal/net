const HTTP_CODES = require('../http/codes')
const { respond: httpRespond } = require('../http/respond')
const Crypto = require('crypto')
const { Socket } = require('./socket')

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

const handleHandshake = async (socket, request) => {
	const { method, protocol, headers } = request

	const sendError = async (code, httpHeaders) => {
		await httpRespond(socket, code, httpHeaders, true)
		throw new Error("protocol error")
	}

	if (method !== 'GET') {
		await sendError(HTTP_CODES.MethodNotAllowed)
	}

	if (protocol !== 'HTTP/1.1') {
		await sendError(HTTP_CODES.HTTPVersionNotSupported)
	}

	if (false
		|| headers.connection !== 'Upgrade'
		|| headers.upgrade !== 'websocket'
	) {
		await sendError(HTTP_CODES.BadRequest)
	}

	const requestKey = headers['sec-websocket-key']
	const responseKey = Crypto
		.createHash('sha1')
		.update(requestKey + GUID)
		.digest()
		.toString('base64')

	await httpRespond(socket, HTTP_CODES.SwitchingProtocols, {
		'Upgrade': 'websocket',
		'Connection': 'Upgrade',
		'Sec-WebSocket-Accept': responseKey,
	})

	return new Socket(socket)
}

module.exports = { handleHandshake }
