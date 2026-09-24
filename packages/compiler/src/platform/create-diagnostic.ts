import type { Diagnostic, DiagnosticContext, WarnFn, ErrorFn, DiagnosticOptions } from './types'
import {
  normalizeLoc,
  createCodeFrame,
  originalPositionFor,
  readSource
} from '../utils/source-location'

function formatAttr (attr: { name?: string; value?: unknown } | null | undefined): string {
  if (!attr) return ''
  if (attr.value === true || attr.value == null) return attr.name || ''
  return `${attr.name}="${attr.value}"`
}

function formatTarget (context: DiagnosticContext | undefined, extra: Record<string, unknown> | undefined): string {
  const target = extra && extra.target as { kind?: string; prop?: string; value?: unknown; name?: string; params?: string } | undefined
  if (target) {
    if (target.kind === 'css-decl') return `${target.prop}: ${target.value}`
    if (target.kind === 'css-atrule') return `@${target.name}${target.params ? ' ' + target.params : ''}`
    if (target.kind === 'selector') return target.value as string
    if (target.kind === 'event') return target.name as string
  }
  const input = context && context.input as Record<string, unknown> | undefined
  const data = context && context.data
  if (data && data.attr) {
    const attr = data.attr as { name?: string; value?: unknown }
    const el = data.el as { tag?: string } | undefined
    return `<${el && el.tag}${formatAttr(attr) ? ' ' + formatAttr(attr) : ''}>`
  }
  if (input && input.prop) {
    return `${input.prop}: ${input.value}`
  }
  if (input && input.selector) {
    return input.selector as string
  }
  return ''
}

function inferPath (context: DiagnosticContext | undefined, extra: Record<string, unknown> | undefined): string | undefined {
  if (extra && extra.path) {
    return Array.isArray(extra.path) ? extra.path.join('.') : extra.path as string
  }
  const data = context && context.data
  const meta = context && context.meta
  if (data && meta && Array.isArray(meta.paths)) {
    const paths = meta.paths.join('|')
    return ((data.pathArr as string[]) || []).concat(paths).filter(Boolean).join('.')
  }
}

function formatValue (value: unknown): string {
  if (value === undefined) return 'undefined'
  let result: string | undefined
  try {
    result = JSON.stringify(value)
  } catch (_e) {
    result = String(value)
  }
  if (result === undefined) result = String(value)
  return result.length > 120 ? result.slice(0, 117) + '...' : result
}

function inferJsonTarget (context: DiagnosticContext | undefined, extra: Record<string, unknown> | undefined): string {
  const p = inferPath(context, extra)
  if (!p) return ''
  if (extra && Object.prototype.hasOwnProperty.call(extra, 'value')) {
    return `${p}: ${formatValue(extra.value)}`
  }
  return p
}

function inferLoc (context: DiagnosticContext | undefined, extra: Record<string, unknown> | undefined): ReturnType<typeof normalizeLoc> {
  if (extra) {
    if (extra.loc) return normalizeLoc(extra.loc as Parameters<typeof normalizeLoc>[0])
    if (extra.node && (extra.node as Record<string, unknown>).source) return normalizeLoc((extra.node as Record<string, unknown>).source as Parameters<typeof normalizeLoc>[0])
    if (extra.decl && (extra.decl as Record<string, unknown>).source) return normalizeLoc((extra.decl as Record<string, unknown>).source as Parameters<typeof normalizeLoc>[0])
    if (extra.attr) return normalizeLoc((extra.attr as Record<string, unknown>).loc as Parameters<typeof normalizeLoc>[0])
    if (extra.el) return normalizeLoc((extra.el as Record<string, unknown>).loc as Parameters<typeof normalizeLoc>[0])
  }
  const input = context && context.input as Record<string, unknown> | undefined
  const data = context && context.data
  if (data) {
    if (data.attr && (data.attr as Record<string, unknown>).loc) return normalizeLoc((data.attr as Record<string, unknown>).loc as Parameters<typeof normalizeLoc>[0])
    if (data.el && (data.el as Record<string, unknown>).loc) return normalizeLoc((data.el as Record<string, unknown>).loc as Parameters<typeof normalizeLoc>[0])
  }
  if (input) {
    if (input.decl && (input.decl as Record<string, unknown>).source) return normalizeLoc((input.decl as Record<string, unknown>).source as Parameters<typeof normalizeLoc>[0])
    if (input.loc) return normalizeLoc(input.loc as Parameters<typeof normalizeLoc>[0])
  }
}

interface CreateDiagnosticOpts {
  type: string
  mode: string
  srcMode: string
  warn?: WarnFn
  error?: ErrorFn
  diagnostic?: DiagnosticOptions
}

export default function createDiagnostic ({
  type,
  mode,
  srcMode,
  warn,
  error,
  diagnostic = {} as DiagnosticOptions
}: CreateDiagnosticOpts): Diagnostic {
  const stack: DiagnosticContext[] = []
  const file = diagnostic.file
  const source = diagnostic.source
  const sourceMap = diagnostic.sourceMap
  const inputFileSystem = diagnostic.inputFileSystem

  function withContext<T> (context: DiagnosticContext, fn: () => T): T {
    stack.push(context)
    try {
      return fn()
    } finally {
      stack.pop()
    }
  }

  function format (msg: string | Error, extra?: Record<string, unknown>): { message: string; loc: string | undefined } {
    const msgStr = msg && (msg as Error).message ? (msg as Error).message : String(msg)
    const context = stack[stack.length - 1]
    const lines: string[] = []
    const loc = inferLoc(context, extra)
    let finalFile = file
    let finalLoc = loc
    let finalSource = source
    if (sourceMap && loc) {
      const original = originalPositionFor(sourceMap, loc as Parameters<typeof originalPositionFor>[1])
      if (original) {
        finalFile = original.file
        finalLoc = original.loc
        finalSource = original.source || readSource(original.file, inputFileSystem)
      }
    }
    const hasLoc = finalLoc && finalLoc.start
    const locText = finalFile && hasLoc
      ? `${finalFile}:${finalLoc!.start.line}:${finalLoc!.start.column}`
      : ''
    lines.push(msgStr)
    const target = formatTarget(context, extra) || (type === 'json' ? inferJsonTarget(context, extra) : inferPath(context, extra))
    if (target) lines.push(`Target: ${target}`)
    if (srcMode || mode) lines.push(`Mode: ${srcMode || ''}${srcMode && mode ? ' -> ' : ''}${mode || ''}`)
    const frame = createCodeFrame(finalSource, finalLoc as Parameters<typeof createCodeFrame>[1])
    if (frame) {
      lines.push('')
      lines.push(frame)
    }
    return {
      message: lines.join('\n'),
      loc: locText || undefined
    }
  }

  return {
    warn (msg: string | Error, extra?: Record<string, unknown>) {
      const result = format(msg, extra)
      warn && warn(result.message, result.loc)
    },
    error (msg: string | Error, extra?: Record<string, unknown>) {
      const result = format(msg, extra)
      error && error(result.message, result.loc)
    },
    withContext
  }
}
