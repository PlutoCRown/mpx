import { attrsToMap, scanHtml } from './html'
import type { OpenTag, ParsedSfc, SfcBlock } from './types'

const SPECIAL: Record<string, true> = { template: true, script: true, style: true }

export function parseSfc (source: string): ParsedSfc {
  const parsed: ParsedSfc = {
    templates: [],
    scripts: [],
    styles: [],
    jsons: []
  }
  let depth = 0
  let current: { tag: OpenTag, contentStart: number } | null = null

  scanHtml(source, {
    open (tag, range) {
      if (depth === 0 && !tag.selfClosing && SPECIAL[tag.name.toLowerCase()]) {
        current = { tag, contentStart: range.end }
      }
      if (!tag.selfClosing) depth++
    },
    close (_name, range) {
      depth--
      if (depth !== 0 || !current) return
      const block = toBlock(current.tag, source.slice(current.contentStart, range.start))
      current = null
      if (block.tag === 'template') parsed.templates.push(block)
      else if (block.tag === 'style') parsed.styles.push(block)
      else if (isJsonScript(block)) parsed.jsons.push(block)
      else parsed.scripts.push(block)
    }
  })

  return parsed
}

function toBlock (tag: OpenTag, content: string): SfcBlock {
  const attrs = attrsToMap(tag.attrs)
  const block: SfcBlock = {
    tag: tag.name.toLowerCase(),
    content,
    attrs
  }
  if (typeof attrs.mode === 'string') block.mode = attrs.mode
  if (typeof attrs.lang === 'string') block.lang = attrs.lang
  if (attrs.scoped === true || attrs.scoped === '') block.scoped = true
  if (typeof attrs.type === 'string') block.type = attrs.type
  if (typeof attrs.name === 'string') block.name = attrs.name
  return block
}

function isJsonScript (block: SfcBlock): boolean {
  if (block.tag !== 'script') return false
  if (block.name === 'json') return true
  return typeof block.type === 'string' && /^application\/json/.test(block.type)
}
