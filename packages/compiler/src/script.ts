import * as path from 'path'
import type { MpxCtorType } from './types'

const CTORS = ['createPage', 'createComponent', 'Page', 'Component']

export interface ScriptBuild {
  code: string
  ctorType: MpxCtorType
  watchFiles: string[]
  lang: string | null
}

export function buildScript (options: {
  script: string
  resourceFile: string
  ctorType?: MpxCtorType
  usingComponents: Array<{ name: string, request: string }>
  pageConfig: Record<string, unknown> | null
  lang?: string
}): ScriptBuild {
  const found = findCtor(options.script)
  if (found && !found.objectLiteral) {
    throw new Error('[mpx compiler][' + options.resourceFile + ']: ' + found.name + '() argument must be an object literal in this slice')
  }
  const inferred = found ? inferCtorType(found.name) : 'component'
  const ctorType = options.ctorType || inferred
  const optionsLiteral = found && found.objectLiteral
    ? rewriteDataOption(found.objectLiteral)
    : '{}'
  const leftover = found
    ? stripCoreCtorImport(options.script.slice(0, found.start) + options.script.slice(found.end)).trim()
    : options.script.trim()
  const parts = splitLeadingImports(leftover)

  const watchFiles: string[] = []
  let code = '/* @mpxjs/compiler mode=web */\n'
  if (parts.imports) code += parts.imports + '\n'
  options.usingComponents.forEach((component, index) => {
    const binding = componentBinding(component.name, index)
    const request = toComponentRequest(component.request)
    code += 'import ' + binding + ' from ' + JSON.stringify(request) + '\n'
    const watched = resolveWatch(options.resourceFile, request)
    if (watched) watchFiles.push(watched)
  })
  if (parts.body) code += parts.body + '\n'
  code += 'const __mpxOptions = ' + optionsLiteral + '\n'
  if (options.usingComponents.length) {
    code += '__mpxOptions.components = Object.assign({}, __mpxOptions.components, {\n'
    options.usingComponents.forEach((component, index) => {
      const comma = index === options.usingComponents.length - 1 ? '' : ','
      code += '  ' + componentKey(component.name) + ': ' + componentBinding(component.name, index) + comma + '\n'
    })
    code += '})\n'
  }
  if (options.pageConfig) {
    code += '__mpxOptions.__mpxPageConfig = ' + JSON.stringify(options.pageConfig) + '\n'
  }
  code += '__mpxOptions.__mpxCtorType = ' + JSON.stringify(ctorType) + '\n'
  code += 'export default __mpxOptions\n'
  return { code, ctorType, watchFiles, lang: normalizeScriptLang(options.lang) }
}

function normalizeScriptLang (lang: string | undefined): string | null {
  if (!lang) return null
  const value = lang.toLowerCase()
  if (value === 'js' || value === 'javascript') return null
  if (value === 'ts' || value === 'typescript') return 'ts'
  return lang
}

function splitLeadingImports (source: string): { imports: string, body: string } {
  let index = 0
  let end = 0
  while (index < source.length) {
    const cursor = skipSpace(source, index)
    if (!isImportKeyword(source, cursor)) break
    end = skipImportStatement(source, cursor)
    index = end
  }
  if (!end) return { imports: '', body: source.trim() }
  return {
    imports: source.slice(0, end).trim(),
    body: source.slice(end).trim()
  }
}

function isImportKeyword (input: string, index: number): boolean {
  if (input.slice(index, index + 6) !== 'import') return false
  const next = input[index + 6]
  if (next === '(') return false
  return !next || !/[\w$]/.test(next)
}

