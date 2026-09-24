import { compileMpxFile, compileReactTemplate, isReactMode } from '@mpxjs/compiler'
import type { MpxCtorType, ReactMode, RnConfig } from '@mpxjs/compiler'
import { isMpxTransformId, isRnMpxId, readMpxId } from './filter'

export interface MpxPluginOptions {
  mode?: 'web' | ReactMode
  srcMode?: string
  context?: string
  rnConfig?: RnConfig
  isProduction?: boolean
  env?: string
  hasUnoCSS?: boolean
}

interface TransformContext {
  addWatchFile: (file: string) => void
  warn?: (message: Error | string) => void
}

export function mpxFactory (options?: MpxPluginOptions) {
  const resolved = options || {}
  const mode = resolved.mode || 'web'
  const react = isReactMode(mode)
  return {
    name: 'mpx',
    enforce: 'pre' as const,
    transformInclude (id: string): boolean {
      return react ? isRnMpxId(id) : isMpxTransformId(id)
    },
    transform (this: TransformContext, code: string, id: string) {
      const parsed = readMpxId(id)
      const result = react && parsed.query.mpxRnTemplate !== undefined
        ? compileReactTemplate(code, {
          mode: mode as ReactMode,
          srcMode: parsed.query.srcMode || resolved.srcMode,
          resourcePath: parsed.file,
          context: resolved.context,
          env: resolved.env,
          rnConfig: resolved.rnConfig
        })
        : compileMpxFile(code, {
          mode,
          srcMode: resolved.srcMode,
          resourcePath: parsed.file,
          context: resolved.context,
          ctorType: ctorFromQuery(parsed.query),
          isApp: parsed.query.mpxRnApp !== undefined,
          outputPath: parsed.query.outputPath,
          rnConfig: resolved.rnConfig,
          isProduction: resolved.isProduction,
          env: resolved.env,
          hasUnoCSS: resolved.hasUnoCSS
        })
      result.watchFiles.forEach((file) => {
        this.addWatchFile(file)
      })
      if (this.warn && result.warnings) {
        result.warnings.forEach((warning) => {
          if (this.warn) this.warn(warning)
        })
      }
      if (result.errors && result.errors.length) {
        throw new Error(result.errors.join('\n'))
      }
      if (typeof result.code !== 'string') {
        throw new Error('[mpx] unplugin only emits Web Vue SFC or RN JS modules. Mini-program assets come from compileMpxFile().files')
      }
      return { code: result.code }
    }
  }
}

function ctorFromQuery (query: Record<string, string>): MpxCtorType | undefined {
  if (query.mpxRnApp !== undefined) return 'app'
  if (query.isComponent !== undefined) return 'component'
  if (query.isPage !== undefined) return 'page'
  return undefined
}
