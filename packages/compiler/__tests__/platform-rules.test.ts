import { getRulesRunner, runRules } from '../src'
import type { Rule } from '../src'

describe('platform rules entry', () => {
  it('returns a json runner for react modes and nothing for an unknown mode', () => {
    const runner = getRulesRunner({
      type: 'json',
      mode: 'ios',
      srcMode: 'wx',
      mainKey: 'page'
    })
    expect(typeof runner).toBe('function')
    const input = {}
    expect(runner && runner(input)).toBe(input)
    expect(getRulesRunner({
      type: 'json',
      mode: 'not-a-mode',
      srcMode: 'wx'
    })).toBeUndefined()
    expect(getRulesRunner({
      type: 'style',
      mode: 'android',
      srcMode: 'wx'
    })).toEqual(expect.any(Function))
  })

  it('runRules applies only the processor for the active mode', () => {
    const rules: Rule[] = [{
      test: 'keep',
      ios: (input: unknown) => String(input) + ':ios'
    }]
    expect(runRules(rules, 'keep', { mode: 'ios' })).toBe('keep:ios')
    expect(runRules(rules, 'other', { mode: 'ios' })).toBe('other')
    expect(runRules(rules, 'keep', { mode: 'web' })).toBe('keep')
  })
})
