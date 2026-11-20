const fs = require('fs')
const path = require('path')
const { ResolverFactory } = require('enhanced-resolve')
const JSON5 = require('json5')
const hash = require('hash-sum')
const { urlToRequest } = require('loader-utils')
const parseComponent = require('@mpxjs/webpack-plugin/lib/parser')
const config = require('@mpxjs/webpack-plugin/lib/config')
const getRulesRunner = require('@mpxjs/webpack-plugin/lib/platform')
const evalJSONJS = require('@mpxjs/webpack-plugin/lib/utils/eval-json-js')
const parseRequest = require('@mpxjs/webpack-plugin/lib/utils/parse-request')
const addQuery = require('@mpxjs/webpack-plugin/lib/utils/add-query')
const isUrlRequest = require('@mpxjs/webpack-plugin/lib/utils/is-url-request')
const getBuildInTagComponent = require('@mpxjs/webpack-plugin/lib/utils/get-build-tag-component')
const { capitalToHyphen } = require('@mpxjs/webpack-plugin/lib/utils/string')
const { matchCondition } = require('@mpxjs/webpack-plugin/lib/utils/match-condition')
const { isPartialCompileExcluded } = require('@mpxjs/webpack-plugin/lib/utils/partial-compile-rules')
const { isMiniProgram, isReact } = require('@mpxjs/webpack-plugin/lib/utils/env')
const { JSON_JS_EXT } = require('@mpxjs/webpack-plugin/lib/utils/const')
const AddModePlugin = require('@mpxjs/webpack-plugin/lib/resolver/AddModePlugin')
const AddEnvPlugin = require('@mpxjs/webpack-plugin/lib/resolver/AddEnvPlugin')
const PackageEntryPlugin = require('@mpxjs/webpack-plugin/lib/resolver/PackageEntryPlugin')
const FixDescriptionInfoPlugin = require('@mpxjs/webpack-plugin/lib/resolver/FixDescriptionInfoPlugin')
const resolveTabBarPath = require('@mpxjs/webpack-plugin/lib/utils/resolve-tab-bar-path')

const defaultPage = require.resolve('@mpxjs/webpack-plugin/lib/runtime/components/wx/default-page.mpx')
const defaultComponent = require.resolve('@mpxjs/webpack-plugin/lib/runtime/components/wx/default-component.mpx')
const extensions = ['.mpx', '.js', '.ts', '.json', '.vue', '.wxml', '.wxss']
const cssExtensions = { less: '.less', stylus: '.styl', sass: '.sass', scss: '.scss' }
const toPosix = value => value.replace(/\\/g, '/')
const withoutExtension = file => file.slice(0, file.length - path.extname(file).length)
const inside = (relativePath) => relativePath !== '..' && !relativePath.startsWith('..' + path.sep) && !path.isAbsolute(relativePath)
const isMissing = error => error.message.startsWith("Can't resolve ")

