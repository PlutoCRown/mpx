export type WarnFn = (msg: string, loc?: string) => void
export type ErrorFn = (msg: string, loc?: string) => void

export interface DiagnosticOptions {
  file?: string
  source?: string
  sourceMap?: unknown
  inputFileSystem?: { readFileSync: (path: string, encoding: string) => string }
}

export interface DiagnosticContext {
  mode?: string
  rule?: Rule
  input?: unknown
  data?: Record<string, unknown>
  meta?: Record<string, unknown>
  testKey?: string
  testInput?: unknown
}

export interface Diagnostic {
  warn: (msg: string | Error, extra?: Record<string, unknown>) => void
  error: (msg: string | Error, extra?: Record<string, unknown>) => void
  withContext: <T>(context: DiagnosticContext, fn: () => T) => T
}

export interface Rule {
  test?: unknown
  waterfall?: boolean
  rules?: Rule[]
  [mode: string]: unknown
}

export interface RunRulesOptions {
  mode?: string
  testKey?: string
  normalizeTest?: (test: unknown, context: Rule) => (input: unknown, meta: Record<string, unknown>, data: Record<string, unknown>) => boolean
  data?: Record<string, unknown>
  meta?: Record<string, unknown>
  waterfall?: boolean
  diagnostic?: Diagnostic | null
}

export interface RulesRunnerOptions {
  type: string
  mode: string
  srcMode: string
  data?: Record<string, unknown>
  meta?: Record<string, unknown>
  testKey?: string
  mainKey?: string
  waterfall?: boolean
  warn?: WarnFn
  error?: ErrorFn
  diagnostic?: DiagnosticOptions
}

export interface Spec {
  supportedModes: string[]
  normalizeTest?: (test: unknown, context: Rule) => (input: unknown, meta: Record<string, unknown>, data: Record<string, unknown>) => boolean
  rules?: Rule[] | { rules: Rule[] }
  [key: string]: unknown
}

export type SpecFactory = (opts: { warn: Diagnostic['warn']; error: Diagnostic['error'] }) => Spec
