export type MpxCtorType = 'app' | 'page' | 'component'

export type MpxCompileMode = 'web' | 'wx'

export interface PlatformContext {
  mode: 'wx'
  srcMode: 'wx'
  resourcePath: string
}

/**
 * Extension point for cross-platform template / style / json rules.
 * This slice applies identity transforms for mode wx. Rule tables stay outside.
 */
export interface PlatformHooks {
  template?: (source: string, ctx: PlatformContext) => string
  style?: (source: string, ctx: PlatformContext) => string
  json?: (json: Record<string, unknown>, ctx: PlatformContext) => Record<string, unknown>
}

export interface CompileMpxFileOptions {
  mode: MpxCompileMode
  srcMode?: string
  resourcePath: string
  ctorType?: MpxCtorType
  context?: string
  env?: string
  defs?: Record<string, unknown>
  platform?: PlatformHooks
}

export interface WxAssetFiles {
  js: string
  wxml: string
  wxss: string
  json: string
}

export interface CompileMpxFileResult {
  mode: MpxCompileMode
  code?: string
  map?: object
  watchFiles: string[]
  files?: WxAssetFiles
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
