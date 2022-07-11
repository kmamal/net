const { writeResponse } = require('./protocol')
const MESSAGES = require('./messages')

const respond = async (socket, code, headers, end = false) => {
	await writeResponse(socket, { code, message: MESSAGES[code], headers })
	if (end) { socket.end() }
}

module.exports = { respond }
