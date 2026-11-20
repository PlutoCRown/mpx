const path = require('node:path')
const fs = require('node:fs')
const hash = require('hash-sum')
const parseRequest = require('@mpxjs/webpack-plugin/lib/utils/parse-request')
const addQuery = require('@mpxjs/webpack-plugin/lib/utils/add-query')
const { MPX_APP_MODULE_ID } = require('@mpxjs/webpack-plugin/lib/utils/const')
const processDefs = require('@mpxjs/webpack-plugin/lib/utils/process-defs')
const { discoverEntries } = require('./entries')
const configureResolveExtensions = require('./resolve-extensions')
const MpxWebSsrPlugin = require('./web-ssr')
const { configurePostcss, extendStyleRules } = require('./web-style')

const pluginName = 'MpxWeb'
const mpxWebMain = /[?&]mpxWebMain(?:[=&]|$)/
const mpxSfc = /\.mpx$/
const mpxWxs = /[?&]wxsModule(?:[=&]|$)/
const mpxScriptBlock = /(?=.*[?&]mpx(?:[=&]|$))(?=.*[?&]type=script(?:&|$))/
const vueBlock = /[?&]vue(?:[=&]|$)/

class MpxWebPlugin {
  constructor (options, rootEntries) {
    this.options = options
    this.rootEntries = rootEntries
  }

  apply (compiler) {
    const options = this.options
    let current
    compiler.hooks.beforeCompile.tapPromise(pluginName, async () => {
      const resolve = Object.assign({}, compiler.options.resolve)
      delete resolve.extensionAlias
      resolve.extensions = resolve.extensions?.filter(extension => !/\.[^.]+\.(?:[cm]?[jt]sx?|mpx|vue|json)$/.test(extension))
      const graph = await discoverEntries(this.rootEntries, Object.assign({}, options, {
        context: compiler.context,
        resolve,
        production: compiler.options.mode === 'production'
      }))
      const pathHash = file => hash(options.pathHashMode === 'relative' ? path.relative(options.projectRoot, file) : file)
      const getModuleId = (file, app) => app ? MPX_APP_MODULE_ID : options.customComponentModuleId?.(file) || '_' + pathHash(file)
      const pagesMap = {}
      const componentsMap = {}
      let app
      graph.entries.forEach(entry => {
        if (entry.type === 'app') app = entry
        if (entry.type === 'page') pagesMap[entry.logicalPath] = entry.name
        if (entry.type === 'component') componentsMap[entry.logicalPath] = entry.name
      })
      const resolveForCompiler = (context, request, callback) => {
        graph.resolve(context, request).then(result => callback(null, result || false), callback)
      }
      const globalComponents = {}
      const globalComponentsInfo = {}
      if (app) {
        const appDir = path.dirname(app.resourcePath)
        const components = Object.entries(app.sourceJSON.usingComponents || {})
        await Promise.all(components.map(async ([name, request]) => {
          const absolute = await graph.resolve(appDir, request, { optional: true })
          if (absolute) {
            globalComponents[name] = absolute
            globalComponentsInfo[name] = { mid: getModuleId(parseRequest(absolute).rawResourcePath) }
          }
        }))
      }
      current = Object.assign({}, options, {
        graph,
        options,
        defs: processDefs(options.defs),
        pagesMap,
        componentsMap,
        appInfo: app ? { name: app.name, resourcePath: app.resourcePath } : {},
        webConfig: options.webConfig,
        inputFileSystem: fs,
        resolveForCompiler,
        asyncRequest () {},
        supportRequireAsync: !options.disableRequireAsync,
        globalComponents,
        globalComponentsInfo,
        wxsContentMap: {},
        loaderContentCache: new Map(),
        pathHash,
        getModuleId,
        getOutputPath: graph.getOutputPath,
        getPageOutputPath: graph.getPageOutputPath
      })
    })
    compiler.hooks.thisCompilation.tap(pluginName, compilation => {
      const graph = current.graph
      graph.fileDependencies.forEach(file => compilation.fileDependencies.add(file))
      graph.contextDependencies.forEach(dir => compilation.contextDependencies.add(dir))
      graph.missingDependencies.forEach(file => compilation.missingDependencies.add(file))
      graph.warnings.forEach(warning => compilation.warnings.push(warning))
      compiler.rspack.NormalModule.getCompilationHooks(compilation).loader.tap(pluginName, loader => {
        loader.getMpx = () => current
        loader.mpxBuild = current
      })
    })
  }
}

