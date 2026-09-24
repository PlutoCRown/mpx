import type { Rule, RunRulesOptions } from './types'
import typeOf from '../utils/type'

function defaultNormalizeTest (rawTest: unknown, context: Rule): (input: unknown, meta: Record<string, unknown>, data: Record<string, unknown>) => boolean {
  const testType = typeOf(rawTest)
  switch (testType) {
    case 'Function':
      return (rawTest as (...args: unknown[]) => boolean).bind(context)
    case 'RegExp':
      return (input: unknown) => (rawTest as RegExp).test(input as string)
    case 'String':
      return (input: unknown) => rawTest === input
    default:
      return () => true
  }
}

export default function runRules (rules: Rule[] | { rules?: Rule[] } | undefined, input: unknown, options: RunRulesOptions = {}): unknown {
  const { mode, testKey, normalizeTest, data = {}, meta = {}, waterfall, diagnostic } = options
  let rulesList: Rule[] = (rules as { rules?: Rule[] })?.rules || rules as Rule[] || []
  if (!Array.isArray(rulesList)) rulesList = []
  for (let i = 0; i < rulesList.length; i++) {
    const rule = rulesList[i]
    const tester = (normalizeTest || defaultNormalizeTest)(rule.test, rule)
    const testInput = testKey ? (input as Record<string, unknown>)[testKey] : input
    const processor = mode ? rule[mode] as ((input: unknown, data: Record<string, unknown>, meta: Record<string, unknown>) => unknown) | undefined : undefined
    Object.assign(data, {
      mode,
      diagnostic
    })
    if (tester(testInput, meta, data) && processor) {
      const runProcessor = () => processor.call(rule, input, data, meta)
      const result = diagnostic && diagnostic.withContext
        ? diagnostic.withContext({ mode, rule, input, data, meta, testKey, testInput }, runProcessor)
        : runProcessor()
      meta.processed = true
      if (result !== undefined) {
        input = result
      }
      if (!(rule.waterfall || waterfall)) break
    }
  }
  return input
}
