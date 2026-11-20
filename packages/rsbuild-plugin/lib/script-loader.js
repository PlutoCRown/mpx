const path = require('node:path')
const addQuery = require('@mpxjs/webpack-plugin/lib/utils/add-query')
const parseRequest = require('@mpxjs/webpack-plugin/lib/utils/parse-request')
const { matchCondition } = require('@mpxjs/webpack-plugin/lib/utils/match-condition')
const transformScript = require('./transform-script-native')
const { recordEffects, addDependencies, replayEffects } = require('./watch-cache')

module.exports = function scriptLoader (source, inputSourceMap) {
  const { queryObj } = parseRequest(this.resource)
  const build = this.mpxBuild
  if (!build) return source
  const { options, graph } = build
  const entry = queryObj.mpxScript && graph.entries.get(queryObj.mpxScript)
  const packageRoot = queryObj.mpxPackage || (entry && entry.packageRoot) || ''
  const block = entry && entry.descriptor.script
  const context = this.context || path.dirname(this.resourcePath)
  let code = entry && !block?.src ? block?.content : source

  if (entry && !block) {
    const ctor = { app: 'createApp', page: 'createPage', component: 'createComponent' }[entry.type]
    code = `import { ${ctor} } from '@mpxjs/core'\n${ctor}({})`
  }

  const map = (entry && !block?.src && block?.map) || inputSourceMap
  const setup = block && block.setup
  const babelPlugins = options.scriptPlugins?.(this.resourcePath, code)
  if (!entry && !packageRoot && !babelPlugins?.length && !/(?:\.\s*async\b|\[\s*['"]async['"]\s*\]|\?resolve\b|__mpx_|\b(?:App|Page|Component|Behavior)\s*\(|\bwx\b)/.test(code)) {
    return source
  }
  this.cacheable(false)
  const callback = this.async()
  const cache = !babelPlugins?.length && build.cache
  const id = 'script:' + this.resource
  const lang = block?.lang || queryObj.lang
  const srcMode = block?.srcMode || entry?.srcMode || queryObj.srcMode || options.srcMode
  const independent = packageRoot && graph.independentPackages.has(packageRoot)
  const input = cache && JSON.stringify([code, map, setup, lang, srcMode, packageRoot, independent, entry?.type, context])
  const record = cache && cache.get(id, input, value =>
    value.resolvedPaths.every(([request, name]) => graph.findEntry(request, packageRoot)?.name === name))
  if (record) {
    replayEffects(this, graph, record.effects)
    record.value.asyncEntries.forEach(build.registerAsyncEntry)
    return callback(null, record.value.code, record.value.map)
  }

  const effects = cache && recordEffects(this, graph)
  const loader = effects ? effects.facade : this
  const resolver = effects ? effects.graph : graph
  const asyncEntries = effects ? [] : undefined
  const resolvedPaths = effects ? [] : undefined
  const warn = message => loader.emitWarning(message instanceof Error ? message : new Error(message))
  const rewriteRequest = packageRoot && (independent || options.subpackageModulesRules)
? (request, kind) => {
    if (request.startsWith('node:') || request.includes('!')) return request
    const resolved = resolver.resolveSync(context, request, { tracked: Boolean(build.cache), optional: true, dependencyType: kind })
    if (!resolved) return request
    const { rawResourcePath } = parseRequest(resolved)
    if (!/\.[cm]?[jt]sx?$/.test(rawResourcePath)) return request
    if (!independent && !matchCondition(rawResourcePath, options.subpackageModulesRules)) return request
    return addQuery(resolved, { mpxPackage: packageRoot })
  }
: undefined
  const transform = (content, sourceMap) => {
    const opts = Object.assign({}, options, {
      filename: this.resourcePath,
      lang,
      srcMode,
      inputSourceMap: sourceMap,
      babelPlugins,
      warn,
      resolvePath: request => {
        const resolved = resolver.resolveSync(context, request)
        const result = graph.findEntry(resolved, packageRoot)
        if (!result) throw new Error(`[Mpx] "${request}" is not a declared page or component of "${this.resourcePath}"`)
        resolvedPaths?.push([resolved, result.name])
        return '/' + result.name
      },
      requireAsync: (request, info) => build.asyncRequest(context, request, info, resolver, asyncEntries),
      rewriteRequest
    })
    transformScript(content, opts).then(result => {
      if (effects) {
        addDependencies(graph, effects.dependencies)
        cache.set(id, input, Object.assign(result, { asyncEntries, resolvedPaths }), effects)
      }
      callback(null, result.code, result.map)
    }, callback)
  }
  if (setup) {
    const compileScriptSetup = require('@mpxjs/webpack-plugin/lib/script-setup-compiler')
    const facade = Object.create(loader)
    facade.resource = addQuery(this.resource, { ctorType: entry.type, lang: block.lang })
    facade.async = () => (err, content, sourceMap) => {
      if (err) return callback(err)
      transform(content, sourceMap)
    }
    compileScriptSetup.call(facade, code, map).catch(callback)
    return
  }
  transform(code, map)
}