function createResolver (options, dependencies) {
  const { mode, env, projectRoot } = options
  const resolveOptions = options.resolve || {}
  const fileConditionRules = options.fileConditionRules || { include: () => true }
  const plugins = [new AddModePlugin('before-file', mode, {
    fileConditionRules,
    defaultMode: mode === 'android' || mode === 'harmony' ? 'ios' : ''
  }, 'file')]
  if (env) plugins.push(new AddEnvPlugin('before-file', env, fileConditionRules, 'file'))
  plugins.push(new PackageEntryPlugin('before-file', options.miniNpmPackages || [], options.normalNpmPackages || [], 'file'), new FixDescriptionInfoPlugin())

  const resolvers = new Map()
  const getResolver = (dependencyType) => {
    if (dependencyType === 'export' || dependencyType === 'async') dependencyType = 'import'
    if (!resolvers.has(dependencyType)) {
      const dependency = dependencyType === 'import' ? 'esm' : dependencyType === 'require' ? 'commonjs' : ''
      const overrides = resolveOptions.byDependency?.[dependency] || {}
      const conditions = (resolveOptions.conditionNames || []).filter(value => value !== '...')
      const conditionNames = [...new Set((overrides.conditionNames || []).filter(value => value !== '...').concat(conditions, dependencyType || ['import', 'require'], 'default'))]
      const resolver = ResolverFactory.createResolver(Object.assign({}, resolveOptions, overrides, {
        conditionNames,
        extensions: [...new Set(extensions.concat((overrides.extensions || resolveOptions.extensions || []).filter(value => value !== '...')))],
        roots: [projectRoot],
        fileSystem: fs,
        useSyncFileSystemCalls: true,
        plugins
      }))
      resolvers.set(dependencyType, resolver)
    }
    return resolvers.get(dependencyType)
  }

  const prepare = (request, native) => {
    if (native) return urlToRequest(request)
    return request.startsWith('~') ? request.slice(1) : request
  }
  const resolveWithInfo = (context, request, { native = false, optional = false, tracked = true, dependencyType } = {}) => new Promise((resolve, reject) => {
    const { queryObj } = parseRequest(request)
    getResolver(dependencyType).resolve({}, queryObj.context || context, prepare(request, native), tracked ? dependencies : {}, (error, resource, info) => {
      if (error && !(optional && isMissing(error))) return reject(error)
      resolve(resource ? { request: resource, info } : null)
    })
  })

  return {
    resolveWithInfo,
    async resolve (context, request, flags) {
      const result = await resolveWithInfo(context, request, flags)
      return result && result.request
    },
    resolveSync (context, request, { native = false, optional = false, tracked = true, dependencyType } = {}) {
      const { queryObj } = parseRequest(request)
      let result
      let error
      getResolver(dependencyType).resolve({}, queryObj.context || context, prepare(request, native), tracked ? dependencies : {}, (err, resource) => {
        error = err
        result = resource
      })
      if (error && !(optional && isMissing(error))) throw error
      return result || null
    }
  }
}

