import type { MiniProgramFiles, MiniProgramMode } from './modes'

export type { MiniProgramFiles, MiniProgramMode }

export type MpxCtorType = 'app' | 'page' | 'component'

export type MpxCompileMode = 'web' | MiniProgramMode

export type WxAssetFiles = MiniProgramFiles<'wx'>

export interface CompileMpxFileOptions {
  mode: MpxCompileMode
  srcMode?: string
  resourcePath: string
  ctorType?: MpxCtorType
  context?: string
  env?: string
  defs?: Record<string, unknown>
}

export interface CompileMpxFileResult {
  mode: MpxCompileMode
  code?: string
  map?: object
  watchFiles: string[]
  files?: MiniProgramFiles<MiniProgramMode>
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
