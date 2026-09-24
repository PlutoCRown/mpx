import type { ReactMode } from '../modes'
import type { MpxCtorType, RnConfig } from '../types'
import {
  bindTemplate,
  dashToHump,
  genNode,
  genTemplate,
  isUrlRequest,
  parseTemplate,
  pushDiag,
  type DiagnosticBag,
  type HostBlock,
  type TemplateMeta
} from './host'
import { appendQuery, quoteRequest, resolveRelative } from './paths'

export interface BuiltInComponent {
  name: string
  request: string
}

export interface TemplateBuild {
  output: string
  builtIn: BuiltInComponent[]
  genericsInfo: { hash: string } | null
  watchFiles: string[]
}

export function buildTemplate (options: {
  template: HostBlock | null
  resourceFile: string
  context: string
  mode: ReactMode
  srcMode: string
  moduleId: string
  ctorType: MpxCtorType
  env?: string
  usingComponentsInfo: Record<string, { mid: string, hasVirtualHost: boolean }>
  originalUsingComponents: string[]
  componentGenerics: Record<string, { default?: string }>
  componentPlaceholder: string[]
  rnConfig: RnConfig
  defs?: Record<string, unknown>
  externalClasses?: string[]
  decodeHTMLText?: boolean
  globalComponents?: Record<string, string>
  bag: DiagnosticBag
}): TemplateBuild {
  const watchFiles: string[] = []
  let output = '/* template */\n'
  output += 'global.currentInject = {\n  moduleId: ' + JSON.stringify(options.moduleId) + '\n};\n'
  const builtIn: BuiltInComponent[] = []
  let genericsInfo: { hash: string } | null = null
  const template = options.template
  if (!template || !template.content || !template.content.trim()) {
    return { output, builtIn, genericsInfo, watchFiles }
  }
  if (template.src) {
    throw new Error('[mpx compiler][' + options.resourceFile + ']: template content must be inline in .mpx files')
  }
  if (template.lang) {
    throw new Error('[mpx compiler][' + options.resourceFile + ']: template lang is not supported in react native mode')
  }

  const warn = (message: string) => pushDiag(options.bag, 'warning', options.resourceFile, message)
  const error = (message: string) => pushDiag(options.bag, 'error', options.resourceFile, message)
  const parseOptions: Record<string, unknown> = {
    warn,
    error,
    usingComponentsInfo: options.usingComponentsInfo,
    originalUsingComponents: options.originalUsingComponents,
    hasComment: !!(template.attrs && template.attrs.comments),
    isNative: false,
    ctorType: options.ctorType,
    mode: options.mode,
    env: options.env,
    srcMode: options.srcMode,
    defs: options.defs || {},
    decodeHTMLText: options.decodeHTMLText,
    externalClasses: options.externalClasses || [],
    hasScoped: false,
    moduleId: options.moduleId,
    filePath: options.resourceFile,
    i18n: null,
    globalComponents: Object.keys(options.globalComponents || {}),
    componentPlaceholder: options.componentPlaceholder,
    componentGenerics: options.componentGenerics,
    hasVirtualHost: false,
    forceProxyEvent: false,
    checkUsingComponents: false,
    isCustomText: false,
    customBuiltInComponents: options.rnConfig.customBuiltInComponents,
    isUrlRequest: (url: string) => isUrlRequest(url, options.context)
  }

  let parsed: { root: unknown, meta: TemplateMeta }
  try {
    parsed = parseTemplate(template.content, parseOptions)
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught)
    throw new Error('[mpx compiler][' + options.resourceFile + ']: ' + message)
  }
  const meta = parsed.meta || {}
  const ignoreMap: Record<string, boolean> = {
    createElement: true,
    getComponent: true,
    getTemplate: true
  }
  Object.keys(meta.wxsModuleMap || {}).forEach((name) => {
    ignoreMap[name] = true
  })
  Object.keys(meta.templateAssets || {}).forEach((name) => {
    ignoreMap[name] = true
  })
  const templateNames: string[] = []
  if (meta.imports) {
    meta.imports.forEach((importSrc) => {
      const request = appendQuery(importSrc, { mpxRnTemplate: '1', srcMode: options.srcMode })
      templateNames.push('require(' + quoteRequest(request) + ')')
      const watched = resolveRelative(options.resourceFile, importSrc)
      if (watched && watchFiles.indexOf(watched) < 0) watchFiles.push(watched)
    })
  }
  if (meta.templates) {
    let localTemplatesCode = 'var localTemplates = {\n'
    Object.keys(meta.templates).forEach((name) => {
      const body = genTemplate(meta.templates && meta.templates[name])
      if (body) localTemplatesCode += JSON.stringify(name) + ': ' + body + ',\n'
    })
    localTemplatesCode += '};'
    const transformed = transformCode(localTemplatesCode, ignoreMap, error)
    if (transformed) {
      output += transformed + '\n'
      templateNames.push('localTemplates')
    }
  }
  const builtInPaths = meta.builtInComponentsMap || {}
  Object.keys(builtInPaths).forEach((name) => {
    builtIn.push({
      name,
      request: appendQuery(builtInPaths[name], { isComponent: 'true' })
    })
  })
  if (meta.genericsInfo && meta.genericsInfo.hash) {
    genericsInfo = { hash: meta.genericsInfo.hash }
  }

  Object.keys(meta.wxsModuleMap || {}).forEach((name) => {
    const src = meta.wxsModuleMap ? meta.wxsModuleMap[name] : ''
    output += 'var ' + name + ' = require(' + quoteRequest(src) + ');\n'
  })
  Object.keys(meta.templateAssets || {}).forEach((name) => {
    const src = meta.templateAssets ? meta.templateAssets[name] : ''
    output += 'var ' + name + ' = require(' + quoteRequest(src) + ');\n'
  })
  if (templateNames.length) {
    output += 'var templates = Object.assign({}, ' + templateNames.join(', ') + ');\n'
    output += 'function getTemplate(name) {\n  return templates[name] || function(){};\n}\n'
  }

  const rawCode = genNode(parsed.root, true)
  if (rawCode) {
    const transformed = transformCode(rawCode, ignoreMap, error)
    if (transformed) {
      output += 'global.currentInject.render = function (createElement, getComponent) {\n  return ' + transformed + '\n};\n'
    }
  }
  if (meta.computed && meta.computed.length) {
    try {
      output += bindTemplate('global.currentInject.injectComputed = {' + meta.computed.join(',') + '};') + '\n'
    } catch (caught) {
      error(caught instanceof Error ? caught.message : String(caught))
    }
  }
  if (meta.refs) {
    output += 'global.currentInject.getRefsData = function () {return ' + JSON.stringify(meta.refs) + ';};\n'
  }
  if (meta.options) {
    output += 'global.currentInject.injectOptions = ' + JSON.stringify(meta.options) + ';\n'
  }
  const genericNames = Object.keys(options.componentGenerics)
  if (genericNames.length) {
    output += 'global.currentInject.injectProperties = {\n'
    output += '  generichash: String,\n'
    genericNames.forEach((genericName) => {
      const fallback = options.componentGenerics[genericName].default
      if (fallback) {
        output += '  generic' + dashToHump(genericName) + ': { type: String, value: \'' + genericName + 'default\' },\n'
      } else {
        output += '  generic' + dashToHump(genericName) + ': String,\n'
      }
    })
    output += '}\n'
  }
  return { output, builtIn, genericsInfo, watchFiles }
}

function transformCode (code: string, ignoreMap: Record<string, boolean>, error: (message: string) => void): string | null {
  try {
    return bindTemplate(code, ignoreMap)
  } catch (caught) {
    const detail = caught instanceof Error ? caught.stack || caught.message : String(caught)
    error('[Mpx template error]: Invalid render function generated by the template, please check!\n  Error code:\n  ' + code + '\n  Error Detail:\n  ' + detail)
    return null
  }
}