async function discoverEntries (rootEntries, options = {}) {
  const mode = options.mode || 'wx'
  const srcMode = options.srcMode || 'wx'
  const env = options.env || ''
  const projectRoot = options.projectRoot || options.context || process.cwd()
  const miniProgram = isMiniProgram(mode)
  const defs = Object.assign({}, options.defs, { __mpx_mode__: mode, __mpx_src_mode__: srcMode, __mpx_env__: env })
  const entries = new Map()
  const pageRoutes = new Map()
  const files = new Map()
  const references = new Map()
  const componentEntries = new Map()
  const independentPackages = new Map()
  const assets = new Map()
  const warnings = []
  const fileDependencies = new Set()
  const contextDependencies = new Set()
  const missingDependencies = new Set()
  const { resolveWithInfo, resolve, resolveSync } = createResolver(Object.assign({}, options, { mode, env, projectRoot }), { fileDependencies, contextDependencies, missingDependencies })
  const readFile = async (resourcePath) => {
    fileDependencies.add(resourcePath)
    if (!files.has(resourcePath)) files.set(resourcePath, fs.promises.readFile(resourcePath))
    return files.get(resourcePath)
  }
  const pathHash = resourcePath => hash(options.pathHashMode === 'relative' ? path.relative(projectRoot, resourcePath) : resourcePath)
  const explicitAliases = Array.isArray(options.resolve?.alias)
    ? options.resolve.alias.map(({ name, onlyModule }) => [name, onlyModule])
    : Object.keys(options.resolve?.alias || {}).map(name => [name.replace(/\$$/, ''), name.endsWith('$')])
  const external = (request) => {
    if (typeof request === 'string' && request.startsWith('#')) {
      const { rawResourcePath } = parseRequest(request)
      if (explicitAliases.some(([name, exact]) => rawResourcePath === name || (!exact && rawResourcePath.startsWith(name + '/')))) return false
    }
    return !isUrlRequest(request, projectRoot, options.externals)
  }
  const native = options.resolveMode === 'native'
  const publicPath = options.publicPath === undefined ? '/' : options.publicPath
  const supportsAsync = !options.disableRequireAsync && (['wx', 'ali', 'web', 'tt'].includes(mode) || (isReact(mode) && options.rnConfig?.supportSubpackage !== false))

  const outputName = (value) => {
    const normalized = path.posix.normalize(toPosix(value).replace(/^\/+/, ''))
    if (normalized === '.' || normalized === '..' || normalized.startsWith('../')) throw new Error(`Invalid Mpx output path ${value}`)
    return normalized
  }
  const getOutputPath = (file, type, { conflictPath } = {}) => {
    const name = path.basename(withoutExtension(file))
    const id = pathHash(file)
    if (conflictPath) return conflictPath.replace(/(\.[^/]+)?$/, match => id + match)
    return typeof options.customOutputPath === 'function'
      ? options.customOutputPath(type, name, id, '', file)
      : `${type}s/${name}${id}/index`
  }

  async function readConfiguration (request, type) {
    const { rawResourcePath: resourcePath, resourcePath: logicalPath, queryObj } = parseRequest(request)
    const source = (await readFile(resourcePath)).toString('utf8')
    const sfc = /\.(mpx|vue)$/.test(logicalPath)
    const useTargetDialect = options.srcModeRules && matchCondition(logicalPath, options.srcModeRules[mode])
    const resourceSrcMode = queryObj.srcMode || (useTargetDialect ? mode : srcMode)
    const descriptor = sfc ? parseComponent(source, { filePath: resourcePath, mode, env, needMap: true }) : {}
    let jsonBlock = descriptor.json

    if (!sfc && /\.json(?:\.js)?$/.test(logicalPath)) {
      jsonBlock = { content: source, useJSONJS: logicalPath.endsWith(JSON_JS_EXT) }
    } else if (!sfc && type !== 'export' && miniProgram) {
      const base = withoutExtension(logicalPath)
      const { typeExtMap } = config[resourceSrcMode]
      const context = path.dirname(resourcePath)
      const [json, template, transpiledStyle, style, script] = await Promise.all([
        resolve(context, base + JSON_JS_EXT, { optional: true }).then(value => value || resolve(context, base + typeExtMap.json, { optional: true })),
        type === 'app' ? null : resolve(context, base + typeExtMap.template, { optional: true }),
        Promise.all((options.nativeConfig?.cssLangs || ['less', 'stylus', 'scss', 'sass']).filter(lang => cssExtensions[lang]).map(async lang => ({ lang, src: await resolve(context, base + cssExtensions[lang], { optional: true }) }))).then(values => values.find(value => value.src)),
        resolve(context, base + typeExtMap.styles, { optional: true }),
        resolve(context, base + '.ts', { optional: true })
      ])
      descriptor.template = template ? { src: template } : null
      descriptor.styles = transpiledStyle ? [transpiledStyle] : style ? [{ src: style }] : []
      descriptor.script = { src: script || request }
      if (json) {
        jsonBlock = { src: json, useJSONJS: parseRequest(json).resourcePath.endsWith(JSON_JS_EXT) }
        descriptor.json = jsonBlock
      }
    }

    let sourceJSON = {}
    if (jsonBlock) {
      let jsonPath = resourcePath
      let jsonContent = jsonBlock.content
      if (jsonBlock.src) {
        const resolved = await resolve(path.dirname(resourcePath), jsonBlock.src)
        if (resolved) {
          jsonPath = parseRequest(resolved).rawResourcePath
          jsonContent = (await readFile(jsonPath)).toString('utf8')
        }
      }
      if (jsonContent) {
        try {
          sourceJSON = jsonBlock.useJSONJS || jsonPath.endsWith(JSON_JS_EXT)
            ? evalJSONJS(jsonContent, jsonPath, {
              _compiler: { inputFileSystem: fs },
              getMpx: () => ({ defs }),
              addDependency: file => fileDependencies.add(file)
            })
            : JSON5.parse(jsonContent)
        } catch (error) {
          throw new Error(`Invalid Mpx JSON in ${jsonPath}: ${error.message}`, { cause: error })
        }
      }
    }
    return { resourcePath, logicalPath, source, descriptor, srcMode: resourceSrcMode, sourceJSON }
  }

  const prepareJSON = (entry, globalComponents) => {
    const json = JSON.parse(JSON.stringify(entry.sourceJSON))
    if (miniProgram && entry.type === 'component') json.component = true
    if (miniProgram && entry.type === 'page' && !options.forceUsePageCtor) {
      json.usingComponents = json.usingComponents || {}
      if (mode === 'swan') json.component = true
    }
    if (entry.type === 'app' || entry.type === 'page' || entry.type === 'component') {
      const run = getRulesRunner({
        mode,
        srcMode: entry.descriptor.json?.srcMode || entry.srcMode,
        type: 'json',
        mainKey: entry.type === 'app' ? undefined : entry.type,
        waterfall: true,
        diagnostic: { file: entry.resourcePath },
        data: { globalComponents },
        warn: message => warnings.push(new Error(`${entry.resourcePath}: ${message}`)),
        error: message => { throw new Error(`${entry.resourcePath}: ${message}`) }
      })
      if (run) run(json)
    }
    return json
  }

  const outputReference = (entry, owner, relative = false) => {
    if (!relative && !options.useRelativePath && owner.type !== 'plugin') return publicPath + entry.name
    const result = path.posix.relative(path.posix.dirname(owner.name), entry.name)
    return result.startsWith('.') ? result : './' + result
  }

  async function register (request, type, name, packageRoot, state, originalRequest = request) {
    name = outputName(packageRoot ? `${packageRoot}/${name}` : name)
    const known = entries.get(name)
    if (known) {
      if (known.request !== request || known.type !== type) throw new Error(`Mpx output ${name} is already registered by ${known.resourcePath}`)
      return known
    }
    const data = await readConfiguration(request, type)
    const entry = Object.assign(data, {
      name,
      type,
      request,
      packageRoot,
      independent: independentPackages.has(packageRoot)
    })
    entries.set(name, entry)
    const original = parseRequest(originalRequest)
    const originalKey = original.resourcePath
    new Set([originalKey, original.rawResourcePath]).forEach(key => {
      if (!references.has(key)) references.set(key, [])
      references.get(key).push(entry)
    })
    if (type === 'component') componentEntries.set(`${packageRoot}\0${originalKey}`, entry)
    const context = path.dirname(entry.resourcePath)
    if (type === 'app' && mode !== entry.srcMode && entry.sourceJSON.usingComponents) {
      const components = Object.assign({}, entry.sourceJSON.usingComponents)
      await rewriteMap(components, value => external(value) ? value : resolve(context, value, { native }))
      state.globalComponents = components
    }
    entry.json = prepareJSON(entry, state.globalComponents)
    if (type === 'app') await processApp(entry, context, state)
    if (type === 'plugin') await processPlugin(entry, context, state)
    if (type === 'page' || type === 'component') {
      const resolveComponent = (request, tag) => addComponent(request, context, entry, state, tag)
      await rewriteMap(entry.json.usingComponents, resolveComponent)
      for (const generic of Object.values(entry.json.componentGenerics || {})) {
        if (generic.default) {
          const value = await resolveComponent(generic.default)
          if (value) generic.default = value
          else delete generic.default
        }
      }
    }
    return entry
  }

  async function resolveEntry (context, request, type) {
    return resolveWithInfo(context, request, { native: native && type !== 'app' })
  }

  async function rewriteMap (object, mapper) {
    for (const [key, value] of Object.entries(object || {})) {
      const result = await mapper(value, key)
      if (result != null) object[key] = result
      else delete object[key]
    }
  }

  async function addPage (page, context, packageRoot, state) {
    const request = typeof page === 'string' ? page : page.src
    if (external(request)) return request
    const resolved = await resolveEntry(context, request, 'page')
    if (!resolved) return null
    const { resourcePath } = parseRequest(resolved.request)
    const relative = path.relative(context, resourcePath)
    let name = page.path || (inside(relative) ? withoutExtension(relative) : getOutputPath(resourcePath, 'page'))
    let route
    if (mode === 'web') {
      const fullName = outputName(packageRoot ? `${packageRoot}/${name}` : name)
      route = `${resourcePath}\0${fullName}`
      const registered = pageRoutes.get(route)
      if (registered) return packageRoot ? registered.slice(packageRoot.length + 1) : registered
      const previous = entries.get(fullName)
      if (previous && previous.logicalPath !== resourcePath) {
        const renamed = getOutputPath(resourcePath, 'page', { conflictPath: fullName })
        warnings.push(new Error(`Mpx page ${resourcePath} is registered at ${fullName}, already used by ${previous.resourcePath}. Using ${renamed}`))
        name = packageRoot ? renamed.slice(packageRoot.length + 1) : renamed
      }
    }
    const sourceRequest = !options.production && isPartialCompileExcluded(resourcePath, options.partialCompileRules, 'page') ? defaultPage : resolved.request
    const result = await register(sourceRequest, 'page', name, packageRoot, state, resolved.request)
    if (route) pageRoutes.set(route, result.name)
    return packageRoot ? result.name.slice(packageRoot.length + 1) : result.name
  }

  async function addComponent (request, context, owner, state, tag, nameOverride) {
    if (external(request)) return request
    const resolved = await resolveEntry(context, request, 'component')
    if (!resolved) return null
    const { resourcePath, queryObj } = parseRequest(resolved.request)
    const asyncRule = supportsAsync && !queryObj.root && options.asyncSubpackageRules?.find(rule => matchCondition(resourcePath, rule))
    const asyncRoot = supportsAsync && (queryObj.root || asyncRule?.root)
    let packageRoot = asyncRoot ? outputName(asyncRoot) : owner.packageRoot
    const main = componentEntries.get(`\0${resourcePath}`)
    if (!asyncRoot && !independentPackages.has(packageRoot) && (main || matchCondition(resourcePath, options.forceMainPackageRules))) packageRoot = ''
    const shared = componentEntries.get(`${packageRoot}\0${resourcePath}`)
    let component = shared

    if (!component) {
      const source = !options.production && isPartialCompileExcluded(resourcePath, options.partialCompileRules, 'component') ? defaultComponent : addQuery(resolved.request, {}, false, ['root'])
      const { descriptionFileData, descriptionFileRoot } = resolved.info || {}
      const nativePackage = miniProgram && /\.[cm]?[jt]s$/.test(resourcePath) && resourcePath.split(path.sep).includes('node_modules') && descriptionFileRoot
      const name = nameOverride || (nativePackage
        ? path.join('components', (descriptionFileData?.name || 'nativeComponent').replace(/@/g, '') + pathHash(descriptionFileRoot), path.relative(descriptionFileRoot, withoutExtension(resourcePath)))
        : getOutputPath(resourcePath, 'component'))
      component = await register(source, 'component', name, packageRoot, state, resolved.request)
    }

    if (asyncRoot && miniProgram && tag) {
      const placeholders = owner.json.componentPlaceholder || (owner.json.componentPlaceholder = {})
      if (!placeholders[tag] && asyncRule?.placeholder) {
        const placeholderOption = asyncRule.placeholder
        const placeholder = typeof placeholderOption === 'string'
          ? getBuildInTagComponent(mode, placeholderOption) || { name: placeholderOption }
          : placeholderOption
        let name = mode === 'ali' ? capitalToHyphen(placeholder.name) : placeholder.name
        if (placeholder.resource) {
          const resource = await addComponent(placeholder.resource, context, owner, state)
          const usingComponents = owner.json.usingComponents
          const originalName = name
          let index = 0
          while (usingComponents[name] && usingComponents[name] !== resource) name = originalName + ++index
          usingComponents[name] = resource
        }
        placeholders[tag] = name
      }
      if (!placeholders[tag]) throw new Error(`Missing componentPlaceholder for async component "${tag}" in ${owner.resourcePath}`)
    }
    return outputReference(component, owner)
  }

  async function addExport (request, context, packageRoot, state) {
    const resolved = await resolveEntry(context, request, 'export')
    if (!resolved) return null
    const relative = path.relative(context, parseRequest(resolved.request).resourcePath)
    if (!inside(relative)) throw new Error(`Mpx export ${request} must be inside ${context}`)
    const entry = await register(resolved.request, 'export', withoutExtension(relative), packageRoot, state)
    return entry.name + '.js'
  }

  async function processPlugin (entry, context, state) {
    const json = entry.json
    if (json.main) json.main = await addExport(json.main, context, '', state)
    await rewriteMap(json.publicComponents, value => addComponent(value, context, entry, state))
    let pages = json.pages
    if (Array.isArray(pages)) {
      const publicNames = new Map(Object.entries(json.publicPages || {}).map(([name, page]) => [page, name]))
      pages = Object.fromEntries(pages.map((page, index) => [publicNames.get(page) || `__private_page_${index}__`, page]))
    }
    await rewriteMap(pages, value => addPage(value, context, '', state))
    if (!pages) return
    if (mode === 'ali') {
      json.pages = Object.values(pages)
      json.publicPages = Object.fromEntries(Object.entries(pages).filter(([name]) => !name.startsWith('__private_page_')))
    } else {
      json.pages = pages
      delete json.publicPages
    }
  }

  async function addPages (pages, context, target, packageRoot, state) {
    for (const page of pages || []) {
      const result = await addPage(page, context, packageRoot, state)
      if (result && !target.includes(result)) target.push(result)
    }
  }

  async function addSubpackage (data, context, state) {
    const root = outputName(data.tarRoot || data.root)
    const srcRoot = data.srcRoot || data.root || ''
    const source = path.resolve(context, srcRoot)
    const subpackage = state.subpackages.get(root) || { root, pages: [] }
    const { pages, tarRoot, srcRoot: sourceRoot, root: ignoredRoot, independent, ...extra } = data
    Object.assign(subpackage, extra)
    state.subpackages.set(root, subpackage)
    if (independent && mode !== 'ali') {
      const initial = typeof independent === 'string' ? await resolve(source, independent) : true
      independentPackages.set(root, initial)
      subpackage.independent = true
    }
    await addPages(pages, source, subpackage.pages, root, state)
  }

  async function addPackages (packages, context, state, appPages, ancestors = new Set()) {
    for (const request of packages || []) {
      const resolved = await resolve(context, request)
      if (!resolved) continue
      const { queryObj, rawResourcePath } = parseRequest(resolved)
      if (ancestors.has(rawResourcePath)) throw new Error(`Circular Mpx packages configuration at ${rawResourcePath}`)
      const file = await readConfiguration(resolved, 'package')
      const json = file.sourceJSON
      const nextContext = path.dirname(file.resourcePath)
      if (queryObj.root) {
        await addSubpackage({
          tarRoot: queryObj.root,
          srcRoot: queryObj.srcRoot,
          pages: json.pages,
          independent: queryObj.independent === true && /\.mpx$/.test(file.resourcePath) ? file.resourcePath : queryObj.independent,
          plugins: json.plugins
        }, nextContext, state)
      } else {
        await addPages(json.pages, nextContext, appPages, '', state)
      }
      await addPackages(json.packages, nextContext, state, appPages, new Set([...ancestors, rawResourcePath]))
    }
  }

  async function addAsset (request, context) {
    if (external(request)) return request
    const result = await resolve(context, urlToRequest(request))
    if (!result) return null
    const { rawResourcePath } = parseRequest(result)
    const relative = path.relative(context, rawResourcePath)
    const pathname = inside(relative)
      ? toPosix(relative)
      : `assets/${pathHash(rawResourcePath)}/${path.basename(rawResourcePath)}`
    assets.set(pathname, { resourcePath: rawResourcePath, source: await readFile(rawResourcePath) })
    return pathname
  }

  async function copyWorkers (root, context, directory) {
    const resolved = path.resolve(root, directory)
    if (!inside(path.relative(root, resolved))) throw new Error(`Invalid Mpx workers folder ${directory}`)
    contextDependencies.add(resolved)
    const children = await fs.promises.readdir(resolved, { withFileTypes: true })
    for (const child of children) {
      if (child.isDirectory()) await copyWorkers(root, context, path.join(directory, child.name))
      else if (child.isFile()) await addAsset('./' + toPosix(path.join(directory, child.name)), context)
    }
  }

  async function processApp (entry, context, state) {
    const json = entry.json
    await rewriteMap(json.usingComponents, (request, tag) => addComponent(request, context, entry, state, tag))
    const pages = []
    await addPages(json.pages, context, pages, '', state)
    await addPackages(json.packages, context, state, pages)
    for (const subpackage of json.subPackages || json.subpackages || []) await addSubpackage(subpackage, context, state)
    delete json.packages
    delete json.subpackages
    delete json.subPackages
    json.pages = pages
    const subpackages = [...state.subpackages.values()].filter(pkg => pkg.pages.length || mode === 'tt')
    if (subpackages.length) json.subPackages = subpackages
    if (!miniProgram) return

    const tabBar = config[mode]?.tabBar
    if (tabBar && json.tabBar) {
      for (const item of json.tabBar[tabBar.itemKey] || []) {
        for (const key of [tabBar.iconKey, tabBar.activeIconKey]) {
          if (item[key]) item[key] = await addAsset(item[key], context)
        }
      }
      if (json.tabBar[tabBar.customKey]) {
        const source = resolveTabBarPath(config[entry.srcMode].tabBar.customKey)
        const output = resolveTabBarPath(tabBar.customKey)
        await addComponent('./' + source, context, entry, state, null, output)
      }
    }
    const optionMenuIcon = config[mode]?.optionMenu?.iconKey
    if (optionMenuIcon && json.optionMenu?.[optionMenuIcon]) json.optionMenu[optionMenuIcon] = await addAsset(json.optionMenu[optionMenuIcon], context)
    if (json.themeLocation) json.themeLocation = await addAsset(json.themeLocation, context)
    if (typeof json.workers === 'string') await copyWorkers(context, context, json.workers)
    if (json.appBar) json.appBar.custom = await addComponent('./app-bar/index', context, entry, state, null, 'app-bar/index')
  }

  for (const [name, input] of Object.entries(rootEntries)) {
    const root = typeof input === 'string' ? { request: input } : input
    const request = root.request
    const query = parseRequest(request).queryObj
    const type = root.type || (query.isPlugin ? 'plugin' : query.isPage ? 'page' : query.isComponent ? 'component' : 'app')
    const resolved = await resolveEntry(options.context || projectRoot, request, 'app')
    if (!resolved) throw new Error(`Mpx entry ${request} was ignored by the resolver`)
    await register(resolved.request, type, name, '', { subpackages: new Map() })
  }

  function findEntry (request, packageRoot = '', type) {
    const { resourcePath } = parseRequest(request)
    const candidates = (references.get(resourcePath) || []).filter(entry => !type || entry.type === type)
    return candidates.find(entry => entry.packageRoot === packageRoot) || candidates.find(entry => !entry.packageRoot) || candidates[0]
  }

  function getPageOutputPath (request, name) {
    return pageRoutes.get(`${parseRequest(request).resourcePath}\0${outputName(name)}`) || name
  }

  return { entries, assets, warnings, independentPackages, fileDependencies, contextDependencies, missingDependencies, resolve, resolveSync, readFile, findEntry, getOutputPath, getPageOutputPath }
}

module.exports = { discoverEntries }