function extendVueRules (rules) {
  let found = false
  rules.forEach(rule => {
    const use = Array.isArray(rule.use) ? rule.use : [rule.use]
    if (use.some(item => item && /[/\\]vue-loader[/\\]/.test(item.loader || item))) {
      rule.test = /\.(vue|mpx)$/
      rule.resourceQuery = rule.resourceQuery
        ? { and: [rule.resourceQuery, { not: [mpxWebMain, mpxWxs, mpxScriptBlock] }] }
        : { not: [mpxWebMain, mpxWxs, mpxScriptBlock] }
      found = true
    }
    if (rule.oneOf && extendVueRules(rule.oneOf)) found = true
  })
  return found
}

function normalizeEntries (entries) {
  const roots = {}
  Object.entries(entries || {}).forEach(([name, current]) => {
    const entry = typeof current === 'object' && !Array.isArray(current) ? current : { import: current }
    const imports = Array.isArray(entry.import) ? entry.import : [entry.import]
    entry.import = imports.map(request => {
      if (!request || !mpxSfc.test(parseRequest(request).rawResourcePath)) return request
      const { queryObj } = parseRequest(request)
      const type = queryObj.isComponent ? 'component' : queryObj.isPage ? 'page' : 'app'
      roots[name] = { request, type }
      return type === 'app' ? addQuery(request, { mpxWebMain: true }) : request
    })
    entries[name] = entry
  })
  return roots
}

module.exports = function setupWeb (api, options) {
  const vuePlugin = require('@rsbuild/plugin-vue2').pluginVue2()
  const stylusPlugin = require('@rsbuild/plugin-stylus').pluginStylus()
  if (!api.isPluginExists(vuePlugin.name)) vuePlugin.setup(api)
  if (!api.isPluginExists(stylusPlugin.name)) stylusPlugin.setup(api)

  api.modifyRsbuildConfig(config => {
    const el = options.webConfig?.el
    const mountId = el?.startsWith('#') ? el.slice(1) : !config.html?.mountId || config.html.mountId === 'root' ? 'app' : config.html.mountId
    config.html = Object.assign({}, config.html, { mountId })
    configurePostcss(config)
  })

  api.modifyRspackConfig((rspackConfig, { rspack, environment }) => {
    const isServer = environment.config.output.target === 'node'
    const environments = api.getNormalizedConfig().environments
    const browser = Object.values(environments).find(env => env.output.target === 'web')
    const isSSR = isServer || Object.values(environments).some(env => env.output.target === 'node')
    const webConfig = Object.assign({
      el: '#' + (browser?.html.mountId || 'app'),
      useSSR: isSSR
    }, options.webConfig)
    const rootEntries = normalizeEntries(rspackConfig.entry)
    const rules = rspackConfig.module.rules
    extendStyleRules(rules, options)
    if (!extendVueRules(rules)) throw new Error('[Mpx] No Vue 2 loader rule found for Mpx Web')
    rules.push({
      test: mpxSfc,
      resourceQuery: { not: [mpxWxs, mpxScriptBlock] },
      enforce: 'pre',
      type: 'javascript/auto',
      use: [require.resolve('./web-loader')]
    }, {
      test: /\.[cm]?[jt]sx?$/,
      resourceQuery: { not: [vueBlock] },
      use: [require.resolve('./script-loader')]
    }, {
      test: /\.(?:css|s[ac]ss|less|styl(?:us)?)$/,
      enforce: 'pre',
      use: [require.resolve('./web-style-loader')]
    }, {
      test: /\.(wxs|sjs|qs|jds|dds|ks|qjs)$/,
      type: 'javascript/auto',
      use: [require.resolve('@mpxjs/webpack-plugin/lib/wxs/pre-loader')]
    }, {
      resourceQuery: mpxWxs,
      type: 'javascript/auto',
      use: [require.resolve('@mpxjs/webpack-plugin/lib/wxs/pre-loader')]
    })
    rspackConfig.node = Object.assign({}, rspackConfig.node, { global: true })
    rspackConfig.resolve ||= {}
    configureResolveExtensions(rspackConfig.resolve, options)
    if (isServer) {
      rspackConfig.output.library = { type: 'commonjs2' }
      rspackConfig.output.chunkLoading = 'require'
      rspackConfig.output.chunkFormat = 'commonjs'
      rspackConfig.optimization = Object.assign({}, rspackConfig.optimization, { splitChunks: false, runtimeChunk: false })
    }
    if (isSSR || webConfig.useSSR) rspackConfig.plugins.push(new MpxWebSsrPlugin(isServer))
    rspackConfig.plugins.push(new MpxWebPlugin(Object.assign({}, options, { webConfig }), rootEntries))
    rspackConfig.plugins.push(new rspack.ProvidePlugin({
      mpxGlobal: require.resolve('@mpxjs/webpack-plugin/lib/runtime/mpxGlobal')
    }))
  })
}
