const fs = require('node:fs')
const path = require('node:path')
const hash = require('hash-sum')
const addQuery = require('@mpxjs/webpack-plugin/lib/utils/add-query')
const parseRequest = require('@mpxjs/webpack-plugin/lib/utils/parse-request')
const processDefs = require('@mpxjs/webpack-plugin/lib/utils/process-defs')
const { matchCondition } = require('@mpxjs/webpack-plugin/lib/utils/match-condition')
const { MPX_APP_MODULE_ID } = require('@mpxjs/webpack-plugin/lib/utils/const')
const { discoverEntries } = require('./entries')
const installRuntime = require('./react-runtime')
const configureResolveExtensions = require('./resolve-extensions')

const pluginName = 'MpxReactNative'
const sfc = /\.mpx$/
const scriptBlock = /[?&]type=script(?:&|$)/
const wxsQuery = /[?&]wxsModule(?:[=&]|$)/
const rnExternals = [
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  /^react-native(?:\/|$)/,
  '@d11/react-native-fast-image',
  '@react-native-async-storage/async-storage',
  '@react-native-community/netinfo',
  '@react-navigation/native',
  '@react-navigation/native-stack',
  'react-native-ble-manager',
  'react-native-device-info',
  'react-native-gesture-handler',
  'react-native-gesture-handler/DrawerLayout',
  'react-native-gesture-handler/Swipeable',
  'react-native-get-location',
  'react-native-haptic-feedback',
  'react-native-linear-gradient',
  'react-native-reanimated',
  'react-native-safe-area-context',
  'react-native-screens',
  'react-native-svg',
  'react-native-svg/css',
  'react-native-video',
  'react-native-vision-camera',
  'react-native-webview',
  'react-native-wifi-reborn'
]

function normalizeEntries (entries) {
  const roots = {}
  for (const [name, value] of Object.entries(entries || {})) {
    const entry = typeof value === 'object' && !Array.isArray(value) ? value : { import: value }
    const imports = Array.isArray(entry.import) ? entry.import : [entry.import]
    entry.import = imports.map(request => {
      if (!request || !sfc.test(parseRequest(request).rawResourcePath)) return request
      const { queryObj } = parseRequest(request)
      const type = queryObj.isComponent ? 'component' : queryObj.isPage ? 'page' : 'app'
      if (roots[name]) throw new Error(`[Mpx] RN entry "${name}" must have a single Mpx app, page or component`)
      roots[name] = { request, type }
      entry.library ||= { type: 'commonjs2', export: 'default' }
      return type === 'app' ? addQuery(request, { mpxReactMain: true }) : request
    })
    entries[name] = entry
  }
  return roots
}

class MpxReactPlugin {
  constructor (options, roots) {
    this.options = options
    this.roots = roots
  }

  apply (compiler) {
    const { options } = this
    const { rspack } = compiler
    let current
    compiler.hooks.beforeCompile.tapPromise(pluginName, async () => {
      const resolve = Object.assign({}, compiler.options.resolve)
      delete resolve.extensionAlias
      delete resolve.plugins
      resolve.extensions = resolve.extensions?.filter(ext => !/\.[^.]+\.(?:[cm]?[jt]sx?|mpx|vue|json)$/.test(ext))
      const graph = await discoverEntries(this.roots, Object.assign({}, options, {
        context: compiler.context,
        resolve,
        production: compiler.options.mode === 'production'
      }))
      const pathHash = file => hash(options.pathHashMode === 'relative' ? path.relative(options.projectRoot, file) : file)
      const getModuleId = (request, app) => {
        if (app) return MPX_APP_MODULE_ID
        const { resourcePath } = parseRequest(request)
        return options.customComponentModuleId?.(resourcePath) || '_' + pathHash(resourcePath)
      }
      const getOutputPath = (file, type, { conflictPath } = {}) => {
        const id = pathHash(file)
        if (conflictPath) return conflictPath + id
        const name = path.parse(file).name
        return options.customOutputPath?.(type, name, id, '', file) || `${type}s/${name}${id}/index`
      }
      const pagesMap = {}
      const componentsMap = {}
      const pageConfigsMap = Object.create(null)
      let app
      graph.entries.forEach(entry => {
        if (entry.type === 'app') app = entry
        if (entry.type === 'page') {
          pagesMap[entry.logicalPath] = entry.name
          const pageConfig = Object.assign({}, entry.json)
          delete pageConfig.usingComponents
          if (Object.keys(pageConfig).length) pageConfigsMap[entry.name] = pageConfig
        }
        if (entry.type === 'component') componentsMap[entry.logicalPath] = entry.name
      })
      const globalComponents = {}
      const globalComponentsInfo = {}
      if (app) {
        const appDir = path.dirname(app.resourcePath)
        await Promise.all(Object.entries(app.sourceJSON.usingComponents || {}).map(async ([name, request]) => {
          const absolute = await graph.resolve(appDir, request, { optional: true })
          if (absolute) {
            globalComponents[name] = absolute
            const resourcePath = parseRequest(absolute).resourcePath
            globalComponentsInfo[name] = {
              mid: getModuleId(absolute),
              hasVirtualHost: matchCondition(resourcePath, options.autoVirtualHostRules)
            }
          }
        }))
      }
      current = Object.assign({}, options, {
        options,
        graph,
        pagesMap,
        componentsMap,
        pageConfigsMap,
        appInfo: app ? { name: app.name, resourcePath: app.resourcePath } : {},
        webConfig: options.webConfig || {},
        defs: processDefs(options.defs),
        inputFileSystem: fs,
        globalComponents,
        globalComponentsInfo,
        wxsContentMap: {},
        loaderContentCache: new Map(),
        supportRequireAsync: !options.disableRequireAsync && options.rnConfig.supportSubpackage,
        getModuleId,
        pathHash,
        getOutputPath,
        resolveForCompiler (context, request, callback) {
          graph.resolve(context, request, { optional: true }).then(result => callback(null, result || false), callback)
        },
        asyncRequest () {}
      })
    })

    compiler.hooks.thisCompilation.tap(pluginName, compilation => {
      const { graph } = current
      graph.fileDependencies.forEach(file => compilation.fileDependencies.add(file))
      graph.contextDependencies.forEach(dir => compilation.contextDependencies.add(dir))
      graph.missingDependencies.forEach(file => compilation.missingDependencies.add(file))
      graph.warnings.forEach(warning => compilation.warnings.push(warning))
      rspack.NormalModule.getCompilationHooks(compilation).loader.tap(pluginName, loader => {
        loader.getMpx = () => current
        loader.mpxBuild = current
      })
      installRuntime(rspack, compilation, current.pageConfigsMap, compiler.options.mode !== 'production')
    })
  }
}

