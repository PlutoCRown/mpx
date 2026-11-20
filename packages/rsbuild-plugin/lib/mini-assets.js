const path = require('node:path')
const { createRequire } = require('node:module')
const hash = require('hash-sum')
const { urlToRequest } = require('loader-utils')
const platformConfigs = require('@mpxjs/webpack-plugin/lib/config')
const compileTemplate = require('@mpxjs/webpack-plugin/lib/template-compiler')
const compileStyle = require('@mpxjs/webpack-plugin/lib/style-compiler')
const { stripCondition } = require('@mpxjs/webpack-plugin/lib/style-compiler/strip-conditional')
const parseAttributes = require('@mpxjs/webpack-plugin/lib/wxml/attributesParser')
const isUrlRequest = require('@mpxjs/webpack-plugin/lib/utils/is-url-request')
const parseRequest = require('@mpxjs/webpack-plugin/lib/utils/parse-request')
const addQuery = require('@mpxjs/webpack-plugin/lib/utils/add-query')
const { matchCondition } = require('@mpxjs/webpack-plugin/lib/utils/match-condition')
const { STYLE_PAD_PLACEHOLDER } = require('@mpxjs/webpack-plugin/lib/utils/const')
const { relativeRequire } = require('./mini-plugin')
const transformScript = require('./transform-script')
const { i18nRuntime, injectI18n } = require('./wxs-loader')
const isI18nRequest = request => /(?:^|[/\\])i18n-loader\.js!.*[/\\]runtime[/\\]i18n\.wxs$/.test(request)

function renderStylus (stylus, content, resourcePath, graph, addDependency) {
  const imports = []
  const alternatePaths = new Map()
  const evaluator = class extends stylus.Evaluator {
    visitImport (imported) {
      this.return++
      const node = this.visit(imported.path).first
      this.return--
      if (node.string?.startsWith('~')) {
        const request = path.extname(node.string) ? node.string : node.string + '.styl'
        const file = parseRequest(graph.resolveSync(path.dirname(node.filename || resourcePath), request)).rawResourcePath
        node.string = file
        if (!/\.(?:styl|css)$/i.test(file)) alternatePaths.set(file + '.styl', file)
      }
      return super.visitImport(imported)
    }
  }
  const clean = content.replaceAll(`/* ${STYLE_PAD_PLACEHOLDER} */`, '').replace(/(?:\r?\n[ \t]*){16,}(?=\r?\n)/g, '\n')
  const renderer = stylus(clean, { filename: resourcePath, Evaluator: evaluator, _imports: imports })
  const find = stylus.utils.find
  // Stylus appends .styl before looking up a resolved import with another extension.
  stylus.utils.find = (file, ...args) => alternatePaths.has(file) ? [alternatePaths.get(file)] : find(file, ...args)
  try {
    return renderer.render()
  } finally {
    stylus.utils.find = find
    imports.forEach(imported => addDependency(imported.path))
  }
}

function getUsingComponentsInfo (entry, build) {
  const info = {}
  for (const [name, request] of Object.entries(entry.json?.usingComponents || {})) {
    if (typeof request !== 'string') continue
    const target = request.startsWith('/')
      ? request.slice(1)
      : path.posix.normalize(path.posix.join(path.posix.dirname(entry.name), request))
    const related = build.graph.entries.get(target)
    if (related) {
      info[name] = {
        mid: build.getModuleId(related.resourcePath, false),
        hasVirtualHost: matchCondition(related.resourcePath, build.options.autoVirtualHostRules)
      }
    }
  }
  return info
}

class MiniAssets {
  constructor (loader, entry) {
    this.loader = loader
    this.entry = entry
    this.build = loader.mpxBuild
    const { options, defs, wxsContentMap, getModuleId, graph } = this.build
    this.platform = platformConfigs[options.mode]
    this.graph = graph
    this.context = Object.assign({}, options, {
      defs,
      wxsContentMap,
      getModuleId,
      webConfig: options.webConfig || {},
      hasUnoCSS: this.build.buildInfo.hasUnoCSS,
      isUnoCSSScanFile: this.build.buildInfo.isUnoCSSScanFile
    })
    this.emitting = new Set()
    this.projectRequire = createRequire(path.join(options.projectRoot, 'package.json'))
  }

  async readBlock (part, defaultPath) {
    if (!part.src) return { content: part.content || '', resourcePath: defaultPath }
    const resourcePath = parseRequest(await this.graph.resolve(path.dirname(defaultPath), part.src)).rawResourcePath
    return { content: (await this.readFile(resourcePath)).toString(), resourcePath }
  }

  async readFile (file) {
    this.loader.addDependency(file)
    return this.graph.readFile(file)
  }

