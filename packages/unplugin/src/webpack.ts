import { createWebpackPlugin } from 'unplugin'
import { mpxFactory } from './factory'
import type { MpxPluginOptions } from './factory'

// Same SFC transform on unplugin's webpack driver. The host still has to run
// vue-loader on `.mpx`; this slice's runnable demo is the rspack entry.
export function webpack (options?: MpxPluginOptions) {
  return createWebpackPlugin(mpxFactory)(options)
}
