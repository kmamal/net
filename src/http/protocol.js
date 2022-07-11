const { read } = require('@kmamal/stream/read')
const { write } = require('@kmamal/stream/write')

const _readLine = async (stream) => {
	const chunks = []
	for (;;) {
		let chunk = (await read(stream)).toString('utf8')
		const index = chunk.indexOf('\r\n')
		if (index !== -1) {
			const part = chunk.slice(0, index)
			const rest = chunk.slice(index + 2)
			stream.unshift(rest)
			return chunks.join('') + part
		}

		if (chunk[chunk.lenght - 1] === '\r') {
			stream.unshift('\r')
			chunk = chunk.slice(0, -1)
		}
		chunks.push(chunk)
	}
}

const _readHeaders = async (stream) => {
	const headers = Object.create(null)
	for (;;) {
		const line = await _readLine(stream)
		if (line.length === 0) { break }
		const index = line.indexOf(': ')
		if (index === -1) { throw new Error("bad header") }
		const key = line.slice(0, index).toLowerCase()
		const value = line.slice(index + 2)
		headers[key] = value
	}
	return headers
}

const readRequest = async (stream) => {
	const requestLine = await _readLine(stream)
	const [ method, url, protocol ] = requestLine.split(' ')
	if (!method) { throw new Error("bad method") }
	if (!url) { throw new Error("bad url") }
	if (!protocol) { throw new Error("bad protocol") }
	const headers = await _readHeaders(stream)
	return { method, url, protocol, headers }
}

const readResponse = async (stream) => {
	const statusLine = await _readLine(stream)
	const [ protocol, codeStr ] = statusLine.split(' ', 2)
	if (!protocol) { throw new Error("bad protocol") }
	const code = parseInt(code, 10)
	if (!code) { throw new Error("bad code") }
	const message = statusLine.slice(protocol.length + 1 + codeStr.length)
	if (!message) { throw new Error("bad message") }
	const headers = await _readHeaders(stream)
	return { protocol, code, message, headers }
}

const _writeHeaders = async (stream, headers) => {
	for (const [ key, header ] of Object.entries(headers)) {
		await write(stream, `${key}: ${header}\r\n`)
	}
}

const writeRequest = async (stream, request) => {
	const { method, url, headers = {} } = request
	await write(stream, `${method} ${url} HTTP/1.1\r\n`)
	await _writeHeaders(stream, headers)
	await write(stream, '\r\n')
}

const writeResponse = async (stream, response) => {
	const { code, message, headers = {} } = response
	await write(stream, `HTTP/1.1 ${code} ${message}\r\n`)
	await _writeHeaders(stream, headers)
	await write(stream, '\r\n')
}

module.exports = {
	readRequest,
	readResponse,
	writeRequest,
	writeResponse,
}