module.exports = function setupReact (api, config) {
  const rnConfig = Object.assign({ supportSubpackage: true, asyncCommonSubpackage: true }, config.rnConfig)
  const options = Object.assign({ externalClasses: ['custom-class', 'i-class'] }, config, { rnConfig })
  if (rnConfig.transSubpackageRules === undefined) rnConfig.transSubpackageRules = options.transSubpackageRules

  api.modifyRsbuildConfig(rsbuildConfig => {
    rsbuildConfig.tools = Object.assign({}, rsbuildConfig.tools, { htmlPlugin: false })
  })

  api.modifyRspackConfig((rspackConfig, { rspack }) => {
    const roots = normalizeEntries(rspackConfig.entry)
    const app = Object.keys(roots).find(name => roots[name].type === 'app') || Object.keys(rspackConfig.entry)[0]
    const sharedChunk = rnConfig.asyncCommonSubpackage
      ? { name: 'async-common/index', chunks: 'async' }
      : { name: app, chunks: 'all' }
    rspackConfig.target = ['web', 'es2018']
    rspackConfig.output = Object.assign({}, rspackConfig.output, {
      filename: '[name].js',
      chunkFilename: '[name].js',
      chunkLoading: 'jsonp',
      chunkFormat: 'array-push',
      globalObject: 'global',
      publicPath: options.publicPath || '/',
      library: { type: 'commonjs2' }
    })
    rspackConfig.externalsType = 'commonjs'
    rspackConfig.externals = [].concat(rspackConfig.externals || [], options.externals || [], rnExternals)
    rspackConfig.optimization = Object.assign({}, rspackConfig.optimization, {
      runtimeChunk: false,
      splitChunks: {
        cacheGroups: {
          default: false,
          defaultVendors: false,
          mpxShared: Object.assign({ minSize: 1, minChunks: 2 }, sharedChunk)
        }
      }
    })
    rspackConfig.resolve ||= {}
    configureResolveExtensions(rspackConfig.resolve, options)
    rspackConfig.module.rules.push({
      test: sfc,
      resourceQuery: { not: [scriptBlock, wxsQuery] },
      type: 'javascript/auto',
      use: [require.resolve('./react-loader')]
    }, {
      test: /\.[cm]?[jt]sx?$/,
      enforce: 'post',
      use: [require.resolve('./script-loader')]
    }, {
      test: /\.(wxs|sjs|qs|jds|dds|ks|qjs)$/,
      type: 'javascript/auto',
      use: [require.resolve('@mpxjs/webpack-plugin/lib/wxs/pre-loader')]
    }, {
      resourceQuery: wxsQuery,
      type: 'javascript/auto',
      use: [require.resolve('@mpxjs/webpack-plugin/lib/wxs/pre-loader')]
    })
    rspackConfig.plugins.push(new MpxReactPlugin(options, roots), new rspack.ProvidePlugin({
      mpxGlobal: require.resolve('@mpxjs/webpack-plugin/lib/runtime/mpxGlobal')
    }), new rspack.DefinePlugin({ __mpx_wxs__: 'false' }))
  })
}
