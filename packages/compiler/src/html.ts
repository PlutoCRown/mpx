import type { HtmlAttr, OpenTag, TagRange } from './types'

export interface HtmlVisitor {
  text?: (value: string) => void
  open?: (tag: OpenTag, range: TagRange) => void
  close?: (name: string, range: TagRange) => void
}

const RAW_TEXT: Record<string, true> = { script: true, style: true }

export function scanHtml (input: string, visitor: HtmlVisitor): void {
  let index = 0
  const rawStack: string[] = []
  while (index < input.length) {
    if (rawStack.length) {
      const name = rawStack[rawStack.length - 1]
      const closeAt = findCloseTag(input, name, index)
      if (closeAt < 0) {
        emitText(visitor, input.slice(index))
        return
      }
      if (closeAt > index) emitText(visitor, input.slice(index, closeAt))
      const end = skipToGt(input, closeAt)
      if (visitor.close) visitor.close(name, { start: closeAt, end })
      rawStack.pop()
      index = end
      continue
    }

    const lt = input.indexOf('<', index)
    if (lt < 0) {
      emitText(visitor, input.slice(index))
      return
    }
    if (lt > index) emitText(visitor, input.slice(index, lt))
    if (input.startsWith('<!--', lt)) {
      const commentEnd = input.indexOf('-->', lt + 4)
      const next = commentEnd < 0 ? input.length : commentEnd + 3
      emitText(visitor, input.slice(lt, next))
      index = next
      continue
    }
    if (input.startsWith('</', lt)) {
      const parsedClose = parseCloseTag(input, lt)
      if (!parsedClose) {
        emitText(visitor, input[lt])
        index = lt + 1
        continue
      }
      if (visitor.close) visitor.close(parsedClose.name, parsedClose.range)
      index = parsedClose.range.end
      continue
    }
    const parsedOpen = parseOpenTag(input, lt)
    if (!parsedOpen) {
      emitText(visitor, input[lt])
      index = lt + 1
      continue
    }
    if (visitor.open) visitor.open(parsedOpen.tag, parsedOpen.range)
    index = parsedOpen.range.end
    if (!parsedOpen.tag.selfClosing && RAW_TEXT[parsedOpen.tag.name.toLowerCase()]) {
      rawStack.push(parsedOpen.tag.name.toLowerCase())
    }
  }
}

function emitText (visitor: HtmlVisitor, value: string): void {
  if (value && visitor.text) visitor.text(value)
}

function findCloseTag (input: string, name: string, from: number): number {
  const target = '</' + name.toLowerCase()
  const lower = input.toLowerCase()
  let index = lower.indexOf(target, from)
  while (index >= 0) {
    const after = index + target.length
    if (after >= input.length || /[\s>/]/.test(input[after])) return index
    index = lower.indexOf(target, index + 1)
  }
  return -1
}

function skipToGt (input: string, from: number): number {
  const gt = input.indexOf('>', from)
  return gt < 0 ? input.length : gt + 1
}

function parseCloseTag (input: string, start: number): { name: string, range: TagRange } | null {
  const matched = /^<\/([A-Za-z][\w:-]*)\s*>/.exec(input.slice(start))
  if (!matched) return null
  return {
    name: matched[1],
    range: { start, end: start + matched[0].length }
  }
}

function parseOpenTag (input: string, start: number): { tag: OpenTag, range: TagRange } | null {
  if (input[start] !== '<') return null
  const nameMatch = /^<([A-Za-z][\w:-]*)/.exec(input.slice(start))
  if (!nameMatch) return null
  const name = nameMatch[1]
  let index = start + nameMatch[0].length
  const attrs: HtmlAttr[] = []
  while (index < input.length) {
    index = skipWs(input, index)
    if (input.startsWith('/>', index)) {
      return { tag: { name, attrs, selfClosing: true }, range: { start, end: index + 2 } }
    }
    if (input[index] === '>') {
      return { tag: { name, attrs, selfClosing: false }, range: { start, end: index + 1 } }
    }
    const attrName = /^([^\s=/>]+)/.exec(input.slice(index))
    if (!attrName) return null
    index += attrName[1].length
    let value: string | true = true
    if (input[index] === '=') {
      index++
      const quote = input[index]
      if (quote === '"' || quote === '\'') {
        const end = input.indexOf(quote, index + 1)
        if (end < 0) return null
        value = input.slice(index + 1, end)
        index = end + 1
      } else {
        const bare = /^[^\s>]+/.exec(input.slice(index))
        value = bare ? bare[0] : ''
        index += value.length
      }
    }
    attrs.push({ name: attrName[1], value })
  }
  return null
}

function skipWs (input: string, index: number): number {
  while (index < input.length && /\s/.test(input[index])) index++
  return index
}

export function attrsToMap (attrs: HtmlAttr[]): Record<string, string | true> {
  const map: Record<string, string | true> = {}
  attrs.forEach((attr) => {
    map[attr.name] = attr.value
  })
  return map
}
