import { compileMpxFile } from '@mpxjs/compiler'
import { isMpxTransformId } from './filter'

export interface MpxPluginOptions {
  mode?: 'web'
  srcMode?: string
  context?: string
}

export function mpxFactory (options?: MpxPluginOptions) {
  const resolved = options || {}
  const mode = resolved.mode || 'web'
  return {
    name: 'mpx',
    enforce: 'pre' as const,
    transformInclude (id: string): boolean {
      return isMpxTransformId(id)
    },
    transform (this: { addWatchFile: (file: string) => void }, code: string, id: string) {
      const result = compileMpxFile(code, {
        mode,
        srcMode: resolved.srcMode,
        resourcePath: id,
        context: resolved.context
      })
      result.watchFiles.forEach((file) => {
        this.addWatchFile(file)
      })
      return { code: result.code }
    }
  }
}
