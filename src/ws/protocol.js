const { read } = require('@kmamal/stream/read')
const { write } = require('@kmamal/stream/write')

const readHeader = async (stream) => {
	const header = await read(stream, 2)
	const fin = Boolean(header[0] & 0x80)

	const reserved1 = Boolean(header[0] & 0x40)
	if (reserved1) { throw new Error("set rsv1") }
	const reserved2 = Boolean(header[0] & 0x20)
	if (reserved2) { throw new Error("set rsv2") }
	const reserved3 = Boolean(header[0] & 0x10)
	if (reserved3) { throw new Error("set rsv3") }

	const opcode = header[0] & 0x0f
	if (opcode > 15) { throw new Error("bad opcode") }

	const mask = Boolean(header[1] & 0x80)

	let length = header[1] & 0x7f
	if (length === 126) {
		const bytes = await read(stream, 2)
		length = bytes.readUInt16BE()
	} else if (length === 127) {
		const bytes = await read(stream, 8)
		length = bytes.readBigInt64BE()
		if (length < 0) { throw new Error("bad length") }
	}

	return { fin, opcode, mask, length }
}

const readPayload = async (stream, header) => {
	const { mask, length } = header

	let maskingKey = null
	if (mask) {
		maskingKey = await read(stream, 4)
	}

	if (length === 0) { return null }

	const payload = await read(stream, length)

	if (mask) {
		for (let i = 0; i < length; i++) {
			payload[i] ^= maskingKey[i % 4]
		}
	}

	return payload
}

const writeFrame = async (stream, frame) => {
	const { fin = true, opcode = 0, mask = false, payload = '' } = frame
	const { length } = payload
	let length1
	let length2 = null
	if (length <= 125) {
		length1 = length
	} else if (length < 65535) {
		length1 = 126
		length2 = Buffer.allocUnsafe(2)
		length2.writeUInt16BE(length)
	} else {
		length1 = 127
		length2 = Buffer.allocUnsafe(8)
		length2.writeBigUInt64BE(BigInt(length))
	}

	const header = Buffer.allocUnsafe(2, 0)
	header[0] = (fin << 7) | opcode
	header[1] = (mask << 7) | length1
	await write(stream, header)
	if (length2) { await write(stream, length2) }

	if (mask) {
		// write mask
		// mask payload
	}

	await write(stream, payload)
}

module.exports = {
	readHeader,
	readPayload,
	writeFrame,
}
