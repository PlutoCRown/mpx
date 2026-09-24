import * as fs from 'fs'
import * as path from 'path'

export interface JsonJsContext {
  mode: string
  srcMode: string
  env?: string
  defs?: Record<string, unknown>
}

export function buildJsonDefs (context: JsonJsContext): Record<string, unknown> {
  return Object.assign({}, context.defs, {
    __mpx_mode__: context.mode,
    __mpx_src_mode__: context.srcMode,
    __mpx_env__: context.env
  })
}

export function evalJsonJs (source: string, filename: string, defs: Record<string, unknown>, watchFiles: string[]): unknown {
  return runJsonJs(source, filename, defs, watchFiles, [])
}

function runJsonJs (source: string, filename: string, defs: Record<string, unknown>, watchFiles: string[], stack: string[]): unknown {
  if (stack.indexOf(filename) >= 0) {
    throw new Error('[mpx compiler][' + filename + ']: circular json require')
  }
  const defKeys = Object.keys(defs)
  defKeys.forEach((key) => {
    if (!/^[A-Za-z_$][\w$]*$/.test(key)) {
      throw new Error('[mpx compiler][' + filename + ']: json def "' + key + '" is not an identifier')
    }
  })
  const argNames = ['module', 'exports', 'require', '__filename', '__dirname'].concat(defKeys)
  let runner: (...args: unknown[]) => void
  try {
    // Same execution model as webpack-plugin evalJSONJS: the json script is the project source.
    // eslint-disable-next-line no-new-func
    runner = new Function(...argNames, source) as (...args: unknown[]) => void
  } catch (error) {
    throw fail(filename, error)
  }
  const module = { exports: {} as unknown }
  const dirname = path.dirname(filename)
  const args: unknown[] = [
    module,
    module.exports,
    function requireJson (request: string): unknown {
      return loadJsonJs(request, dirname, filename, defs, watchFiles, stack)
    },
    filename,
    dirname
  ]
  defKeys.forEach((key) => {
    args.push(defs[key])
  })
  stack.push(filename)
  try {
    runner(...args)
  } catch (error) {
    throw fail(filename, error)
  } finally {
    stack.pop()
  }
  return module.exports
}

function loadJsonJs (request: string, dirname: string, fromFile: string, defs: Record<string, unknown>, watchFiles: string[], stack: string[]): unknown {
  if (request.charAt(0) === '#') {
    throw new Error('[mpx compiler][' + fromFile + ']: json require "' + request + '" uses an alias. Alias resolution is not part of this slice.')
  }
  let resolved: string
  try {
    resolved = request.startsWith('.')
      ? require.resolve(path.resolve(dirname, request))
      : require.resolve(request, { paths: [dirname] })
  } catch (error) {
    throw fail(fromFile, error)
  }
  if (watchFiles.indexOf(resolved) < 0) watchFiles.push(resolved)
  return runJsonJs(fs.readFileSync(resolved, 'utf8'), resolved, defs, watchFiles, stack)
}

function fail (filename: string, error: unknown): Error {
  if (error instanceof Error && error.message.indexOf('[mpx compiler][') === 0) return error
  const message = error instanceof Error ? error.message : String(error)
  return new Error('[mpx compiler][' + filename + ']: ' + message)
}
