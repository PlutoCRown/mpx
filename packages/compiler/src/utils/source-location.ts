import path from 'path'

let codeFrameColumns: ((source: string, loc: Record<string, unknown>, opts?: Record<string, unknown>) => string) | null = null
let TraceMap: (new (map: unknown) => unknown) | null = null
let traceOriginalPositionFor: ((tracer: unknown, pos: Record<string, unknown>) => Record<string, unknown> | null) | null = null
let sourceContentFor: ((tracer: unknown, source: string) => string | null) | null = null

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const bf = require('@babel/code-frame')
  codeFrameColumns = bf.codeFrameColumns
} catch (_e) {
  // optional dependency
}

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const tm = require('@jridgewell/trace-mapping')
  TraceMap = tm.TraceMap
  traceOriginalPositionFor = tm.originalPositionFor
  sourceContentFor = tm.sourceContentFor
} catch (_e) {
  // optional dependency
}

interface Loc {
  start?: { line: number; column?: number }
  end?: { line: number; column?: number }
  line?: number
  column?: number
}

export function offsetToPosition (source: string, offset: number): { line: number; column: number } {
  const before = source.slice(0, offset)
  const lines = before.split(/\r\n|\r|\n/)
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1
  }
}

export function offsetToLoc (source: string, start: number, end?: number): { start: { line: number; column: number }; end?: { line: number; column: number } } {
  const loc: { start: { line: number; column: number }; end?: { line: number; column: number } } = {
    start: offsetToPosition(source, start)
  }
  if (end != null) {
    loc.end = offsetToPosition(source, end)
  }
  return loc
}

export function normalizeLoc (loc: Loc | null | undefined): { start: { line: number; column?: number }; end?: { line: number; column?: number } } | undefined {
  if (!loc) return
  if (loc.start) return loc as { start: { line: number; column?: number } }
  if (loc.line) {
    return {
      start: {
        line: loc.line,
        column: loc.column || 1
      }
    }
  }
}

export function createCodeFrame (source: string | null | undefined, loc: Loc | null | undefined): string {
  const normalized = normalizeLoc(loc)
  if (!source || !normalized || !normalized.start) return ''
  if (!codeFrameColumns) return ''
  return codeFrameColumns(source, normalized as Record<string, unknown>, {
    highlightCode: false
  })
}

export function originalPositionFor (map: unknown, loc: Loc | null | undefined): { file: string; loc: { start: { line: number; column: number } }; source: string | undefined; generatedLoc: unknown } | undefined {
  const normalized = normalizeLoc(loc)
  if (!map || !normalized || !normalized.start) return
  if (!TraceMap || !traceOriginalPositionFor) return
  let tracer: unknown
  try {
    tracer = new TraceMap(map)
  } catch (_e) {
    return
  }
  const original = traceOriginalPositionFor(tracer, {
    line: normalized.start.line,
    column: Math.max((normalized.start.column || 1) - 1, 0)
  })
  if (!original || !(original as Record<string, unknown>).source || !(original as Record<string, unknown>).line) return
  const origRecord = original as Record<string, unknown>
  return {
    file: origRecord.source as string,
    loc: {
      start: {
        line: origRecord.line as number,
        column: ((origRecord.column as number) || 0) + 1
      }
    },
    source: (sourceContentFor ? sourceContentFor(tracer, origRecord.source as string) : undefined) || undefined,
    generatedLoc: normalized
  }
}

export function readSource (file: string | null | undefined, inputFileSystem: { readFileSync: (path: string, encoding: string) => string } | null | undefined): string {
  if (!file || !inputFileSystem) return ''
  try {
    return inputFileSystem.readFileSync(path.resolve(file), 'utf-8')
  } catch (_e) {
    return ''
  }
}
