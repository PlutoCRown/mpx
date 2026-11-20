const parseRequest = require('@mpxjs/webpack-plugin/lib/utils/parse-request')
const { matchCondition } = require('@mpxjs/webpack-plugin/lib/utils/match-condition')
const rpx = require('@mpxjs/webpack-plugin/lib/style-compiler/plugins/rpx')
const vw = require('@mpxjs/webpack-plugin/lib/style-compiler/plugins/vw')
const scopeId = require('@mpxjs/webpack-plugin/lib/style-compiler/plugins/scope-id')
const transSpecial = require('@mpxjs/webpack-plugin/lib/style-compiler/plugins/trans-special')
const removeStripConditionalComments = require('@mpxjs/webpack-plugin/lib/style-compiler/plugins/remove-strip-conditional-comments')

function configurePostcss (config) {
  config.tools ||= {}
  config.tools.postcss = [].concat(config.tools.postcss || [], (options, { addPlugins }) => {
    addPlugins(removeStripConditionalComments())
  })
}

function wrapPostcssOptions (previous, options) {
  const rules = options.transRpxRules ? [].concat(options.transRpxRules) : []
  const postcssOptions = (context) => {
    const current = (typeof previous === 'function' ? previous(context) : previous) || {}
    const { queryObj, rawResourcePath } = parseRequest(context.resource)
    if (!queryObj.mpxStyleOptions) return current
    const { mid, scoped } = JSON.parse(queryObj.mpxStyleOptions)
    const plugins = []
    if (scoped) plugins.push(scopeId({ id: mid, scopePage: true }))
    plugins.push(transSpecial({ id: mid, transPage: true }))
    const rule = rules.find(({ include = () => true, exclude }) => matchCondition(rawResourcePath, { include, exclude }))
    if (rule) plugins.push(rpx(rule))
    return Object.assign({}, current, {
      plugins: plugins.concat(current.plugins || [], vw({ transRpxFn: options.webConfig?.transRpxFn }))
    })
  }
  postcssOptions.config = previous?.config ?? false
  return postcssOptions
}

function extendStyleRules (rules, options) {
  rules.forEach(rule => {
    const use = Array.isArray(rule.use) ? rule.use : [rule.use]
    use.forEach(item => {
      if (item && /[/\\]postcss-loader[/\\]/.test(item.loader || '')) {
        item.options = Object.assign({}, item.options, {
          postcssOptions: wrapPostcssOptions(item.options?.postcssOptions, options)
        })
      }
    })
    if (rule.rules) extendStyleRules(rule.rules, options)
    if (rule.oneOf) extendStyleRules(rule.oneOf, options)
  })
}

module.exports = { configurePostcss, extendStyleRules }
