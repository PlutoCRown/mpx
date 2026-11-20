const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const { pathToFileURL, fileURLToPath } = require('node:url')
const parseComponent = require('@mpxjs/webpack-plugin/lib/parser')
const preProcessJson = require('@mpxjs/webpack-plugin/lib/utils/pre-process-json')
const processReact = require('@mpxjs/webpack-plugin/lib/react')
const compileStyle = require('@mpxjs/webpack-plugin/lib/style-compiler')
const { stripCondition } = require('@mpxjs/webpack-plugin/lib/style-compiler/strip-conditional')
const parseRequest = require('@mpxjs/webpack-plugin/lib/utils/parse-request')
const addQuery = require('@mpxjs/webpack-plugin/lib/utils/add-query')
const { matchCondition } = require('@mpxjs/webpack-plugin/lib/utils/match-condition')

function createFacade (loader, values) {
  const properties = Object.fromEntries(Object.entries(values).map(([name, value]) => [name, { value, writable: true }]))
  return Object.create(loader, properties)
}

function renderStylus (stylus, content, resourcePath, defs, addDependency) {
  const compiler = stylus(content).set('filename', resourcePath)
  const readFileSync = fs.readFileSync
  // Stylus resolves nested imports synchronously and has no hook for supplying their content.
  fs.readFileSync = (file, options) => {
    const source = readFileSync(file, options)
    return typeof file === 'string' && /\.styl$/.test(file) && typeof source === 'string'
      ? stripCondition(source, defs, file)
      : source
  }
  try {
    compiler.deps().forEach(addDependency)
    return compiler.render()
  } finally {
    fs.readFileSync = readFileSync
  }
}

async function readStyle (loader, mpx, style, request) {
  const projectRequire = createRequire(path.join(mpx.projectRoot, 'package.json'))
  let resourcePath = loader.resourcePath
  let content = style.content
  if (style.src) {
    const resolved = await mpx.graph.resolve(loader.context, style.src)
    resourcePath = parseRequest(resolved).rawResourcePath
    loader.addDependency(resourcePath)
    content = stripCondition((await mpx.graph.readFile(resourcePath)).toString('utf8'), mpx.defs, resourcePath)
  }
  const lang = style.lang || path.extname(resourcePath).slice(1)
  if (lang === 'scss' || lang === 'sass') {
    const result = await projectRequire('sass').compileStringAsync(content, {
      url: pathToFileURL(resourcePath),
      syntax: lang === 'sass' ? 'indented' : 'scss',
      loadPaths: [path.dirname(resourcePath), path.join(mpx.projectRoot, 'node_modules')]
    })
    result.loadedUrls.filter(file => file.protocol === 'file:').forEach(file => loader.addDependency(fileURLToPath(file)))
    content = result.css
  } else if (lang === 'styl' || lang === 'stylus') {
    content = renderStylus(projectRequire('stylus'), content, resourcePath, mpx.defs, file => loader.addDependency(file))
  } else if (lang === 'less') {
    const result = await projectRequire('less').render(content, { filename: resourcePath })
    result.imports.forEach(file => loader.addDependency(file))
    content = result.css
  }
  const { queryObj } = parseRequest(request)
  return new Promise((resolve, reject) => {
    const facade = createFacade(loader, {
      resource: addQuery(resourcePath, queryObj),
      resourcePath,
      async: () => (error, css, map) => error ? reject(error) : resolve([[null, css, null, map]])
    })
    compileStyle.call(facade, content)
  })
}

module.exports = function reactLoader (source) {
  const callback = this.async()
  const mpx = this.getMpx()
  const resource = addQuery(this.resource, {}, false, 'mpxReactMain')
  const { queryObj, rawResourcePath } = parseRequest(resource)
  const context = path.dirname(rawResourcePath)
  const entry = mpx.graph.findEntry(resource)
  const srcMode = queryObj.srcMode || entry?.srcMode || mpx.srcMode
  const ctorType = queryObj.isPage ? 'page' : queryObj.isComponent ? 'component' : entry?.type || 'component'
  const resourcePath = this.resourcePath
  const parts = parseComponent(stripCondition(source, mpx.defs, rawResourcePath), {
    filePath: resourcePath,
    mode: mpx.mode,
    env: mpx.env,
    needMap: this.sourceMap
  })
  const moduleId = mpx.getModuleId(resource, ctorType === 'app')
  const autoScope = matchCondition(rawResourcePath, mpx.autoScopeRules)
  this.cacheable(false)

  // The legacy processors produce build records independently of the bundler. The entry graph already tracks them.
  const loaderContext = createFacade(this, {
    resource,
    context,
    remainingRequest: resource,
    _module: { addPresentationalDependency () {} },
    _compiler: { inputFileSystem: mpx.inputFileSystem },
    _compilation: { outputOptions: { publicPath: '' } },
    resolve: mpx.resolveForCompiler,
    importModule: request => readStyle(this, mpx, parts.styles[parseRequest(request).queryObj.index || 0], request)
  })
  this.addDependency(mpx.appInfo.resourcePath || resourcePath)
  const emitWarning = message => this.emitWarning(message instanceof Error ? message : new Error(message))
  const emitError = message => this.emitError(message instanceof Error ? message : new Error(message))
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
    return processReact(Object.assign({}, jsonInfo, {
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
  })
}
