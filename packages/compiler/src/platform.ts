export function applyPlatformRules (input: unknown, opts: { type: 'template' | 'style' | 'json', mode: string, srcMode: string }): unknown {
  const runner = getRulesRunner(opts)
  if (!runner) return input
  const result = runner(input)
  return result === undefined ? input : result
}

// Placeholder for the platform rule runner. Return undefined to keep input unchanged.
function getRulesRunner (_opts: { type: 'template' | 'style' | 'json', mode: string, srcMode: string }): ((input: unknown) => unknown) | undefined {
  return undefined
}