function skipImportStatement (input: string, index: number): number {
  let cursor = index + 'import'.length
  let depth = 0
  let done = false
  let seenRequire = false
  while (cursor < input.length) {
    const current = input[cursor]
    if (current === '\'' || current === '"' || current === '`') {
      cursor = skipString(input, cursor)
      if (depth === 0) done = true
      continue
    }
    if (current === '/' && input[cursor + 1] === '/') {
      cursor = skipLine(input, cursor)
      if (depth === 0 && done) return cursor
      continue
    }
    if (current === '/' && input[cursor + 1] === '*') {
      const end = input.indexOf('*/', cursor + 2)
      cursor = end < 0 ? input.length : end + 2
      continue
    }
    if (current === '{' || current === '(' || current === '[') {
      depth++
      cursor++
      continue
    }
    if (current === '}' || current === ']') {
      depth--
      cursor++
      continue
    }
    if (current === ')') {
      depth--
      cursor++
      if (depth === 0 && seenRequire) done = true
      continue
    }
    if (/[A-Za-z_$]/.test(current)) {
      const ident = /^[A-Za-z_$][\w$]*/.exec(input.slice(cursor))
      if (ident && ident[0] === 'require') seenRequire = true
      cursor += ident ? ident[0].length : 1
      continue
    }
    if (depth === 0 && current === ';' && done) return cursor + 1
    if (depth === 0 && current === '\n' && done) return cursor
    cursor++
  }
  return cursor
}

function inferCtorType (name: string): MpxCtorType {
  if (name === 'createPage' || name === 'Page') return 'page'
  return 'component'
}

interface CtorHit {
  name: string
  start: number
  end: number
  objectLiteral: string | null
}

function findCtor (script: string): CtorHit | null {
  let index = 0
  while (index < script.length) {
    index = skipSpace(script, index)
    if (index >= script.length) return null
    const quote = script[index]
    if (quote === '\'' || quote === '"' || quote === '`') {
      index = skipString(script, index)
      continue
    }
    if (!/[A-Za-z_$]/.test(script[index])) {
      index++
      continue
    }
    const ident = /^[A-Za-z_$][\w$]*/.exec(script.slice(index))
    if (!ident) {
      index++
      continue
    }
    const start = index
    index += ident[0].length
    if (CTORS.indexOf(ident[0]) < 0) continue
    if (start > 0 && /[\w$.]/.test(script[start - 1])) continue
    const paren = skipCallParen(script, index)
    if (paren < 0) continue
    const argStart = skipSpace(script, paren + 1)
    if (script[argStart] !== '{') {
      return { name: ident[0], start, end: paren + 1, objectLiteral: null }
    }
    const objectEnd = skipBalanced(script, argStart, '{', '}')
    const call = readCallTail(script, objectEnd)
    return {
      name: ident[0],
      start,
      end: call.end,
      objectLiteral: script.slice(argStart, call.exprEnd).trim()
    }
  }
  return null
}

function skipCallParen (input: string, index: number): number {
  let cursor = skipSpace(input, index)
  if (input[cursor] === '<') {
    const after = skipTypeArgs(input, cursor)
    if (after === cursor) return -1
    cursor = skipSpace(input, after)
  }
  return input[cursor] === '(' ? cursor : -1
}

function skipTypeArgs (input: string, index: number): number {
  if (input[index] !== '<') return index
  let depth = 0
  let cursor = index
  while (cursor < input.length) {
    const current = input[cursor]
    if (current === '\'' || current === '"' || current === '`') {
      cursor = skipString(input, cursor)
      continue
    }
    if (current === '/' && input[cursor + 1] === '/') {
      cursor = skipLine(input, cursor)
      continue
    }
    if (current === '/' && input[cursor + 1] === '*') {
      const end = input.indexOf('*/', cursor + 2)
      cursor = end < 0 ? input.length : end + 2
      continue
    }
    if (current === '<') depth++
    else if (current === '>') {
      depth--
      if (depth === 0) return cursor + 1
    }
    cursor++
  }
  return index
}

function readCallTail (input: string, objectEnd: number): { exprEnd: number, end: number } {
  const afterObject = skipSpace(input, objectEnd + 1)
  if (isKeyword(input, afterObject, 'as') || isKeyword(input, afterObject, 'satisfies')) {
    const paren = findCallParen(input, afterObject)
    if (input[paren] === ')') {
      return { exprEnd: paren, end: skipSemicolon(input, paren + 1) }
    }
  }
  let end = afterObject
  if (input[end] === ')') end++
  return { exprEnd: objectEnd + 1, end: skipSemicolon(input, end) }
}

