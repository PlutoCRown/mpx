import type { MiniProgramFiles, MiniProgramMode, ReactMode } from './modes'

export type { MiniProgramFiles, MiniProgramMode, ReactMode }

export type MpxCtorType = 'app' | 'page' | 'component'
export type MpxMode = 'web' | MiniProgramMode | ReactMode
export type MpxCompileMode = MpxMode

export type WxAssetFiles = MiniProgramFiles<'wx'>

export interface RnAsyncChunkConfig {
  fallback?: string
  loading?: string
}

export interface RnConfig {
  projectName?: string
  supportSubpackage?: boolean
  asyncChunk?: RnAsyncChunkConfig
  customBuiltInComponents?: Record<string, string>
}

export interface CompileMpxFileOptions {
  mode: MpxMode
  srcMode?: string
  resourcePath: string
  ctorType?: MpxCtorType
  context?: string
  moduleId?: string
  isProduction?: boolean
  env?: string
  /** Compile the app body. The default app compile emits the AppRegistry shell. */
  isApp?: boolean
  outputPath?: string
  rnConfig?: RnConfig
  defs?: Record<string, unknown>
  externalClasses?: string[]
  decodeHTMLText?: boolean
  globalComponents?: Record<string, string>
  hasApp?: boolean
  hasUnoCSS?: boolean
}

export interface CompileToReactOptions extends CompileMpxFileOptions {
  mode: ReactMode
}

export interface CompileMpxFileResult {
  mode?: MpxCompileMode
  code?: string
  map?: object
  watchFiles: string[]
  files?: MiniProgramFiles<MiniProgramMode>
  warnings?: string[]
  errors?: string[]
}

export interface HtmlAttr {
  name: string
  value: string | true
}

export interface OpenTag {
  name: string
  attrs: HtmlAttr[]
  selfClosing: boolean
}

export interface TagRange {
  start: number
  end: number
}

export interface SfcBlock {
  tag: string
  content: string
  attrs: Record<string, string | true>
  mode?: string
  lang?: string
  scoped?: boolean
  type?: string
  name?: string
}

export interface ParsedSfc {
  templates: SfcBlock[]
  scripts: SfcBlock[]
  styles: SfcBlock[]
  jsons: SfcBlock[]
}
