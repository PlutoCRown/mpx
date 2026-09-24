import getRulesRunner from './platform/index'

/**
 * Frozen Neuro hook (PR #3 / #7). Do not rename params.
 * Delegates to extracted platform rule tables for cross-mode transforms.
 */
export function applyPlatformRules (input: unknown, opts: { type: 'template' | 'style' | 'json', mode: string, srcMode: string }): unknown {
  // Template AST rules expect element nodes (webpack template-compiler).
  // Neuro's serialize path passes raw template strings — apply directive
  // prefix rewrites that mirror wx → target rules (wx:if → a:if, etc.).
  if (opts.type === 'template' && typeof input === 'string') {
    return transformTemplateString(input, opts.mode, opts.srcMode)
  }

  // Style AST rules expect postcss nodes; plain CSS strings stay unchanged
  // for mini-program serialize (RN style rules are AST-only / Harbor).
  if (opts.type === 'style' && typeof input === 'string') {
    return input
  }

  const runnerOpts: {
    type: 'template' | 'style' | 'json'
    mode: string
    srcMode: string
    waterfall: boolean
    mainKey?: string
  } = {
    type: opts.type,
    mode: opts.mode,
    srcMode: opts.srcMode,
    waterfall: true
  }
  // Page-level window rules (navigationBarTitleText → defaultTitle, …).
  if (opts.type === 'json') {
    runnerOpts.mainKey = 'page'
  }

  const runner = getRulesRunner(runnerOpts)
  if (!runner) return input
  const result = runner(input)
  return result === undefined ? input : result
}

/** Matches template/wx directive /^wx:(.*)$/ handlers (no qa in that rule). */
const WX_DIRECTIVE_PREFIX: Record<string, string> = {
  ali: 'a:',
  swan: 's-',
  qq: 'qq:',
  tt: 'tt:',
  jd: 'jd:',
  ks: 'ks:',
  dd: 'dd:'
}

function transformTemplateString (input: string, mode: string, srcMode: string): string {
  if (!input || srcMode !== 'wx' || mode === 'wx') return input
  if (mode === 'web') {
    return input
      .replace(/\bwx:if=/g, 'v-if=')
      .replace(/\bwx:elif=/g, 'v-else-if=')
      .replace(/\bwx:else\b/g, 'v-else')
      .replace(/\bwx:for=/g, 'v-for=')
      .replace(/\bwx:key=/g, ':key=')
  }
  const prefix = WX_DIRECTIVE_PREFIX[mode]
  if (!prefix) return input
  return input.replace(/\bwx:/g, prefix)
}
