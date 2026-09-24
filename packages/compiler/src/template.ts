import type { HtmlAttr } from './types'
import { scanHtml } from './html'

const TAG_MAP: Record<string, string> = {
  view: 'div',
  text: 'span',
  image: 'img',
  button: 'button',
  block: 'template',
  'scroll-view': 'div',
  swiper: 'div',
  'swiper-item': 'div',
  navigator: 'a'
}

const EVENT_MAP: Record<string, string> = {
  tap: 'click',
  longpress: 'contextmenu',
  longtap: 'contextmenu',
  touchstart: 'touchstart',
  touchmove: 'touchmove',
  touchend: 'touchend',
  input: 'input',
  change: 'change',
  submit: 'submit',
  focus: 'focus',
  blur: 'blur'
}

export function transformTemplate (source: string): string {
  let output = ''
  const stack: string[] = []
  scanHtml(source, {
    text (value) {
      output += value
    },
    open (tag) {
      const mapped = TAG_MAP[tag.name.toLowerCase()]
      const name = mapped || tag.name
      output += '<' + name + formatAttrs(transformAttrs(tag.attrs))
      if (tag.selfClosing) {
        output += ' />'
        return
      }
      output += '>'
      stack.push(name)
    },
    close () {
      const name = stack.pop()
      if (name) output += '</' + name + '>'
    }
  })
  return output
}

function transformAttrs (attrs: HtmlAttr[]): HtmlAttr[] {
  let forItem = 'item'
  let forIndex = 'index'
  let forExpr: string | null = null
  let keyExpr: string | null = null
  attrs.forEach((attr) => {
    if (attr.value === true) return
    if (attr.name === 'wx:for-item') forItem = attr.value
    else if (attr.name === 'wx:for-index') forIndex = attr.value
    else if (attr.name === 'wx:for') forExpr = stripMustache(attr.value)
    else if (attr.name === 'wx:key') keyExpr = attr.value
  })

  const next: HtmlAttr[] = []
  attrs.forEach((attr) => {
    if (isForAttr(attr.name)) return
    if ((attr.name === 'wx:if' || attr.name === 'wx:elif') && attr.value !== true) {
      next.push({
        name: attr.name === 'wx:if' ? 'v-if' : 'v-else-if',
        value: stripMustache(attr.value)
      })
      return
    }
    if (attr.name === 'wx:else') {
      next.push({ name: 'v-else', value: true })
      return
    }
    const event = parseEvent(attr.name)
    if (event && attr.value !== true) {
      const vueName = EVENT_MAP[event.name] || event.name
      next.push({
        name: '@' + vueName + (event.stop ? '.stop' : ''),
        value: attr.value
      })
      return
    }
    if (attr.value !== true && isFullMustache(attr.value)) {
      next.push({ name: ':' + attr.name, value: stripMustache(attr.value) })
      return
    }
    next.push(attr)
  })

  if (forExpr) {
    const directive: HtmlAttr[] = [{
      name: 'v-for',
      value: '(' + forItem + ', ' + forIndex + ') in ' + forExpr
    }]
    if (keyExpr) {
      directive.push({
        name: ':key',
        value: keyExpr === '*this' ? forItem : forItem + '.' + keyExpr
      })
    }
    return directive.concat(next)
  }
  return next
}

function isForAttr (name: string): boolean {
  return name === 'wx:for' || name === 'wx:for-item' || name === 'wx:for-index' || name === 'wx:key'
}

function parseEvent (name: string): { name: string, stop: boolean } | null {
  const matched = /^(bind|catch):?([A-Za-z][\w-]*)$/.exec(name)
  if (!matched) return null
  return { stop: matched[1] === 'catch', name: matched[2] }
}

function isFullMustache (value: string): boolean {
  return /^\{\{[\s\S]*\}\}$/.test(value.trim())
}

function stripMustache (value: string): string {
  const matched = /^\{\{([\s\S]*)\}\}$/.exec(value.trim())
  return matched ? matched[1].trim() : value.trim()
}

function formatAttrs (attrs: HtmlAttr[]): string {
  let result = ''
  attrs.forEach((attr) => {
    result += ' ' + attr.name
    if (attr.value !== true) result += '="' + escapeAttr(attr.value) + '"'
  })
  return result
}

function escapeAttr (value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}
