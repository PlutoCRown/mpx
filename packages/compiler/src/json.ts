import * as fs from 'fs'
import * as path from 'path'
import { parse as parseJson5 } from 'json5'
import type { SfcBlock } from './types'

export interface ParsedJsonBlock {
  json: Record<string, unknown>
  watchFiles: string[]
}

export function parseJsonBlock (block: SfcBlock | null, resourceFile: string, srcMode: string): ParsedJsonBlock {
  if (!block || !block.content.trim()) return { json: {}, watchFiles: [] }
  if (block.name === 'json') {
    const evaluated = evalJsonSource(block.content, resourceFile, srcMode, [])
    return {
      json: asJsonObject(evaluated.value, resourceFile),
      watchFiles: evaluated.watchFiles
    }
  }
  return {
    json: asJsonObject(parseJsonValue(block.content, resourceFile), resourceFile),
    watchFiles: []
  }
}

interface JsonEval {
  value: unknown
  watchFiles: string[]
}

type JsonRunner = (
  module: { exports: unknown },
  exports: unknown,
  require: (request: string) => unknown,
  filename: string,
  dirname: string,
  mpxMode: string,
  mpxSrcMode: string,
  mpxEnv: string
) => void

function evalJsonSource (source: string, filename: string, srcMode: string, stack: string[]): JsonEval {
  if (stack.indexOf(filename) >= 0) {
    throw new Error('[mpx compiler][' + filename + ']: circular JSON require')
  }
  const nextStack = stack.concat(filename)
  const watchFiles: string[] = []
  const wrapped = wrapObjectLiteral(source)
  try {
    return {
      value: runJsonProgram(wrapped, filename, srcMode, nextStack, watchFiles),
      watchFiles
    }
  } catch (error) {
    if (wrapped === source || !(error instanceof SyntaxError)) throw wrapError(error, filename)
    const retryWatch: string[] = []
    try {
      return {
        value: runJsonProgram(source, filename, srcMode, nextStack, retryWatch),
        watchFiles: retryWatch
      }
    } catch (retryError) {
      throw wrapError(retryError, filename)
    }
  }
}

function runJsonProgram (source: string, filename: string, srcMode: string, stack: string[], watchFiles: string[]): unknown {
  const runner = compileRunner(source)
  const current: { exports: unknown } = { exports: {} }
  runner(
    current,
    current.exports,
    (request: string) => loadDependency(request, filename, srcMode, stack, watchFiles),
    filename,
    path.dirname(filename),
    'web',
    srcMode,
    ''
  )
  return current.exports
}

function compileRunner (source: string): JsonRunner {
  // Same evaluation model as webpack-plugin evalJSONJS: the block is a CommonJS program.
  // eslint-disable-next-line no-new-func
  return new Function(
    'module',
    'exports',
    'require',
    '__filename',
    '__dirname',
    '__mpx_mode__',
    '__mpx_src_mode__',
    '__mpx_env__',
    source
  ) as JsonRunner
}

function loadDependency (request: string, fromFile: string, srcMode: string, stack: string[], watchFiles: string[]): unknown {
  const resolved = resolveJsonRequest(request, fromFile)
  if (watchFiles.indexOf(resolved) < 0) watchFiles.push(resolved)
  const text = readText(resolved)
  if (path.extname(resolved) === '.json') return parseJsonValue(text, resolved)
  const nested = evalJsonSource(text, resolved, srcMode, stack)
  nested.watchFiles.forEach((file) => {
    if (watchFiles.indexOf(file) < 0) watchFiles.push(file)
  })
  return nested.value
}

function resolveJsonRequest (request: string, fromFile: string): string {
  const dirname = path.dirname(fromFile)
  try {
    if (request.startsWith('.')) return require.resolve(path.resolve(dirname, request))
    return require.resolve(request, { paths: [dirname] })
  } catch (error) {
    throw wrapError(error, fromFile)
  }
}

function readText (file: string): string {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch (error) {
    throw wrapError(error, file)
  }
}

function wrapObjectLiteral (source: string): string {
  const start = skipSpace(source, 0)
  if (source[start] !== '{') return source
  return 'module.exports = (' + source + '\n)'
}

function parseJsonValue (content: string, filename: string): unknown {
  try {
    const parsed: unknown = parseJson5(content)
    return parsed
  } catch (error) {
    throw wrapError(error, filename)
  }
}

function asJsonObject (value: unknown, filename: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('[mpx compiler][' + filename + ']: JSON block must be an object')
  }
  return value as Record<string, unknown>
}

function wrapError (error: unknown, filename: string): Error {
  if (error instanceof Error && error.message.indexOf('[mpx compiler][') === 0) return error
  const message = error instanceof Error ? error.message : String(error)
  return new Error('[mpx compiler][' + filename + ']: ' + message)
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
      const next = input.indexOf('\n', cursor)
      cursor = next < 0 ? input.length : next + 1
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
