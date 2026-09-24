import { isReactMode } from '@mpxjs/compiler'
import { createRspackPlugin } from 'unplugin'
import { mpxFactory } from './factory'
import type { MpxPluginOptions } from './factory'
import { installVueSfcPipeline } from './vue-pipeline'
import type { VueRuleCompiler } from './vue-pipeline'

export function rspack (options?: MpxPluginOptions) {
  const inner = createRspackPlugin(mpxFactory)(options)
  const react = !!(options && options.mode && isReactMode(options.mode))
  return {
    name: 'mpx',
    apply (compiler: Parameters<typeof inner.apply>[0]) {
      if (!react) installVueSfcPipeline(compiler as VueRuleCompiler)
      inner.apply(compiler)
    }
  }
}
