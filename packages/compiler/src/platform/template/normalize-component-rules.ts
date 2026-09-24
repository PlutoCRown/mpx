import runRules from '../run-rules'
import type { Rule, Spec, RunRulesOptions } from '../types'

export interface NormalizedComponentConfig {
  test?: unknown
  waterfall?: boolean
  supportedModes?: string[]
  skipNormalize?: boolean
  event?: Rule[]
  props?: Rule[]
  [mode: string]: unknown
}

export default function normalizeComponentRules (
  cfgs: NormalizedComponentConfig[],
  spec: Spec,
  makeAttrsMap: (attrsList: Array<{ name: string; value: unknown }>) => Record<string, unknown>
): Rule[] {
  return cfgs.map((cfg) => {
    const result: Rule = {}
    if (cfg.test) result.test = cfg.test
    if (cfg.waterfall) result.waterfall = cfg.waterfall
    const supportedModes = cfg.supportedModes || spec.supportedModes
    const eventRules = (cfg.event || []).concat((spec.event as { rules: Rule[] }).rules || [])
    supportedModes.forEach((mode) => {
      result[mode] = cfg.skipNormalize
        ? cfg[mode]
        : function (this: Rule, el: Record<string, unknown>, data: Record<string, unknown>) {
          data = Object.assign({}, data, { el, eventRules })
          const testKey = 'name'
          let rAttrsList: Array<Record<string, unknown>> = []
            ;(el.attrsList as Array<Record<string, unknown>>).forEach((attr) => {
            const meta: Record<string, unknown> = {}
            const options = {
              mode,
              testKey,
              diagnostic: data.diagnostic as RunRulesOptions['diagnostic'],
              data: Object.assign({}, data, { attr })
            }
            let rAttr: unknown = runRules(spec.directive as Rule[], attr, Object.assign({}, options, { meta }))
            if (!meta.processed) {
              rAttr = runRules(spec.preProps as Rule[], rAttr, options)
              rAttr = runRules(cfg.props as Rule[], rAttr, options)
              if (Array.isArray(rAttr)) {
                rAttr = rAttr.map((a) => {
                  return runRules(spec.postProps as Rule[], a, options)
                })
              } else if (rAttr !== false) {
                rAttr = runRules(spec.postProps as Rule[], rAttr, options)
              }
            }
            if (Array.isArray(rAttr)) {
              rAttrsList = rAttrsList.concat(rAttr as Array<Record<string, unknown>>)
            } else if (rAttr !== false) {
              rAttrsList.push(rAttr as Record<string, unknown>)
            }
          })
          el.attrsList = rAttrsList
          el.attrsMap = makeAttrsMap(rAttrsList as Array<{ name: string; value: unknown }>)
          const tagHandler = cfg[mode] as ((tag: string, data: Record<string, unknown>) => string | undefined) | undefined
          const rTag = tagHandler && tagHandler.call(this, el.tag as string, data)
          if (rTag) {
            el.tag = rTag
          }
          return el
        }
    })
    return result
  })
}
