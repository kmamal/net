const Fsp = require('fs/promises')
const { pipeline } = require('stream/promises')
const { chunkWriter } = require('../../http/chunk-writer')

const writeListing = async (stream, path, url) => {
	await pipeline(
		async function * listing () {
			yield '<html><body>'
			yield `<h1>Index of ${url}</h1>`

			yield '<hr/>'
			yield '<pre>'
			const dir = await Fsp.opendir(path)
			if (url !== '/') {
				yield '<a href="../">../</a>\n'
			}
			for await (const entry of dir) {
				const { name: _name } = entry
				const name = entry.isDirectory() ? `${_name}/` : _name
				yield `<a href="${name}">${name}</a>\n`
			}
			yield '</pre>'
			yield '<hr/>'

			yield '</body></html>'
		},
		chunkWriter(),
		stream,
	)
}

module.exports = { writeListing }
