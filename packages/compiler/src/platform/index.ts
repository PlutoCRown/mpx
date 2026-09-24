import runRules from './run-rules'
import createDiagnostic from './create-diagnostic'
import type { RulesRunnerOptions, Spec, Rule, Diagnostic } from './types'

type SpecFactory = (opts: { warn: Diagnostic['warn']; error: Diagnostic['error'] }) => Spec

// Lazy-loaded spec factories — only required when actually needed
let _getTemplateWxSpec: SpecFactory | null = null
let _getStyleWxSpec: SpecFactory | null = null
let _getJsonWxSpec: SpecFactory | null = null

function getSpecFactory (type: string, srcMode: string): SpecFactory | undefined {
  if (srcMode !== 'wx') return undefined
  switch (type) {
    case 'template':
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      if (!_getTemplateWxSpec) _getTemplateWxSpec = require('./template/wx').default
      return _getTemplateWxSpec!
    case 'style':
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      if (!_getStyleWxSpec) _getStyleWxSpec = require('./style/wx').default
      return _getStyleWxSpec!
    case 'json':
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      if (!_getJsonWxSpec) _getJsonWxSpec = require('./json/wx').default
      return _getJsonWxSpec!
  }
}

// wx srcMode specs never target wx itself — skip spec creation for identity transforms
const IDENTITY_MODES = new Set(['wx'])

export default function getRulesRunner ({
  type,
  mode,
  srcMode,
  data,
  meta,
  testKey,
  mainKey,
  waterfall,
  warn,
  error,
  diagnostic
}: RulesRunnerOptions): ((input: unknown) => unknown) | undefined {
  if (srcMode === 'wx' && IDENTITY_MODES.has(mode)) return undefined
  const diag = createDiagnostic({
    type,
    mode,
    srcMode,
    warn,
    error,
    diagnostic
  })
  const specFactory = getSpecFactory(type, srcMode)
  if (!specFactory) return undefined
  const spec = specFactory({
    warn: diag.warn,
    error: diag.error
  })
  if (spec && spec.supportedModes.indexOf(mode) > -1) {
    const normalizeTest = spec.normalizeTest
    const mainRules = mainKey ? spec[mainKey] as Rule[] | { rules: Rule[] } : spec
    if (mainRules) {
      return function (input: unknown) {
        return runRules(mainRules as Rule[], input, { mode, data, meta, testKey, waterfall, normalizeTest, diagnostic: diag })
      }
    }
  }
}
