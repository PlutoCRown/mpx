const path = require('node:path')
const config = require('@mpxjs/webpack-plugin/lib/config')
const addQuery = require('@mpxjs/webpack-plugin/lib/utils/add-query')
const parseRequest = require('@mpxjs/webpack-plugin/lib/utils/parse-request')
const MiniAssets = require('./mini-assets')
const { i18nRuntime } = require('./wxs-loader')

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
    const processor = new MiniAssets(this, entry)
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
      output.push(await processor.transformTemplate(descriptor.template, name + platform.typeExtMap.template, resourcePath))
    } else if (type !== 'app') {
      this.emitFile(name + platform.typeExtMap.template, '')
    }
    if (descriptor.styles.length) {
      const styleOutput = name + platform.typeExtMap.styles
      const styles = []
      for (const part of descriptor.styles) {
        styles.push(await processor.transformStyle(part, styleOutput, resourcePath))
      }
      this.emitFile(styleOutput, styles.join('\n'))
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
