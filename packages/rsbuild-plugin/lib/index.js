const config = require('@mpxjs/webpack-plugin/lib/config')
const { isReact } = require('@mpxjs/webpack-plugin/lib/utils/env')
const normalizeOptions = require('./options')
const configureResolveExtensions = require('./resolve-extensions')

function pluginMpx (rawOptions = {}) {
  return {
    name: 'mpx',
    setup (api) {
      const options = normalizeOptions(rawOptions, api.context.rootPath)
      const defines = Object.fromEntries(Object.entries(options.defs).map(([key, value]) => [key, JSON.stringify(value)]))
      api.modifyRsbuildConfig((rsbuildConfig) => {
        rsbuildConfig.source ||= {}
        rsbuildConfig.source.define = Object.assign({}, rsbuildConfig.source.define, defines)
      })

      if (options.mode === 'web') return require('./web-config')(api, options)
      if (isReact(options.mode)) return require('./react-config')(api, options)
      const platform = config[options.mode]
      if (!platform || !platform.typeExtMap || !platform.wxs) {
        throw new Error(`[Mpx] Unsupported Rsbuild target: ${options.mode}`)
      }

      api.modifyRsbuildConfig((rsbuildConfig) => {
        rsbuildConfig.html = Object.assign({}, rsbuildConfig.html, { inject: false })
        rsbuildConfig.tools = Object.assign({}, rsbuildConfig.tools, { htmlPlugin: false })
        rsbuildConfig.output ||= {}
        rsbuildConfig.output.minify ??= true
      })

      api.modifyRspackConfig((rspackConfig, { rspack, environment }) => {
        const MiniProgramPlugin = require('./mini-plugin')
        const entry = rspackConfig.entry
        if (!entry || typeof entry !== 'object') {
          throw new Error('[Mpx] Set source.entry to the mini-program entry files')
        }
        const mini = new MiniProgramPlugin(options, entry)
        rspackConfig.entry = () => mini.getEntryConfig()
        rspackConfig.target = ['web', 'es5']
        rspackConfig.output = Object.assign({}, rspackConfig.output, {
          filename: '[name].js',
          chunkFilename: '[name].js',
          chunkFormat: 'commonjs',
          chunkLoading: 'require',
          asyncChunks: false,
          enabledLibraryTypes: ['commonjs2'],
          clean: environment.config.output.cleanDistPath !== false,
          globalObject: 'globalThis',
          publicPath: ''
        })
        rspackConfig.node = Object.assign({}, rspackConfig.node, { global: true })
        rspackConfig.resolve ||= {}
        const processShim = require.resolve('process/browser')
        rspackConfig.resolve.fallback = Object.assign({ process: processShim }, rspackConfig.resolve.fallback)
        mini.resolve = Object.assign({}, rspackConfig.resolve)
        configureResolveExtensions(rspackConfig.resolve, options)
        rspackConfig.optimization = Object.assign({}, rspackConfig.optimization, {
          splitChunks: {
            cacheGroups: {
              default: false,
              defaultVendors: false,
              mpxShared: {
                chunks: chunk => mini.canShareChunk(chunk.name),
                minChunks: 2,
                minSize: 0,
                name: (module, chunks) => mini.sharedChunkName(chunks)
              }
            }
          },
          runtimeChunk: false,
          concatenateModules: false,
          moduleIds: 'deterministic'
        })
        rspackConfig.module ||= {}
        rspackConfig.module.rules ||= []
        rspackConfig.module.rules.push({
          resourceQuery: /(?:^|[?&])mpxEntry=/,
          type: 'javascript/auto',
          use: [require.resolve('./mini-loader')]
        }, {
          resourceQuery: /(?:^|[?&])mpxScript(?:[=&]|$)/,
          enforce: 'pre',
          type: 'javascript/auto',
          use: [require.resolve('./script-loader')]
        }, {
          resourceQuery: /(?:^|[?&])mpxWxs(?:[=&]|$)/,
          enforce: 'pre',
          type: 'javascript/auto',
          use: [require.resolve('./wxs-loader')]
        }, {
          test: /\.[cm]?[jt]sx?$/,
          resourceQuery: { not: [/(?:^|[?&])mpxEntry=/, /(?:^|[?&])mpxScript(?:[=&]|$)/] },
          enforce: 'pre',
          use: [require.resolve('./script-loader')]
        })
        rspackConfig.plugins ||= []
        rspackConfig.plugins.push(mini, new rspack.ProvidePlugin({
          mpxGlobal: require.resolve('@mpxjs/webpack-plugin/lib/runtime/mpxGlobal'),
          process: processShim
        }))
      })
    }
  }
}

module.exports = { pluginMpx }
