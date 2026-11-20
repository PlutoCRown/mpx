const parseRequest = require('@mpxjs/webpack-plugin/lib/utils/parse-request')
const i18nLoader = require('@mpxjs/webpack-plugin/lib/wxs/i18n-loader')
const transformScript = require('./transform-script')
const i18nRuntime = require.resolve('@mpxjs/webpack-plugin/lib/runtime/i18n.wxs')

function injectI18n (source, loader, i18n) {
  const facade = Object.create(loader)
  facade.getMpx = () => ({ i18n })
  return i18nLoader.call(facade, source)
}

module.exports = function wxsLoader (source) {
  const { queryObj, rawResourcePath } = parseRequest(this.resource)
  const { wxsContentMap, defs, options } = this.mpxBuild
  const inline = queryObj.mpxWxs !== true
  if (inline) this.cacheable(false)
  let content = inline ? wxsContentMap[`${rawResourcePath}~${queryObj.mpxWxs}`] : source
  if (content == null) throw new Error(`[Mpx] Missing inline WXS module ${queryObj.mpxWxs} in ${rawResourcePath}`)
  if (rawResourcePath === i18nRuntime) content = injectI18n(content, this, options.i18n)
  return transformScript(content, { filename: rawResourcePath, defs, mode: options.mode, srcMode: options.srcMode, env: options.env }).code
}

module.exports.i18nRuntime = i18nRuntime
module.exports.injectI18n = injectI18n
