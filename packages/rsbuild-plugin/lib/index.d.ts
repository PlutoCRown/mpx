import type { RsbuildPlugin } from '@rsbuild/core'

export type MpxTarget = 'wx' | 'ali' | 'swan' | 'qq' | 'tt' | 'qa' | 'jd' | 'dd' | 'ks' | 'web' | 'ios' | 'android' | 'harmony'
export type MatchCondition = string | RegExp | ((resource: string) => boolean) | MatchCondition[]
export interface MpxRule {
  include?: MatchCondition
  exclude?: MatchCondition
}
export interface MpxOptions {
  mode?: MpxTarget
  srcMode?: MpxTarget
  env?: string
  projectRoot?: string
  defs?: Record<string, unknown>
  appImports?: string[]
  scriptPlugins?: (resourcePath: string, code: string) => unknown[] | undefined
  resolveMode?: 'webpack' | 'native'
  srcModeRules?: Partial<Record<MpxTarget, MpxRule>>
  partialCompileRules?: { pages?: MpxRule, components?: MpxRule }
  transMpxRules?: MpxRule
  transRpxRules?: MpxRule | MpxRule[]
  pathHashMode?: 'absolute' | 'relative'
  forceUsePageCtor?: boolean
  disableRequireAsync?: boolean
  asyncSubpackageRules?: (MpxRule & { root: string })[]
  retryRequireAsync?: boolean | { times?: number, interval?: number }
  webConfig?: Record<string, unknown>
  rnConfig?: Record<string, unknown>
  [option: string]: unknown
}

export function pluginMpx(options?: MpxOptions): RsbuildPlugin
