import { createWebpackPlugin } from 'unplugin'
import { mpxFactory } from './factory'
import type { MpxPluginOptions } from './factory'

// Web: same SFC transform on unplugin's webpack driver. The host still has to
// run vue-loader on `.mpx`. RN: the transform emits the JS module directly, so
// no vue-loader and no Compilation hooks are required.
export function webpack (options?: MpxPluginOptions) {
  return createWebpackPlugin(mpxFactory)(options)
}
