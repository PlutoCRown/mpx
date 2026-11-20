const path = require('node:path')
const parseComponent = require('@mpxjs/webpack-plugin/lib/parser')
const preProcessJson = require('@mpxjs/webpack-plugin/lib/utils/pre-process-json')
const processWeb = require('@mpxjs/webpack-plugin/lib/web')
const parseRequest = require('@mpxjs/webpack-plugin/lib/utils/parse-request')
const addQuery = require('@mpxjs/webpack-plugin/lib/utils/add-query')
const { matchCondition } = require('@mpxjs/webpack-plugin/lib/utils/match-condition')
const { stripCondition } = require('@mpxjs/webpack-plugin/lib/style-compiler/strip-conditional')

module.exports = function webLoader (source) {
  const callback = this.async()
  const mpx = this.getMpx()
  const { queryObj, rawResourcePath } = parseRequest(this.resource)
  const resource = addQuery(this.resource, {}, false, ['mpxWebMain', 'vue', 'type', 'index', 'lang', 'scoped'])
  const context = path.dirname(rawResourcePath)
  const entry = mpx.graph.findEntry(resource)
  const srcMode = queryObj.srcMode || entry?.srcMode || mpx.srcMode
  const ctorType = queryObj.isPage ? 'page' : queryObj.isComponent ? 'component' : entry?.type || 'component'
  const resourcePath = this.resourcePath
  const sourceMap = this.sourceMap
  const parts = parseComponent(stripCondition(source, mpx.defs, rawResourcePath), { filePath: resourcePath, mode: mpx.mode, env: mpx.env, needMap: sourceMap })
  const moduleId = mpx.getModuleId(rawResourcePath, ctorType === 'app')
  const autoScope = matchCondition(rawResourcePath, mpx.autoScopeRules)
  // Legacy compiler helpers only use presentational dependencies to record information that the entry graph already owns.
  const loaderContext = Object.assign({}, this, {
    resource,
    context,
    remainingRequest: resource,
    _module: { addPresentationalDependency () {} },
    _compiler: { inputFileSystem: mpx.inputFileSystem },
    _compilation: { outputOptions: { publicPath: '' } },
    resolve: mpx.resolveForCompiler
  })
  const emitWarning = message => this.emitWarning(new Error(message))
  const emitError = message => this.emitError(new Error(message))

  this.cacheable(false)
  preProcessJson({
    json: entry ? { content: JSON.stringify(entry.sourceJSON) } : parts.json || {},
    srcMode: parts.json?.srcMode || srcMode,
    emitWarning,
    emitError,
    ctorType,
    resourcePath,
    loaderContext
  }, (error, jsonInfo) => {
    if (error) return callback(error)
    try {
      return processWeb(Object.assign({}, jsonInfo, {
        parts,
        loaderContext,
        pagesMap: mpx.pagesMap,
        componentsMap: mpx.componentsMap,
        queryObj,
        ctorType,
        srcMode,
        moduleId,
        isProduction: this.mode === 'production',
        hasScoped: parts.styles.some(style => style.scoped) || autoScope,
        hasComment: parts.template?.attrs?.comments,
        isNative: false,
        autoScope,
        callback
      }))
    } catch (error) {
      callback(error)
    }
  })
}