  async transformTemplate (part, output, fallbackPath, include = false) {
    const { entry, graph, context, loader, platform } = this
    const { resourcePath, content } = await this.readBlock(part, fallbackPath)
    this.build.assetsSources.set(output, resourcePath)
    const moduleId = context.getModuleId(entry.resourcePath, entry.type === 'app')
    const native = !/\.(?:mpx|vue)$/.test(entry.resourcePath) || include
    const normalized = entry.sourceJSON || {}
    const usingComponentsInfo = this.usingComponentsInfo || (this.usingComponentsInfo = getUsingComponentsInfo(entry, this.build))
    const facade = Object.create(loader)
    facade.getMpx = () => context
    facade.resource = addQuery(resourcePath, {
      srcMode: part.srcMode || entry.srcMode,
      type: 'template',
      ctorType: entry.type,
      packageRoot: entry.packageRoot,
      hasScoped: entry.descriptor.styles.some(style => style.scoped) || matchCondition(entry.resourcePath, context.autoScopeRules),
      hasComment: !!part.attrs?.comments,
      isNative: native,
      moduleId,
      usingComponentsInfo: JSON.stringify(usingComponentsInfo),
      originalUsingComponents: JSON.stringify(Object.keys(normalized.usingComponents || {})),
      componentPlaceholder: Object.values(normalized.componentPlaceholder || {})
    })
    let render = ''
    facade.emitFile = (name, source, map, info) => {
      if (info?.extractedResultSource) render = info.extractedResultSource
      else if (!info?.skipEmit) loader.emitFile(name, source, map, info)
    }
    let template = compileTemplate.call(facade, content)
    const tags = ['image:src', 'video:src', 'cover-image:src', 'import:src', 'include:src', `${platform.wxs.tag}:${platform.wxs.src}`]
      .concat(context.attributes || [])
    const links = parseAttributes(template, (tag, attr) => tags.includes(tag + ':' + attr) || tags.includes(':' + attr))
    const wxsModules = new Map()
    for (const link of links.reverse()) {
      if (!isUrlRequest(link.value, context.projectRoot, context.externals)) continue
      let file
      if (link.tag === platform.wxs.tag) {
        file = await this.emitWxs(resourcePath, link.value)
        wxsModules.set(link.value, file)
      } else if (link.tag === 'import' || link.tag === 'include') {
        const request = urlToRequest(link.value, context.projectRoot)
        const included = parseRequest(await graph.resolve(path.dirname(resourcePath), request)).rawResourcePath
        file = this.assetName(included, platform.typeExtMap.template)
        if (!this.emitting.has(file)) {
          this.emitting.add(file)
          await this.transformTemplate({ src: included }, file, resourcePath, true)
        }
      } else {
        file = await this.emitAsset(resourcePath, link.value)
      }
      template = template.slice(0, link.start) + relativeRequire(output, file) + template.slice(link.start + link.length)
    }
    loader.emitFile(output, template)
    if (!render || !wxsModules.size) return render
    return transformScript(render, {
      filename: resourcePath,
      rewriteRequest: request => {
        if (isI18nRequest(request)) return addQuery(i18nRuntime, { mpxWxs: true })
        const { rawResourcePath, queryObj } = parseRequest(request)
        if (queryObj.wxsModule) {
          return addQuery(path.resolve(path.dirname(resourcePath), rawResourcePath), { mpxWxs: queryObj.wxsModule })
        }
        if (Object.values(platformConfigs).some(config => config.wxs && request.endsWith(config.wxs.ext))) return addQuery(request, { mpxWxs: true })
        return request
      }
    }).code
  }

  assetName (file, ext = path.extname(file)) {
    const prefix = this.entry.packageRoot ? this.entry.packageRoot + '/' : ''
    return `${prefix}assets/${hash(file)}/${path.basename(file, path.extname(file))}${ext}`
  }

  async emitAsset (issuer, request) {
    const { rawResourcePath } = parseRequest(await this.graph.resolve(path.dirname(issuer), urlToRequest(request, this.context.projectRoot)))
    const file = this.assetName(rawResourcePath)
    if (!this.emitting.has(file)) {
      this.emitting.add(file)
      this.loader.emitFile(file, await this.readFile(rawResourcePath))
    }
    return file
  }

