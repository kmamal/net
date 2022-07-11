
const _writeChunk = function * _writeChunk (chunk) {
	yield chunk.length.toString(16)
	yield '\r\n'
	yield chunk
	yield '\r\n'
}

const chunkWriter = (chunkSize = 2 ** 16) =>
	async function * _chunkWriter (source) {
		const buffer = Buffer.allocUnsafe(chunkSize)
		let offset = 0

		for await (const _chunk of source) {
			const chunk = Buffer.isBuffer(_chunk) ? _chunk : Buffer.from(_chunk)
			let remaining = chunk.length

			if (offset > 0) {
				const required = buffer.length - offset
				const length = Math.min(required, remaining)
				chunk.copy(buffer, offset, 0, length)
				offset += length

				if (offset < buffer.length) {
					continue
				}

				remaining -= length
				yield* _writeChunk(buffer)
				offset = 0
			}

			while (remaining >= buffer.length) {
				const start = chunk.length - remaining
				const end = start + buffer.length
				yield* _writeChunk(chunk.slice(start, end))
			}

			if (remaining > 0) {
				chunk.slice(-remaining).copy(buffer)
				offset += remaining
			}
		}

		if (offset > 0) {
			const chunk = buffer.slice(0, offset)
			yield* _writeChunk(chunk)
		}
		yield* _writeChunk('')
	}

module.exports = { chunkWriter }