function findCallParen (input: string, index: number): number {
  let depth = 0
  let cursor = index
  while (cursor < input.length) {
    const current = input[cursor]
    if (current === '\'' || current === '"' || current === '`') {
      cursor = skipString(input, cursor)
      continue
    }
    if (current === '/' && input[cursor + 1] === '/') {
      cursor = skipLine(input, cursor)
      continue
    }
    if (current === '/' && input[cursor + 1] === '*') {
      const end = input.indexOf('*/', cursor + 2)
      cursor = end < 0 ? input.length : end + 2
      continue
    }
    if (current === '(') depth++
    else if (current === ')') {
      if (depth === 0) return cursor
      depth--
    }
    cursor++
  }
  return cursor
}

function isKeyword (input: string, index: number, word: string): boolean {
  if (input.slice(index, index + word.length) !== word) return false
  const next = input[index + word.length]
  return !next || !/[\w$]/.test(next)
}

function rewriteDataOption (literal: string): string {
  let index = skipSpace(literal, 1)
  while (index < literal.length && literal[index] !== '}') {
    if (literal[index] === ',') {
      index = skipSpace(literal, index + 1)
      continue
    }
    if (literal.startsWith('...', index)) {
      index = skipSpace(literal, skipValue(literal, index + 3))
      continue
    }
    const keyInfo = readKey(literal, index)
    if (!keyInfo) break
    index = skipSpace(literal, keyInfo.end)
    if (literal[index] === '(') {
      index = skipBalanced(literal, index, '(', ')') + 1
      index = skipSpace(literal, index)
      if (literal[index] === '{') index = skipBalanced(literal, index, '{', '}') + 1
      index = skipSpace(literal, index)
      continue
    }
    if (literal[index] !== ':') break
    const valueStart = skipSpace(literal, index + 1)
    if (keyInfo.key === 'data' && literal[valueStart] === '{') {
      const valueEnd = skipBalanced(literal, valueStart, '{', '}')
      const wrapped = 'function () { return ' + literal.slice(valueStart, valueEnd + 1) + ' }'
      literal = literal.slice(0, valueStart) + wrapped + literal.slice(valueEnd + 1)
      index = skipSpace(literal, valueStart + wrapped.length)
      continue
    }
    index = skipSpace(literal, skipValue(literal, valueStart))
  }
  return literal
}

function readKey (input: string, index: number): { key: string, end: number } | null {
  const quote = input[index]
  if (quote === '\'' || quote === '"') {
    const end = skipString(input, index)
    return { key: input.slice(index + 1, end - 1), end }
  }
  const ident = /^[A-Za-z_$][\w$]*/.exec(input.slice(index))
  if (!ident) return null
  return { key: ident[0], end: index + ident[0].length }
}

function stripCoreCtorImport (script: string): string {
  return script.replace(/^[ \t]*import\s*\{([^}]+)\}\s*from\s*(['"])@mpxjs\/core\2\s*;?[ \t]*\r?\n?/gm, (full, specifiers: string) => {
    const names = specifiers.split(',').map((part) => part.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean)
    const onlyCtors = names.every((name) => CTORS.indexOf(name) >= 0)
    return onlyCtors ? '' : full
  })
}

function componentBinding (name: string, index: number): string {
  const cleaned = name.replace(/[^\w$]/g, '_')
  const base = /^[A-Za-z_$]/.test(cleaned) ? cleaned : 'comp'
  return '__mpx_' + base + '_' + index
}

function componentKey (name: string): string {
  if (/^[A-Za-z_$][\w$]*$/.test(name)) return name
  return JSON.stringify(name)
}

function toComponentRequest (request: string): string {
  if (!request.startsWith('.')) return request
  const query = request.indexOf('?')
  const pathname = query >= 0 ? request.slice(0, query) : request
  const search = query >= 0 ? request.slice(query) : ''
  if (path.posix.extname(pathname)) return request
  return pathname + '.mpx' + search
}

