const { normalizePerfOptions } = require('@mpxjs/webpack-plugin/lib/utils/normalize-perf-options')

module.exports = function normalizeOptions (rawOptions, rootPath) {
  const options = Object.assign({
    mode: 'wx',
    srcMode: 'wx',
    env: '',
    projectRoot: rootPath,
    resolveMode: 'webpack',
    externalClasses: ['custom-class', 'i-class'],
    optimizeRenderRules: []
  }, rawOptions)

  if (options.modeRules && options.srcModeRules) {
    throw new Error('[Mpx] modeRules and srcModeRules cannot be used together')
  }
  options.srcModeRules = options.srcModeRules || options.modeRules
  const perf = normalizePerfOptions(options.perf)
  options.defs = Object.assign({}, options.defs, {
    __mpx_mode__: options.mode,
    __mpx_src_mode__: options.srcMode,
    __mpx_env__: options.env,
    __mpx_dynamic_runtime__: false,
    __mpx_perf__: perf.enable,
    __mpx_perf_framework__: perf.framework,
    __mpx_perf_user__: perf.user
  })
  if (!Array.isArray(options.optimizeRenderRules)) {
    options.optimizeRenderRules = [options.optimizeRenderRules]
  }
  return options
}
