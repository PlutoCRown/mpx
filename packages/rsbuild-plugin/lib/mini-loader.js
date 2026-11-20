const path = require('node:path')
const config = require('@mpxjs/webpack-plugin/lib/config')
const addQuery = require('@mpxjs/webpack-plugin/lib/utils/add-query')
const parseRequest = require('@mpxjs/webpack-plugin/lib/utils/parse-request')
const MiniAssets = require('./mini-assets')
const { getUsingComponentsInfo } = MiniAssets
const { i18nRuntime } = require('./wxs-loader')
const { recordEffects, addDependencies, replayEffects } = require('./watch-cache')

async function transformBlock (loader, build, entry, type, input, emitting, compile) {
  const { cache, graph } = build
  if (!cache) {
    const processor = new MiniAssets(loader, entry)
    processor.emitting = emitting
    return compile(processor)
  }

  const id = type + ':' + entry.name
  const key = JSON.stringify([entry.resourcePath, entry.srcMode, input, [...emitting]])
  const record = cache.get(id, key)
  let result
  if (record) {
    replayEffects(loader, graph, record.effects)
    result = record.value
    result.emitted.forEach(file => emitting.add(file))
  } else {
    const effects = recordEffects(loader, graph)
    const assetsSources = new Map()
    const wxsContentMap = Object.create(build.wxsContentMap)
    effects.facade.mpxBuild = Object.assign({}, build, { graph: effects.graph, assetsSources, wxsContentMap })
    const processor = new MiniAssets(effects.facade, entry)
    processor.emitting = emitting
    const output = await compile(processor)
    addDependencies(graph, effects.dependencies)
    result = { output, assetsSources, wxsContentMap: Object.assign({}, wxsContentMap), emitted: [...emitting] }
    cache.set(id, key, result, effects)
  }
  result.assetsSources.forEach((source, output) => build.assetsSources.set(output, source))
  Object.assign(build.wxsContentMap, result.wxsContentMap)
  return result.output
}

module.exports = function miniLoader () {
  this.cacheable(false)
  const done = this.async()
  const compile = async () => {
    const { queryObj } = parseRequest(this.resource)
    const build = this.mpxBuild
    const { options, graph } = build
    const entry = graph.entries.get(queryObj.mpxEntry)
    const { type, name, packageRoot, descriptor, resourcePath, srcMode } = entry
    const platform = config[options.mode]
    const moduleId = build.getModuleId(resourcePath, type === 'app')
    const emitting = new Set()
    const availableCtor = type === 'page' ? (options.forceUsePageCtor || options.mode === 'ali' ? 'Page' : 'Component') : type === 'component' ? 'Component' : 'App'
    const output = []
    if (type === 'app') {
      if (options.i18n) output.push(`require(${JSON.stringify(addQuery(i18nRuntime, { mpxWxs: true }))})`)
      options.appImports?.forEach(request => output.push(`require(${JSON.stringify(request)})`))
    }
    const independent = graph.independentPackages.get(packageRoot)
    if (typeof independent === 'string') {
      output.push('global.isIndependent = true')
      output.push(`require(${JSON.stringify(addQuery(independent, { mpxPackage: packageRoot }))})`)
      output.push('delete global.isIndependent')
    }
    output.push(`global.currentModuleId = ${JSON.stringify(moduleId)}`)
    if (!this.minimize) output.push(`global.currentResource = ${JSON.stringify(resourcePath)}`)
    output.push(`global.currentCtor = ${availableCtor}`)
    output.push(`global.currentCtorType = ${JSON.stringify(availableCtor.toLowerCase())}`)
    output.push(`global.currentResourceType = ${JSON.stringify(type)}`)

    if (descriptor.template) {
      const { content, src, srcMode: templateSrcMode, attrs } = descriptor.template
      const usingComponentsInfo = build.cache && getUsingComponentsInfo(entry, build)
      const input = build.cache && [
        content, src, templateSrcMode, attrs?.comments, type, packageRoot, moduleId,
        descriptor.styles.some(style => style.scoped), usingComponentsInfo,
        Object.keys(entry.sourceJSON?.usingComponents || {}), Object.values(entry.sourceJSON?.componentPlaceholder || {}),
        build.buildInfo.hasUnoCSS
      ]
      output.push(await transformBlock(this, build, entry, 'template', input, emitting, processor => {
        if (usingComponentsInfo) processor.usingComponentsInfo = usingComponentsInfo
        return processor.transformTemplate(descriptor.template, name + platform.typeExtMap.template, resourcePath)
      }))
    } else if (type !== 'app') {
      this.emitFile(name + platform.typeExtMap.template, '')
    }
    if (descriptor.styles.length) {
      const styleOutput = name + platform.typeExtMap.styles
      const input = build.cache && [packageRoot, moduleId, descriptor.styles.map(({ content, src, lang, scoped }) => [content, src, lang, scoped])]
      const styles = await transformBlock(this, build, entry, 'style', input, emitting, async processor => {
        const results = []
        for (const part of descriptor.styles) {
          results.push(await processor.transformStyle(part, styleOutput, resourcePath))
        }
        return results.join('\n')
      })
      this.emitFile(styleOutput, styles)
    }

    const script = descriptor.script || {}
    output.push(`global.currentSrcMode = ${JSON.stringify(script.srcMode || srcMode)}`)
    const blockOptions = { mpxScript: name, mpxPackage: packageRoot || undefined }
    const scriptSource = script.src ? await graph.resolve(path.dirname(resourcePath), script.src) : resourcePath
    const scriptRequest = addQuery(scriptSource, blockOptions)
    const request = script.src ? scriptRequest : `${resourcePath}.${script.lang || 'js'}!=!${scriptRequest}`
    output.push(`module.exports = require(${JSON.stringify(request)})`)
    return output.join('\n')
  }
  compile().then(output => done(null, output), done)
}
