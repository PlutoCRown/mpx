const path = require('node:path')
const addQuery = require('@mpxjs/webpack-plugin/lib/utils/add-query')
const parseRequest = require('@mpxjs/webpack-plugin/lib/utils/parse-request')
const { matchCondition } = require('@mpxjs/webpack-plugin/lib/utils/match-condition')
const transformScript = require('./transform-script')

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
  const warn = message => this.emitWarning(message instanceof Error ? message : new Error(message))
  const transform = (content, sourceMap) => {
    const opts = Object.assign({}, options, {
      filename: this.resourcePath,
      lang: block?.lang || queryObj.lang,
      srcMode: block?.srcMode || entry?.srcMode || queryObj.srcMode || options.srcMode,
      inputSourceMap: sourceMap,
      babelPlugins,
      warn,
      resolvePath: request => {
        const resolved = graph.resolveSync(context, request)
        const result = graph.findEntry(resolved, packageRoot)
        if (!result) throw new Error(`[Mpx] "${request}" is not a declared page or component of "${this.resourcePath}"`)
        return '/' + result.name
      },
      requireAsync: (request, info) => build.asyncRequest(context, request, info),
      rewriteRequest: (request, kind) => {
        if (!packageRoot || request.startsWith('node:') || request.includes('!')) return request
        const independent = graph.independentPackages.has(packageRoot)
        if (!independent && !options.subpackageModulesRules) return request
        const resolved = graph.resolveSync(context, request, { tracked: false, optional: true, dependencyType: kind })
        if (!resolved) return request
        const { rawResourcePath } = parseRequest(resolved)
        if (!/\.[cm]?[jt]sx?$/.test(rawResourcePath)) return request
        if (!independent && !matchCondition(rawResourcePath, options.subpackageModulesRules)) return request
        return addQuery(resolved, { mpxPackage: packageRoot })
      }
    })
    return transformScript(content, opts)
  }
  if (setup) {
    const compileScriptSetup = require('@mpxjs/webpack-plugin/lib/script-setup-compiler')
    const callback = this.async()
    const facade = Object.create(this)
    facade.resource = addQuery(this.resource, { ctorType: entry.type, lang: block.lang })
    facade.async = () => (err, content, sourceMap) => {
      if (err) return callback(err)
      try {
        const result = transform(content, sourceMap)
        callback(null, result.code, result.map)
      } catch (error) {
        callback(error)
      }
    }
    compileScriptSetup.call(facade, code, map).catch(callback)
    return
  }
  const result = transform(code, map)
  this.callback(null, result.code, result.map)
}
