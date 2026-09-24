import runRules from '../../run-rules'
import type { Spec, Rule, Diagnostic } from '../../types'
import type { NormalizedComponentConfig } from '../normalize-component-rules'
import normalizeComponentRules from '../normalize-component-rules'
import { getCompilerBridge } from '../../compiler-bridge'
import isValidIdentifierStr from '../../../utils/is-valid-identifier-str'
import { dash2hump } from '../../../utils/hump-dash'
import JSON5 from 'json5'
import getComponentConfigs from './component-config'

export default function getSpec ({ warn, error }: { warn: Diagnostic['warn']; error: Diagnostic['error'] }): Spec {
  const bridge = getCompilerBridge()
  const { parseMustacheWithContext, stringifyWithResolveComputed, makeAttrsMap } = bridge
  // normalize-lib may be absent in some consumers; fall back to webpack-plugin path
  let normalizeLib: (file: string) => string
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    normalizeLib = require('../../../utils/normalize-lib').default
  } catch (_e) {
    normalizeLib = (file: string) => '@mpxjs/webpack-plugin/lib/' + file
  }

  function getRnDirectiveEventHandle (mode: string) {
    return function (this: Rule, { name, value }: { name: string; value: unknown }, { eventRules, el, attr, diagnostic }: Record<string, unknown>) {
      const match = (this.test as RegExp).exec(name)!
      const prefix = match[1]
      const eventName = match[2]
      const modifierStr = match[3] || ''
      const meta = {
        modifierStr
      }
      const data = { el, attr, eventName }
      const rPrefix = runRules((spec.event as Record<string, unknown>).prefix as Rule[], prefix, { mode, data, diagnostic: diagnostic as Diagnostic }) as string
      const rEventName = runRules(eventRules as Rule[], eventName, { mode, data, diagnostic: diagnostic as Diagnostic }) as string
      return {
        name: rPrefix + rEventName + meta.modifierStr,
        value
      }
    }
  }

  function rnEventRulesHandle (eventName: string): string | undefined {
    const eventMap: Record<string, string> = {
      tap: 'tap',
      longtap: 'longpress',
      longpress: 'longpress',
      touchstart: 'touchstart',
      touchmove: 'touchmove',
      touchend: 'touchend',
      touchcancel: 'touchcancel',
      transitionend: 'transitionend'
    }
    if (eventMap[eventName]) {
      return eventMap[eventName]
    } else {
      error(`React native environment does not support [${eventName}] event!`)
    }
  }

  function rnEventPrefixRulesHandle (prefix: string, { eventName, el }: { eventName: string; el: { tag: string } }): string | undefined {
    const supportCatch = prefix === 'catch' && el.tag === 'movable-view' && /^(htouchmove|vtouchmove)$/.test(eventName)
    if (prefix !== 'bind' && !supportCatch && !/^(tap|longpress|longtap|touchstart|touchmove|touchend|touchcancel)$/.test(eventName)) {
      warn(`React native environment does not support [${prefix}] event handling for [${eventName}] event, it will be converted to [bind]!`)
      return 'bind'
    }
  }

  function rnAccessibilityRulesHandle ({ name, value }: { name: string; value: unknown }): unknown {
    if (name === 'aria-role') {
      return [
        {
          name: 'accessible',
          value: true
        },
        {
          name: 'accessibilityRole',
          value: value
        }
      ]
    } else {
      return { name, value }
    }
  }

  const spec: Record<string, unknown> & Spec = {
    supportedModes: ['ali', 'swan', 'qq', 'tt', 'ks', 'web', 'qa', 'jd', 'dd', 'ios', 'android', 'harmony'],
    preProps: [] as Rule[],
    postProps: [
      {
        web (prop: { name: string; value: string }, data: Record<string, unknown>) {
          const { name, value } = prop
          const el = data.el as Record<string, unknown>
          if (el && el.tag === 'template' && (name === 'is' || name === 'data')) {
            return prop
          }
          const parsed = parseMustacheWithContext(value)
          if (name.startsWith('data-')) {
            return {
              name: ':' + name,
              value: `__ensureString(${parsed.result})`
            }
          } else if (parsed.hasBinding) {
            return {
              name: name === 'animation' ? 'v-animation' : ':' + name,
              value: parsed.result
            }
          }
        }
      }
    ] as Rule[],
    directive: [
      {
        test: 'wx:for',
        swan (obj: { value: string }, data: Record<string, unknown>) {
          const attrsMap = (data.el as Record<string, unknown>).attrsMap as Record<string, string>
          const parsed = parseMustacheWithContext(obj.value)
          let listName = parsed.result
          const el = data.el as Record<string, unknown>

          const itemName = attrsMap['wx:for-item'] || 'item'
          const indexName = attrsMap['wx:for-index'] || 'index'
          const keyName = attrsMap['wx:key'] || null
          let keyStr = ''

          if (parsed.hasBinding) {
            listName = listName.slice(1, -1)
          }

          if (keyName) {
            const parsed = parseMustacheWithContext(keyName)
            if (parsed.hasBinding) {
              // keyStr = ` trackBy ${parsed.result.slice(1, -1)}`
            } else if (keyName === '*this') {
              keyStr = ` trackBy ${itemName}`
            } else {
              if (!isValidIdentifierStr(keyName)) {
                keyStr = ` trackBy ${itemName}['${keyName}']`
              } else {
                keyStr = ` trackBy ${itemName}.${keyName}`
              }
            }
          }
          if (el) {
            const injectWxsInfo = {
              injectWxsRequest: '~' + normalizeLib('runtime/swanHelper.wxs'),
              injectWxsModuleName: 'mpxSwanHelper'
            }
            if ((el as Record<string, unknown>).injectWxsInfos && Array.isArray((el as Record<string, unknown>).injectWxsInfos)) {
              ((el as Record<string, unknown>).injectWxsInfos as unknown[]).push(injectWxsInfo)
            } else {
              (el as Record<string, unknown>).injectWxsInfos = [injectWxsInfo]
            }
          }
          return {
            name: 's-for',
            value: `${itemName}, ${indexName} in mpxSwanHelper.processFor(${listName})${keyStr}`
          }
        },
        web ({ value }: { value: string }, { el }: { el: Record<string, unknown> }) {
          const parsed = parseMustacheWithContext(value)
          const attrsMap = el.attrsMap as Record<string, string>
          const itemName = attrsMap['wx:for-item'] || 'item'
          const indexName = attrsMap['wx:for-index'] || 'index'
          return {
            name: 'v-for',
            value: `(${itemName}, ${indexName}) in ${parsed.result}`
          }
        }
      },
      {
        test: 'wx:key',
        swan () {
          return false
        },
        web ({ value }: { value: string }, { el }: { el: Record<string, unknown> }) {
          if ((el.tag as string) === 'block') return false
          const itemName = (el.attrsMap as Record<string, string>)['wx:for-item'] || 'item'
          const keyName = value
          let resultValue = value
          if (value === '*this') {
            resultValue = itemName
          } else {
            if (isValidIdentifierStr(keyName)) {
              resultValue = `${itemName}.${keyName}`
            } else {
              resultValue = `${itemName}['${keyName}']`
            }
          }
          return {
            name: ':key',
            value: resultValue
          }
        }
      },
      {
        test: /^wx:(for-item|for-index)$/,
        swan () {
          return false
        },
        web () {
          return false
        }
      },
      {
        test: 'wx:model',
        web ({ value }: { value: string }, { el }: { el: Record<string, unknown> }) {
          (el as Record<string, unknown>).hasModel = true
          const attrsMap = el.attrsMap as Record<string, string>
          const tagRE = /\{\{((?:.|\n|\r)+?)\}\}(?!})/
          const stringify = JSON.stringify
          const match = tagRE.exec(value)
          if (match) {
            const modelProp = attrsMap['wx:model-prop'] || 'value'
            const modelEvent = attrsMap['wx:model-event'] || 'input'
            const modelValuePathRaw = attrsMap['wx:model-value-path']
            const modelValuePath = modelValuePathRaw === undefined ? 'value' : modelValuePathRaw
            const modelFilter = attrsMap['wx:model-filter']
            let modelValuePathArr: string[]
            try {
              modelValuePathArr = JSON5.parse(modelValuePath)
            } catch (_e) {
              if (modelValuePath === '') {
                modelValuePathArr = []
              } else {
                modelValuePathArr = modelValuePath.split('.')
              }
            }
            const modelValue = match[1].trim()
            return [
              {
                name: ':' + modelProp,
                value: modelValue
              },
              {
                name: 'mpxModelEvent',
                value: modelEvent
              },
              {
                name: '@mpxModel',
                value: `__model(${stringifyWithResolveComputed(modelValue)}, $event, ${stringify(modelValuePathArr)}, ${stringify(modelFilter)})`
              }
            ]
          }
        }
      },
      {
        test: /^wx:(model-prop|model-event|model-value-path|model-filter)$/,
        web () {
          return false
        }
      },
      {
        test: 'wx:ref',
        web ({ value }: { value: string }) {
          return {
            name: 'ref',
            value: `__mpx_ref_${value}__`
          }
        }
      },
      {
        test: /^(style|wx:style)$/,
        web ({ value }: { value: string }, { el }: { el: Record<string, unknown> }) {
          if (el.isStyleParsed) {
            return false
          }
          const styleBinding: string[] = []
          el.isStyleParsed = true
          ;(el.attrsList as Array<{ name: string; value: string }>).filter((item: { name: string }) => /^(style|wx:style)$/.test(item.name)).forEach((item: { value: string }) => {
            const parsed = parseMustacheWithContext(item.value)
            styleBinding.push(parsed.result)
          })
          return {
            name: ':style',
            value: `[${styleBinding}] | transRpxStyle`
          }
        }
      },
      {
        test: /^(class|wx:class)$/,
        web ({ name, value }: { name: string; value: string }, { el }: { el: Record<string, unknown> }) {
          if (el.classMerged) return false
          const classBinding: string[] = []
          ;(el.attrsList as Array<{ name: string; value: string }>).filter((item: { name: string }) => /^(class|wx:class)$/.test(item.name)).forEach(({ name, value }: { name: string; value: string }) => {
            const parsed = parseMustacheWithContext(value)
            if (name === 'wx:class') {
              classBinding.push(parsed.result)
            } else if (name === 'class' && parsed.hasBinding === true) {
              el.classMerged = true
              classBinding.push(parsed.result)
            }
          })

          if (el.classMerged) {
            return {
              name: ':class',
              value: `[${classBinding}]`
            }
          } else if (name === 'wx:class') {
            return {
              name: ':class',
              value: classBinding[0]
            }
          }
        }
      },
      {
        test: /^wx:(.*)$/,
        ali ({ name, value }: { name: string; value: unknown }) {
          const dir = (this as unknown as { test: RegExp }).test.exec(name)![1]
          return { name: 'a:' + dir, value }
        },
        swan ({ name, value }: { name: string; value: unknown }) {
          const dir = (this as unknown as { test: RegExp }).test.exec(name)![1]
          return { name: 's-' + dir, value }
        },
        qq ({ name, value }: { name: string; value: unknown }) {
          const dir = (this as unknown as { test: RegExp }).test.exec(name)![1]
          return { name: 'qq:' + dir, value }
        },
        jd ({ name, value }: { name: string; value: unknown }) {
          const dir = (this as unknown as { test: RegExp }).test.exec(name)![1]
          return { name: 'jd:' + dir, value }
        },
        tt ({ name, value }: { name: string; value: unknown }) {
          const dir = (this as unknown as { test: RegExp }).test.exec(name)![1]
          return { name: 'tt:' + dir, value }
        },
        ks ({ name, value }: { name: string; value: unknown }) {
          const dir = (this as unknown as { test: RegExp }).test.exec(name)![1]
          return { name: 'ks:' + dir, value }
        },
        dd ({ name, value }: { name: string; value: unknown }) {
          const dir = (this as unknown as { test: RegExp }).test.exec(name)![1]
          return { name: 'dd:' + dir, value }
        },
        web ({ name, value }: { name: string; value: string }) {
          let dir = (this as unknown as { test: RegExp }).test.exec(name)![1]
          const parsed = parseMustacheWithContext(value)
          if (dir === 'elif') {
            dir = 'else-if'
          }
          return {
            name: 'v-' + dir,
            value: parsed.result
          }
        }
      },
      {
        test: /^(bind|catch|capture-bind|capture-catch):?(.*?)(\..*)?$/,
        ali (this: Rule, { name, value }: { name: string; value: unknown }, { eventRules, el, attr, diagnostic }: Record<string, unknown>) {
          const match = (this.test as RegExp).exec(name)!
          const prefix = match[1]
          const eventName = match[2]
          const modifierStr = match[3] || ''
          const data = { el, attr }
          const rPrefix = runRules((spec.event as Record<string, unknown>).prefix as Rule[], prefix, { mode: 'ali', data, diagnostic: diagnostic as Diagnostic }) as string
          const rEventName = runRules(eventRules as Rule[], eventName, { mode: 'ali', data, diagnostic: diagnostic as Diagnostic }) as string
          return {
            name: rPrefix + dash2hump(rEventName.replace(/^./, (matched: string) => {
              return matched.toUpperCase()
            })) + modifierStr,
            value
          }
        },
        swan (this: Rule, { name, value }: { name: string; value: unknown }, { eventRules, el, attr, diagnostic }: Record<string, unknown>) {
          const match = (this.test as RegExp).exec(name)!
          const prefix = match[1]
          const eventName = match[2]
          const modifierStr = match[3] || ''
          const data = { el, attr }
          let rPrefix = runRules((spec.event as Record<string, unknown>).prefix as Rule[], prefix, { mode: 'swan', data, diagnostic: diagnostic as Diagnostic }) as string
          const rEventName = runRules(eventRules as Rule[], eventName, { mode: 'swan', data, diagnostic: diagnostic as Diagnostic }) as string
          if (rEventName.includes('-')) rPrefix += ':'
          return { name: rPrefix + rEventName + modifierStr, value }
        },
        qq (this: Rule, { name, value }: { name: string; value: unknown }, { eventRules, el, attr, diagnostic }: Record<string, unknown>) {
          const match = (this.test as RegExp).exec(name)!
          const prefix = match[1]
          const eventName = match[2]
          const modifierStr = match[3] || ''
          const data = { el, attr }
          let rPrefix = runRules((spec.event as Record<string, unknown>).prefix as Rule[], prefix, { mode: 'qq', data, diagnostic: diagnostic as Diagnostic }) as string
          const rEventName = runRules(eventRules as Rule[], eventName, { mode: 'qq', data, diagnostic: diagnostic as Diagnostic }) as string
          if (rEventName.includes('-')) rPrefix += ':'
          return { name: rPrefix + rEventName + modifierStr, value }
        },
        jd (this: Rule, { name, value }: { name: string; value: unknown }, { eventRules, el, attr, diagnostic }: Record<string, unknown>) {
          const match = (this.test as RegExp).exec(name)!
          const prefix = match[1]
          const eventName = match[2]
          const modifierStr = match[3] || ''
          const data = { el, attr }
          let rPrefix = runRules((spec.event as Record<string, unknown>).prefix as Rule[], prefix, { mode: 'jd', data, diagnostic: diagnostic as Diagnostic }) as string
          const rEventName = runRules(eventRules as Rule[], eventName, { mode: 'jd', data, diagnostic: diagnostic as Diagnostic }) as string
          if (rEventName.includes('-')) rPrefix += ':'
          return { name: rPrefix + rEventName + modifierStr, value }
        },
        tt (this: Rule, { name, value }: { name: string; value: unknown }, { eventRules, el, attr, diagnostic }: Record<string, unknown>) {
          const match = (this.test as RegExp).exec(name)!
          const prefix = match[1]
          const eventName = match[2]
          const modifierStr = match[3] || ''
          const data = { el, attr }
          let rPrefix = runRules((spec.event as Record<string, unknown>).prefix as Rule[], prefix, { mode: 'tt', data, diagnostic: diagnostic as Diagnostic }) as string
          const rEventName = runRules(eventRules as Rule[], eventName, { mode: 'tt', data, diagnostic: diagnostic as Diagnostic }) as string
          if (rEventName.includes('-')) rPrefix += ':'
          return { name: rPrefix + rEventName + modifierStr, value }
        },
        ks (this: Rule, { name, value }: { name: string; value: unknown }, { eventRules, el, attr, diagnostic }: Record<string, unknown>) {
          const match = (this.test as RegExp).exec(name)!
          const prefix = match[1]
          const eventName = match[2]
          const modifierStr = match[3] || ''
          const data = { el, attr }
          let rPrefix = runRules((spec.event as Record<string, unknown>).prefix as Rule[], prefix, { mode: 'ks', data, diagnostic: diagnostic as Diagnostic }) as string
          const rEventName = runRules(eventRules as Rule[], eventName, { mode: 'ks', data, diagnostic: diagnostic as Diagnostic }) as string
          if (rEventName.includes('-')) rPrefix += ':'
          return { name: rPrefix + rEventName + modifierStr, value }
        },
        dd (this: Rule, { name, value }: { name: string; value: unknown }, { eventRules, el, attr, diagnostic }: Record<string, unknown>) {
          const match = (this.test as RegExp).exec(name)!
          const prefix = match[1]
          const eventName = match[2]
          const modifierStr = match[3] || ''
          const data = { el, attr }
          let rPrefix = runRules((spec.event as Record<string, unknown>).prefix as Rule[], prefix, { mode: 'dd', data, diagnostic: diagnostic as Diagnostic }) as string
          const rEventName = runRules(eventRules as Rule[], eventName, { mode: 'dd', data, diagnostic: diagnostic as Diagnostic }) as string
          if (rEventName.includes('-')) rPrefix += ':'
          return { name: rPrefix + rEventName + modifierStr, value }
        },
        web (this: Rule, { name, value }: { name: string; value: unknown }, { eventRules, el, attr, usingComponents, diagnostic }: Record<string, unknown>) {
          const match = (this.test as RegExp).exec(name)!
          const prefix = match[1]
          const eventName = match[2]
          const modifierStr = match[3] || ''
          const meta: Record<string, string> = {
            modifierStr
          }
          const isComponent = (usingComponents as string[]).indexOf((el as Record<string, unknown>).tag as string) !== -1 || (el as Record<string, unknown>).tag === 'component'
          const data = { el, attr, isComponent }
          const rPrefix = runRules((spec.event as Record<string, unknown>).prefix as Rule[], prefix, { mode: 'web', data, meta, diagnostic: diagnostic as Diagnostic }) as string
          const rEventName = runRules(eventRules as Rule[], eventName, { mode: 'web', data, diagnostic: diagnostic as Diagnostic }) as string
          return {
            name: rPrefix + rEventName + meta.modifierStr,
            value
          }
        },
        ios: getRnDirectiveEventHandle('ios'),
        android: getRnDirectiveEventHandle('android'),
        harmony: getRnDirectiveEventHandle('harmony')
      },
      {
        test: /^aria-(role|label)$/,
        ali () {
          warn('Ali environment does not support aria-role|label props!')
        },
        ios: rnAccessibilityRulesHandle,
        android: rnAccessibilityRulesHandle,
        harmony: rnAccessibilityRulesHandle
      }
    ] as Rule[],
    event: {
      prefix: [
        {
          ali (prefix: string) {
            const prefixMap: Record<string, string> = {
              bind: 'on',
              catch: 'catch',
              'capture-catch': 'capture-catch',
              'capture-bind': 'capture-on'
            }
            if (!prefixMap[prefix]) {
              error(`Ali environment does not support [${prefix}] event handling!`)
              return
            }
            return prefixMap[prefix]
          },
          web (prefix: string, data: Record<string, unknown>, meta: Record<string, unknown>) {
            const modifierStr = meta.modifierStr as string
            const modifierMap = modifierStr.split('.').reduce((map: Record<string, boolean>, key: string) => {
              if (key) {
                map[key] = true
              }
              return map
            }, {})
            switch (prefix) {
              case 'catch':
                modifierMap.stop = true
                break
              case 'capture-bind':
                modifierMap.capture = true
                break
              case 'capture-catch':
                modifierMap.stop = true
                modifierMap.capture = true
                break
            }
            delete modifierMap.proxy
            const tempModifierStr = Object.keys(modifierMap).join('.')
            meta.modifierStr = tempModifierStr ? '.' + tempModifierStr : ''
            return '@'
          },
          ios: rnEventPrefixRulesHandle,
          android: rnEventPrefixRulesHandle,
          harmony: rnEventPrefixRulesHandle
        }
      ],
      rules: [
        {
          test: /^(touchstart|touchmove|touchcancel|touchend|tap|longpress|longtap|transitionend|animationstart|animationiteration|animationend|touchforcechange)$/,
          ali (eventName: string) {
            const eventMap: Record<string, string> = {
              touchstart: 'touchStart',
              touchmove: 'touchMove',
              touchend: 'touchEnd',
              touchcancel: 'touchCancel',
              tap: 'tap',
              longtap: 'longTap',
              longpress: 'longTap',
              transitionend: 'transitionEnd',
              animationstart: 'animationStart',
              animationiteration: 'animationIteration',
              animationend: 'animationEnd'
            }
            if (eventMap[eventName]) {
              return eventMap[eventName]
            } else {
              error(`Ali environment does not support [${eventName}] event!`)
            }
          },
          web (eventName: string) {
            if (eventName === 'touchforcechange') {
              error(`Web environment does not support [${eventName}] event!`)
            }
          },
          ios: rnEventRulesHandle,
          android: rnEventRulesHandle,
          harmony: rnEventRulesHandle
        },
        {
          test: /^click$/,
          web (eventName: string, { isComponent }: { isComponent: boolean }) {
            if (isComponent) {
              return '_' + eventName
            }
          }
        }
      ]
    }
  }
  spec.rules = normalizeComponentRules(getComponentConfigs({ warn, error }) as NormalizedComponentConfig[], spec, makeAttrsMap)
  return spec
}
