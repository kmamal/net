const { EventEmitter } = require('events')
const { readHeader, readPayload, writeFrame } = require('./protocol')
const { Watchdog } = require('@kmamal/util/promise/watchdog')

const EMPTY_BUFFER = Buffer.allocUnsafe(0)

class Socket extends EventEmitter {
	constructor (stream) {
		super()

		this._stream = stream
		this._readClosed = false
		this._writeClosed = false
		this._data = null
		this._encoding = null

		this._stream
			.on('error', (error) => this._onError(error))
			.on('close', () => this.close())

		this._read()

		this._pinger = new Watchdog(() => {
			this._pinger.reset()
			this._writePing()
		}, 3e3)
		this._watchdog = new Watchdog(() => {
			this._onError(new Error("timed out"))
		}, 10e3)

		this._pinger.start()
		this._watchdog.start()
	}

	async send (message) {
		try {
			const opcode = Buffer.isBuffer(message) ? 2 : 1
			const payload = Buffer.from(message)
			await this._writeData(true, opcode, payload)
		} catch (error) {
			this._onError(error)
		}
	}

	async close (code, message) {
		if (this._writeClosed) { return }
		this._writeClosed = true

		this._pinger.stop()
		this._watchdog.stop()

		try {
			await this._writeClose()
			this._stream.end()

			this.emit('close', code, message)
		} catch (error) {
			this._onError(error)
		}
	}

	async _writeData (fin, opcode, payload) {
		const frame = { fin, opcode, payload }
		await this._writeFrame(frame)
	}

	async _writeClose (code, message) {
		let codeBuff = EMPTY_BUFFER
		if (code) {
			codeBuff = Buffer.allocUnsafe(2)
			codeBuff.writeUInt16BE(code)
		}

		let messageBuff = EMPTY_BUFFER
		if (message) {
			messageBuff = Buffer.from(message)
		}

		const payload = Buffer.concat([ codeBuff, messageBuff ])
		const frame = { opcode: 8, payload }
		await this._writeFrame(frame)
	}

	async _writePing (payload) {
		const frame = { opcode: 9, payload }
		await this._writeFrame(frame)
	}

	async _writePong (payload) {
		const frame = { opcode: 10, payload }
		await this._writeFrame(frame)
	}

	async _writeFrame (frame) {
		await writeFrame(this._stream, frame)
	}

	async _read () {
		if (this._readClosed) { return }

		try {
			const header = await readHeader(this._stream)
			const { fin, opcode, mask } = header
			if (!mask) { throw new Error("client has no mask") }

			const payload = await readPayload(this._stream, header)

			this._pinger.reset()
			this._watchdog.reset()

			const isControl = Boolean(opcode & 0x08)
			if (isControl) {
				if (!fin) { throw new Error("fragmented control message") }

				switch (opcode) {
				// Close
					case 8: {
						const code = payload.readUInt16BE()
						const message = payload.slice(2).toString('utf8')

						this._readClosed = true
						if (!this._writeClosed) {
							this.close(code, message)
						}
					} break

						// Ping
					case 9:
						await this._writePong(payload)
						break

						// Pong
					case 10: break

					default: throw new Error("unknown control message")
				}
			} else {
				if (this._data) {
					if (opcode) { throw new Error("opcode is not continue") }
				} else {
					if (!opcode) { throw new Error("no opcode") }

					this._data = []
					if (opcode === 1) {
						this._encoding = 'utf8'
					}
				}

				this._data.push(payload)

				if (fin) {
					let data = Buffer.concat(this._data)
					if (this._encoding) {
						data = data.toString(this._encoding)
					}
					this.emit('message', data)
					this._data = null
					this._encoding = null
				}
			}

			process.nextTick(() => { this._read() })
		} catch (error) {
			this._onError(error)
		}
	}

	_onError (error) {
		this.emit('error', error)
		this.close()
	}
}

module.exports = { Socket }