function resolveWatch (resourceFile: string, request: string): string | null {
  if (!request.startsWith('.')) return null
  const query = request.indexOf('?')
  const pathname = query >= 0 ? request.slice(0, query) : request
  return path.resolve(path.dirname(resourceFile), pathname)
}

function skipSemicolon (input: string, index: number): number {
  const next = skipSpace(input, index)
  return input[next] === ';' ? next + 1 : index
}

function skipValue (input: string, index: number): number {
  index = skipSpace(input, index)
  if (input[index] === '{') return skipBalanced(input, index, '{', '}') + 1
  if (input[index] === '[') return skipBalanced(input, index, '[', ']') + 1
  if (input[index] === '(') return skipBalanced(input, index, '(', ')') + 1
  if (input[index] === '\'' || input[index] === '"' || input[index] === '`') return skipString(input, index)
  if (input.slice(index, index + 8) === 'function') {
    let cursor = skipSpace(input, index + 8)
    if (input[cursor] === '(') cursor = skipBalanced(input, cursor, '(', ')') + 1
    cursor = skipSpace(input, cursor)
    if (input[cursor] === '{') return skipBalanced(input, cursor, '{', '}') + 1
    return cursor
  }
  while (index < input.length) {
    const current = input[index]
    if (current === ',' || current === '}') return index
    if (current === '\'' || current === '"' || current === '`') {
      index = skipString(input, index)
      continue
    }
    if (current === '{') {
      index = skipBalanced(input, index, '{', '}') + 1
      continue
    }
    if (current === '[') {
      index = skipBalanced(input, index, '[', ']') + 1
      continue
    }
    if (current === '(') {
      index = skipBalanced(input, index, '(', ')') + 1
      continue
    }
    index++
  }
  return index
}

function skipBalanced (input: string, index: number, open: string, close: string): number {
  let depth = 0
  let cursor = index
  while (cursor < input.length) {
    const current = input[cursor]
    if (current === '\'' || current === '"' || current === '`') {
      cursor = skipString(input, cursor)
      continue
    }
    if (current === '/' && input[cursor + 1] === '/') {
      cursor = skipLine(input, cursor)
      continue
    }
    if (current === '/' && input[cursor + 1] === '*') {
      const end = input.indexOf('*/', cursor + 2)
      cursor = end < 0 ? input.length : end + 2
      continue
    }
    if (current === open) depth++
    else if (current === close) {
      depth--
      if (depth === 0) return cursor
    }
    cursor++
  }
  return cursor
}

function skipString (input: string, index: number): number {
  const quote = input[index]
  let cursor = index + 1
  if (quote === '`') {
    while (cursor < input.length) {
      if (input[cursor] === '\\') {
        cursor += 2
        continue
      }
      if (input[cursor] === '`') return cursor + 1
      if (input[cursor] === '$' && input[cursor + 1] === '{') {
        cursor = skipBalanced(input, cursor + 1, '{', '}') + 1
        continue
      }
      cursor++
    }
    return cursor
  }
  while (cursor < input.length) {
    if (input[cursor] === '\\') {
      cursor += 2
      continue
    }
    if (input[cursor] === quote) return cursor + 1
    cursor++
  }
  return cursor
}

function skipSpace (input: string, index: number): number {
  let cursor = index
  while (cursor < input.length) {
    const current = input[cursor]
    if (current === ' ' || current === '\n' || current === '\r' || current === '\t') {
      cursor++
      continue
    }
    if (current === '/' && input[cursor + 1] === '/') {
      cursor = skipLine(input, cursor)
      continue
    }
    if (current === '/' && input[cursor + 1] === '*') {
      const end = input.indexOf('*/', cursor + 2)
      cursor = end < 0 ? input.length : end + 2
      continue
    }
    break
  }
  return cursor
}

function skipLine (input: string, index: number): number {
  const next = input.indexOf('\n', index)
  return next < 0 ? input.length : next + 1
}
