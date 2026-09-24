import { createRspackPlugin } from 'unplugin'
import { mpxFactory } from './factory'
import type { MpxPluginOptions } from './factory'
import { installVueSfcPipeline } from './vue-pipeline'
import type { VueRuleCompiler } from './vue-pipeline'

export function rspack (options?: MpxPluginOptions) {
  const inner = createRspackPlugin(mpxFactory)(options)
  return {
    name: 'mpx',
    apply (compiler: Parameters<typeof inner.apply>[0]) {
      installVueSfcPipeline(compiler as VueRuleCompiler)
      inner.apply(compiler)
    }
  }
}
