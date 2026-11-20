const hash = require('hash-sum')

const clientManifest = 'vue-ssr-client-manifest.json'
const serverBundle = 'vue-ssr-server-bundle.json'
const isScript = name => /\.[cm]?js$/.test(name)
const isLoadable = name => /\.(?:[cm]?js|css)$/.test(name)

function createClientManifest (compilation) {
  const all = compilation.getAssets().map(asset => asset.name)
  const indexes = new Map(all.map((name, index) => [name, index]))
  const initial = new Set()
  compilation.entrypoints.forEach(entry => {
    entry.getFiles().filter(isLoadable).forEach(file => initial.add(file))
  })
  const modules = {}
  compilation.chunks.forEach(chunk => {
    const files = [...chunk.files, ...chunk.auxiliaryFiles].filter(file => indexes.has(file)).map(file => indexes.get(file))
    compilation.chunkGraph.getChunkModules(chunk).forEach(module => {
      const identifier = module.identifier()
      const requests = [module.request, identifier, identifier.replace(/^[^!|]+\|/, '')].filter(Boolean)
      requests.forEach(request => {
        const id = hash(request.replace(/\|\w+$/, ''))
        modules[id] = [...new Set((modules[id] || []).concat(files))]
      })
    })
  })
  const publicPath = compilation.outputOptions.publicPath
  return {
    publicPath: typeof publicPath === 'string' && publicPath !== 'auto' ? publicPath : '/',
    all,
    initial: [...initial],
    async: all.filter(name => isLoadable(name) && !initial.has(name)),
    modules
  }
}

function createServerBundle (compilation) {
  const entries = [...compilation.entrypoints.values()]
  const scripts = entries.length === 1 ? entries[0].getFiles().filter(isScript) : []
  if (scripts.length !== 1) throw new Error('[Mpx SSR] The server environment must provide one entry and one initial JavaScript file')
  const files = {}
  const maps = {}
  const assets = compilation.getAssets()
  assets.forEach(({ name, source }) => {
    if (isScript(name)) files[name] = source.source().toString()
    if (/\.[cm]?js\.map$/.test(name)) maps[name.slice(0, -4)] = JSON.parse(source.source().toString())
  })
  assets.forEach(({ name }) => compilation.deleteAsset(name))
  return { entry: scripts[0], files, maps }
}

module.exports = class MpxWebSsrPlugin {
  constructor (isServer) {
    this.isServer = isServer
  }

  apply (compiler) {
    const { rspack } = compiler
    compiler.hooks.thisCompilation.tap('MpxWebSsr', compilation => {
      compilation.hooks.processAssets.tap({
        name: 'MpxWebSsr',
        stage: rspack.Compilation.PROCESS_ASSETS_STAGE_REPORT
      }, () => {
        const manifest = this.isServer ? createServerBundle(compilation) : createClientManifest(compilation)
        const filename = this.isServer ? serverBundle : clientManifest
        compilation.emitAsset(filename, new rspack.sources.RawSource(JSON.stringify(manifest)))
      })
    })
  }
}
