module.exports = function installReactRuntime (rspack, compilation, pageConfigsMap, development) {
  const { RuntimeModule, RuntimeGlobals } = rspack

  class LoadAsyncChunk extends RuntimeModule {
    constructor () {
      super('Mpx RN load async chunk', RuntimeModule.STAGE_ATTACH)
    }

    generate () {
      return `
var mpxChunksInProgress = Object.create(null);
${RuntimeGlobals.loadScript} = function (url, done, key, chunkId) {
  if (mpxChunksInProgress[url]) {
    mpxChunksInProgress[url].push(done);
    return;
  }
  mpxChunksInProgress[url] = [done];
  var packageName = (${RuntimeGlobals.getChunkScriptFilename}(chunkId) || '').split('/').slice(0, -1).join('/');
  function complete(type) {
    var handlers = mpxChunksInProgress[url];
    delete mpxChunksInProgress[url];
    var event = { type: type || 'fail', target: { src: url } };
    handlers.forEach(function (handler) { handler(event); });
  }
  Promise.resolve().then(function () {
    var rnConfig = global.__mpx && global.__mpx.config && global.__mpx.config.rnConfig;
    if (!rnConfig || typeof rnConfig.loadChunkAsync !== 'function') {
      console.error('[Mpx runtime error]: please configure mpx.config.rnConfig.loadChunkAsync');
      return;
    }
    return rnConfig.loadChunkAsync({ url: url, package: packageName });
  }).then(complete, function () { complete('fail'); });
};`
    }
  }

  compilation.hooks.runtimeRequirementInTree.for(RuntimeGlobals.loadScript).tap('MpxReactNative', chunk => {
    compilation.addRuntimeModule(chunk, new LoadAsyncChunk())
  })

  compilation.hooks.processAssets.tap({
    name: 'MpxReactNative',
    stage: rspack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS
  }, () => {
    const entryFiles = new Set()
    for (const entry of compilation.entrypoints.values()) {
      const file = [...entry.getEntrypointChunk().files].find(name => name.endsWith('.js'))
      if (file) entryFiles.add(file)
    }
    const { chunkLoadingGlobal } = compilation.outputOptions
    const refresh = `/* @refresh reset */
if (typeof module !== 'undefined' && module.hot) {
  module.hot.accept(function () { require('react-native').DevSettings.reload(); });
}
`
    for (const chunk of compilation.chunks) {
      for (const file of chunk.files) {
        if (!file.endsWith('.js')) continue
        let prefix = ''
        if (development) prefix += refresh
        if (entryFiles.has(file)) {
          prefix += `global.__mpxPageConfigsMap = ${JSON.stringify(pageConfigsMap)};\n`
          if (development) {
            prefix += `
global.__mpxClearAsyncChunkCache = function (ids) {
  var chunks = global[${JSON.stringify(chunkLoadingGlobal)}] || [];
  for (var i = chunks.length - 1; i >= 0; i--) {
    if (JSON.stringify(chunks[i][0]) === JSON.stringify(ids)) chunks.splice(i, 1);
  }
};\n`
          }
        } else if (development) {
          prefix += `global.__mpxClearAsyncChunkCache && global.__mpxClearAsyncChunkCache(${JSON.stringify(chunk.ids)});\n`
        }
        if (prefix) compilation.updateAsset(file, source => new rspack.sources.ConcatSource(prefix, source))
      }
    }
  })
}
