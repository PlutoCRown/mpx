const path = require('node:path')
const hash = require('hash-sum')
const { isMiniProgram } = require('@mpxjs/webpack-plugin/lib/utils/env')
const config = require('@mpxjs/webpack-plugin/lib/config')
const { MPX_APP_MODULE_ID } = require('@mpxjs/webpack-plugin/lib/utils/const')
const processDefs = require('@mpxjs/webpack-plugin/lib/utils/process-defs')
const addQuery = require('@mpxjs/webpack-plugin/lib/utils/add-query')
const parseRequest = require('@mpxjs/webpack-plugin/lib/utils/parse-request')
const { discoverEntries } = require('./entries')

const pluginName = 'MpxMiniProgram'
const nativeRequireAsync = '__MPX_NATIVE_REQUIRE_ASYNC__'

function entryRequests (configEntry) {
  const entries = {}
  Object.keys(configEntry).forEach((name) => {
    const value = configEntry[name]
    const imports = value && typeof value === 'object' && !Array.isArray(value) ? value.import : value
    const request = Array.isArray(imports) ? imports[0] : imports
    if (!request || (Array.isArray(imports) && imports.length !== 1)) {
      throw new Error(`[Mpx] Entry "${name}" must specify a single Mpx or native entry file`)
    }
    const { queryObj } = parseRequest(request)
    entries[name] = {
      request,
      type: queryObj.isPlugin ? 'plugin' : queryObj.isPage ? 'page' : queryObj.isComponent ? 'component' : 'app'
    }
  })
  return entries
}

function relativeRequire (asset, target) {
  const relative = path.posix.relative(path.posix.dirname(asset), target)
  return relative.startsWith('.') ? relative : './' + relative
}

function preloadEntryChunks (compilation, rspack) {
  const install = '__webpack_require__.C(exports)'
  compilation.entrypoints.forEach((entrypoint) => {
    const entry = entrypoint.getEntrypointChunk()
    const runtime = entrypoint.getRuntimeChunk()
    const dependencies = entrypoint.chunks.filter(chunk => chunk.id !== entry.id && chunk.id !== runtime?.id)
    for (const name of entry.files) {
      if (!name.endsWith('.js')) continue
      const imports = []
      dependencies.forEach(chunk => chunk.files.forEach(file => {
        if (file.endsWith('.js')) imports.push(`__webpack_require__.C(require(${JSON.stringify(relativeRequire(name, file))}));`)
      }))
      if (!imports.length) continue
      const { source } = compilation.getAsset(name)
      const offset = source.source().toString().lastIndexOf(install)
      if (offset === -1) {
        compilation.errors.push(new Error(`[Mpx] Cannot preload native shared chunks for ${name}`))
        continue
      }
      // Native mini-program packagers discover synchronous dependencies from literal requests.
      const updated = new rspack.sources.ReplaceSource(source)
      updated.insert(offset, imports.join('\n') + '\n')
      compilation.updateAsset(name, updated)
    }
  })
}

function createBuildState (graph, options) {
  const { mode, projectRoot, pathHashMode, customComponentModuleId } = options
  const asyncPaths = new Map()
  const asyncEntries = new Map()
  const asyncRequest = (context, request, { packageRoot }) => {
    if (!packageRoot || !['wx', 'ali', 'tt'].includes(mode) || options.disableRequireAsync) return
    const resolved = graph.resolveSync(context, request)
    const name = `${packageRoot}/mpx-async/${hash(resolved)}`
    const target = name + '.js'
    const marker = `__MPX_ASYNC_${hash(target)}__`
    asyncPaths.set(marker, target)
    asyncEntries.set(name, { request: addQuery(resolved, { mpxPackage: packageRoot }), packageRoot })
    return `${nativeRequireAsync}(${JSON.stringify(marker)})`
  }

  return {
    graph,
    options,
    asyncPaths,
    asyncEntries,
    asyncRequest,
    assetsSources: new Map(),
    defs: processDefs(options.defs),
    wxsContentMap: {},
    getModuleId (resourcePath, isApp) {
      if (isApp) return MPX_APP_MODULE_ID
      return (customComponentModuleId && customComponentModuleId(resourcePath)) ||
        '_' + hash(pathHashMode === 'relative' ? path.relative(projectRoot, resourcePath) : resourcePath)
    }
  }
}

class MiniProgramPlugin {
  constructor (options, configEntry) {
    this.options = options
    this.rootEntries = entryRequests(configEntry)
  }

  getEntryConfig () {
    const entries = {}
    this.build.graph.entries.forEach((entry, name) => {
      if (entry.type === 'plugin') return
      const isExport = entry.type === 'export'
      entries[name] = {
        import: [isExport ? entry.request : addQuery(entry.request || entry.resourcePath, { mpxEntry: name })],
        library: isExport ? { type: 'commonjs2' } : undefined,
        runtime: this.runtimeName(entry.packageRoot)
      }
    })
    return entries
  }