  async emitWxs (issuer, request) {
    const { queryObj } = parseRequest(request)
    const { context, platform, graph, loader } = this
    let file = issuer
    let content
    if (queryObj.wxsModule) {
      content = context.wxsContentMap[`${issuer}~${queryObj.wxsModule}`]
    } else {
      file = isI18nRequest(request) ? i18nRuntime : parseRequest(await graph.resolve(path.dirname(issuer), urlToRequest(request, context.projectRoot))).rawResourcePath
      content = (await this.readFile(file)).toString()
    }
    const wxsFile = this.assetName(queryObj.wxsModule ? file + '~' + queryObj.wxsModule + '.wxs' : file, platform.wxs.ext)
    if (!this.emitting.has(wxsFile)) {
      this.emitting.add(wxsFile)
      if (file === i18nRuntime) {
        const i18n = Object.assign({}, context.i18n)
        if (!i18n.messages && i18n.messagesPath) {
          const messagesPath = path.resolve(context.projectRoot, i18n.messagesPath)
          i18n.messages = JSON.parse((await this.readFile(messagesPath)).toString())
        }
        content = injectI18n(content, loader, i18n)
      }
      const requireRE = /\brequire\(\s*(['"])([^'"]+)\1\s*\)/g
      for (const match of Array.from(content.matchAll(requireRE)).reverse()) {
        const required = await this.emitWxs(file, match[2])
        content = content.slice(0, match.index) + `require(${JSON.stringify(relativeRequire(wxsFile, required))})` + content.slice(match.index + match[0].length)
      }
      if (context.mode === 'ali') content = content.replace(/\bmodule\.exports\s*=/g, 'export default')
      loader.emitFile(wxsFile, transformScript(content, { filename: file, defs: context.defs, mode: context.mode, srcMode: context.srcMode, env: context.env, wxs: true }).code)
    }
    return wxsFile
  }

  async transformStyle (part, output, fallbackPath) {
    const { loader, entry, context, platform, graph } = this
    const { resourcePath, content } = await this.readBlock(part, fallbackPath)
    this.build.assetsSources.set(output, resourcePath)
    const lang = part.lang || path.extname(resourcePath).slice(1)
    let css = content.includes('@mpx-') ? stripCondition(content, context.defs) : content
    if (lang === 'scss' || lang === 'sass') {
      const sass = this.projectRequire('sass')
      const { pathToFileURL, fileURLToPath } = require('node:url')
      const result = await sass.compileStringAsync(css, {
        url: pathToFileURL(resourcePath),
        syntax: lang === 'sass' ? 'indented' : 'scss',
        loadPaths: [path.dirname(resourcePath), path.join(context.projectRoot, 'node_modules')]
      })
      result.loadedUrls.filter(url => url.protocol === 'file:').forEach(url => loader.addDependency(fileURLToPath(url)))
      css = result.css
    } else if (lang === 'styl' || lang === 'stylus') {
      const stylus = this.projectRequire('stylus')
      css = renderStylus(stylus, css, resourcePath, graph, file => loader.addDependency(file))
    } else if (lang === 'less') {
      const less = this.projectRequire('less')
      const assets = this
      const fileManager = new (class extends less.FileManager {
        supports (filename) {
          return filename.startsWith('~')
        }

        async loadFile (filename, directory) {
          const resolved = await graph.resolve(directory, filename)
          const file = parseRequest(resolved).rawResourcePath
          const content = await assets.readFile(file)
          return { contents: stripCondition(content.toString(), context.defs, file), filename: file }
        }
      })()
      const result = await less.render(css, {
        filename: resourcePath,
        plugins: [{ install: (_, manager) => manager.addFileManager(fileManager) }]
      })
      result.imports.forEach(file => loader.addDependency(file))
      css = result.css
    }
    const facade = Object.create(loader)
    facade.resourcePath = resourcePath
    facade.resource = addQuery(resourcePath, {
      moduleId: context.getModuleId(entry.resourcePath, entry.type === 'app'),
      packageRoot: entry.packageRoot,
      scoped: !!part.scoped || matchCondition(entry.resourcePath, context.autoScopeRules)
    })
    facade.getMpx = () => context
    css = await new Promise((resolve, reject) => {
      facade.async = () => (err, source) => err ? reject(err) : resolve(source)
      compileStyle.call(facade, css)
    })
    const postcss = require('postcss')
    const root = postcss.parse(css)
    const imports = []
    const declarations = []
    root.walkAtRules('import', rule => imports.push(rule))
    root.walkDecls(node => { if (node.value.includes('url(')) declarations.push(node) })
    for (const rule of imports) {
      const match = /^['"]([^'"]+)['"]$/.exec(rule.params)
      if (!match || !isUrlRequest(match[1], context.projectRoot, context.externals)) continue
      const imported = parseRequest(await graph.resolve(path.dirname(resourcePath), urlToRequest(match[1], context.projectRoot))).rawResourcePath
      const file = this.assetName(imported, platform.typeExtMap.styles)
      if (!this.emitting.has(file)) {
        this.emitting.add(file)
        loader.emitFile(file, await this.transformStyle({ src: imported }, file, resourcePath))
      }
      rule.params = JSON.stringify(relativeRequire(output, file))
    }
    for (const node of declarations) {
      for (const match of Array.from(node.value.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)).reverse()) {
        if (!isUrlRequest(match[2], context.projectRoot, context.externals)) continue
        const file = await this.emitAsset(resourcePath, match[2])
        const url = `url(${JSON.stringify(relativeRequire(output, file))})`
        node.value = node.value.slice(0, match.index) + url + node.value.slice(match.index + match[0].length)
      }
    }
    return root.toString()
  }
}

module.exports = MiniAssets
module.exports.getUsingComponentsInfo = getUsingComponentsInfo
