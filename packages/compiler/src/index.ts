// Platform rules API (Harbor-stable)
export { default as getRulesRunner } from './platform/index'
export { default as runRules } from './platform/run-rules'
export { default as createDiagnostic } from './platform/create-diagnostic'
export { setCompilerBridge, getCompilerBridge } from './platform/compiler-bridge'
export type { CompilerBridge } from './platform/compiler-bridge'
export type { Rule, Spec, SpecFactory, RulesRunnerOptions, RunRulesOptions, Diagnostic, DiagnosticOptions, WarnFn, ErrorFn } from './platform/types'

// Neuro's frozen hook
export { applyPlatformRules } from './platform'

// Mode helpers
export { isReact as isReactMode, isWeb, isMiniProgram } from './utils/env'
export { isMiniProgramMode, miniProgramAssets } from './modes'

export const supportedModes = [
  'wx', 'ali', 'swan', 'qq', 'tt', 'ks', 'web', 'qa', 'jd', 'dd',
  'ios', 'android', 'harmony'
] as const

export { compileMpxFile } from './compile'
export type {
  CompileMpxFileOptions,
  CompileMpxFileResult,
  MiniProgramFiles,
  MiniProgramMode,
  MpxCompileMode,
  MpxCtorType,
  WxAssetFiles
} from './types'
