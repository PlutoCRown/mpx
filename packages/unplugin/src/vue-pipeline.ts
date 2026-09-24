interface ModuleRule {
  test?: RegExp
  loader?: string
  options?: object
  enforce?: string
}

export interface VueRuleCompiler {
  options: {
    module: {
      rules: ModuleRule[]
    }
    plugins?: Array<{ constructor?: { name?: string } } | null | undefined>
    experiments?: {
      css?: boolean | object
    }
  }
}

function vueLoaderOptions (): { experimentalInlineMatchResource: boolean, transformAssetUrls: boolean } {
  return {
    experimentalInlineMatchResource: true,
    transformAssetUrls: false
  }
}

export function installVueSfcPipeline (compiler: VueRuleCompiler): void {
  if (!compiler.options.experiments) compiler.options.experiments = {}
  if (compiler.options.experiments.css == null) compiler.options.experiments.css = true
  const loader = resolveVueLoader()
  const rules = compiler.options.module.rules
  // VueLoaderPlugin requires a root rule that matches `.vue`, then clones it
  // for SFC blocks. `.mpx` is a second rule so the pre-transform SFC string
  // is compiled by the same loader.
  const hasVueRule = rules.some((rule) => {
    return !rule.enforce && rule.test instanceof RegExp && rule.test.test('foo.vue')
  })
  if (!hasVueRule) {
    rules.push({
      test: /\.vue$/,
      loader,
      options: vueLoaderOptions()
    })
  }
  const hasMpxRule = rules.some((rule) => {
    return rule.test instanceof RegExp &&
      rule.test.source === '\\.mpx$' &&
      typeof rule.loader === 'string' &&
      rule.loader.indexOf('rspack-vue-loader') >= 0
  })
  if (!hasMpxRule) {
    rules.push({
      test: /\.mpx$/,
      loader,
      options: vueLoaderOptions()
    })
  }
  const plugins = compiler.options.plugins || []
  const hasVuePlugin = plugins.some((plugin) => {
    return !!plugin && plugin.constructor && plugin.constructor.name === 'VueLoaderPlugin'
  })
  if (hasVuePlugin) return
  // Loaded lazily so a webpack-only import of this package does not require the Rspack Vue loader.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const loaded = require('rspack-vue-loader') as {
    VueLoaderPlugin: new () => { apply: (next: VueRuleCompiler) => void }
  }
  new loaded.VueLoaderPlugin().apply(compiler)
}

function resolveVueLoader (): string {
  try {
    return require.resolve('rspack-vue-loader')
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error('[mpx unplugin] rspack-vue-loader is required so the compiler\'s Vue SFC string is handed to the Vue toolchain. ' + detail)
  }
}
