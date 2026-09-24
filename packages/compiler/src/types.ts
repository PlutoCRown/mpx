export type MpxCtorType = 'app' | 'page' | 'component'

export interface CompileMpxFileOptions {
  mode: 'web'
  srcMode?: string
  resourcePath: string
  ctorType?: MpxCtorType
  context?: string
}

export interface CompileMpxFileResult {
  code: string
  map?: object
  watchFiles: string[]
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