  runtimeName (packageRoot) {
    return this.build.graph.independentPackages.has(packageRoot) ? `${packageRoot}/_mpx/runtime` : '_mpx/runtime'
  }

  packageOfChunk (name) {
    const { graph, asyncEntries } = this.build
    return graph.entries.get(name)?.packageRoot || asyncEntries.get(name)?.packageRoot || ''
  }

  canShareChunk (name) {
    return !!(this.build.graph.entries.has(name) || this.build.asyncEntries.has(name)) &&
      !this.build.graph.independentPackages.has(this.packageOfChunk(name))
  }

  sharedChunkName (chunks) {
    const roots = new Set(chunks.map(chunk => this.packageOfChunk(chunk.name)))
    const [root] = roots
    return roots.size === 1 && root ? `${root}/_mpx/shared` : '_mpx/shared'
  }

  apply (compiler) {
    const options = this.options
    const rspack = compiler.rspack
    const platform = config[options.mode]
    compiler.hooks.beforeCompile.tapPromise(pluginName, async () => {
      const graph = await discoverEntries(this.rootEntries, Object.assign({}, options, {
        context: compiler.context,
        production: compiler.options.mode === 'production',
        resolve: Object.assign({}, compiler.options.resolve, {
          extensions: this.resolve.extensions,
          extensionAlias: this.resolve.extensionAlias
        })
      }))
      this.build = createBuildState(graph, options)
    })

    compiler.hooks.thisCompilation.tap(pluginName, (compilation) => {
      const current = this.build
      if (!current) return
      const { graph, asyncPaths } = current
      compilation.mpxBuildInfo = {
        mode: options.mode,
        packageRoots: [...new Set([...graph.entries.values()].map(entry => entry.packageRoot).filter(Boolean))],
        entries: graph.entries,
        independentPackages: graph.independentPackages,
        assetsSources: current.assetsSources
      }
      current.buildInfo = compilation.mpxBuildInfo
      graph.fileDependencies.forEach(file => compilation.fileDependencies.add(file))
      graph.contextDependencies.forEach(dir => compilation.contextDependencies.add(dir))
      graph.missingDependencies.forEach(file => compilation.missingDependencies.add(file))
      graph.warnings.forEach(warning => compilation.warnings.push(warning))
      rspack.NormalModule.getCompilationHooks(compilation).loader.tap(pluginName, (loader) => {
        loader.mpxBuild = current
      })
      compilation.hooks.processAssets.tap({
        name: pluginName,
        stage: rspack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS
      }, () => {
        if (isMiniProgram(options.mode)) {
          graph.assets.forEach(({ source }, name) => compilation.emitAsset(name, new rspack.sources.RawSource(source)))
          graph.entries.forEach((entry, name) => {
            if (entry.json && entry.type !== 'export') compilation.emitAsset(name + platform.typeExtMap.json, new rspack.sources.RawSource(JSON.stringify(entry.json, null, 2)))
          })
          preloadEntryChunks(compilation, rspack)
        }
        if (!asyncPaths.size) return
        compilation.getAssets().forEach(({ name, source }) => {
          if (!name.endsWith('.js')) return
          const code = source.source().toString()
          const matches = code.matchAll(/__MPX_NATIVE_REQUIRE_ASYNC__|__MPX_ASYNC_[a-z0-9]+__/g)
          const updated = new rspack.sources.ReplaceSource(source)
          let changed = false
          for (const match of matches) {
            const target = asyncPaths.get(match[0])
            const replacement = match[0] === nativeRequireAsync
              ? 'require.async'
              : target && JSON.stringify(relativeRequire(name, target)).slice(1, -1)
            if (!replacement) continue
            updated.replace(match.index, match.index + match[0].length - 1, replacement)
            changed = true
          }
          if (changed) compilation.updateAsset(name, updated)
        })
      })
    })

    compiler.hooks.finishMake.tapPromise(pluginName, async (compilation) => {
      const addEntry = (name, request, packageRoot) => new Promise((resolve, reject) => {
        const entryOptions = { name, library: { type: 'commonjs2' }, runtime: this.runtimeName(packageRoot) }
        const dependency = rspack.EntryPlugin.createDependency(request, entryOptions)
        compilation.addEntry(compiler.context, dependency, entryOptions, (err) => err ? reject(err) : resolve())
      })
      const added = new Set()
      for (const [name, { request, packageRoot }] of this.build.asyncEntries) {
        if (added.has(name)) continue
        added.add(name)
        await addEntry(name, request, packageRoot)
      }
    })
  }
}

module.exports = MiniProgramPlugin
module.exports.relativeRequire = relativeRequire
