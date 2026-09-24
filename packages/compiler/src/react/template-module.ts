import * as path from 'path'
import type { ReactMode } from '../modes'
import { isReactMode } from '../modes'
import type { CompileMpxFileResult, RnConfig } from '../types'
import {
  OPTION_PROCESSOR_REQUEST,
  bindTemplate,
  genTemplate,
  isUrlRequest,
  parseTemplate,
  pathHash,
  pushDiag,
  type DiagnosticBag,
  type TemplateMeta
} from './host'
import { appendQuery, quoteRequest, resolveRelative } from './paths'

export interface CompileReactTemplateOptions {
  mode: ReactMode
  srcMode?: string
  resourcePath: string
  context?: string
  moduleId?: string
  env?: string
  defs?: Record<string, unknown>
  rnConfig?: RnConfig
  externalClasses?: string[]
  decodeHTMLText?: boolean
}

export function compileReactTemplate (source: string, options: CompileReactTemplateOptions): CompileMpxFileResult {
  if (!isReactMode(options.mode)) {
    throw new Error('[mpx compiler] compileReactTemplate mode "' + options.mode + '" is not a react native target')
  }
  const srcMode = options.srcMode || 'wx'
  if (srcMode !== 'wx') {
    throw new Error('[mpx compiler] srcMode "' + srcMode + '" is not implemented in the RN slice (only "wx")')
  }
  const resourceFile = path.isAbsolute(options.resourcePath)
    ? options.resourcePath
    : path.resolve(options.context || process.cwd(), options.resourcePath)
  const moduleId = options.moduleId || '_' + pathHash(resourceFile)
  const bag: DiagnosticBag = { warnings: [], errors: [] }
  const context = options.context || path.dirname(resourceFile)
  const rnConfig = options.rnConfig || {}
  const meta = parseImportedTemplate(source, {
    resourceFile,
    mode: options.mode,
    srcMode,
    moduleId,
    env: options.env,
    defs: options.defs,
    externalClasses: options.externalClasses,
    decodeHTMLText: options.decodeHTMLText,
    context,
    rnConfig,
    bag
  })
  const watchFiles = [resourceFile]
  const code = renderTemplateModule(meta, srcMode, resourceFile, watchFiles, bag)
  return { code, watchFiles, warnings: bag.warnings, errors: bag.errors }
}

function parseImportedTemplate (source: string, options: {
  resourceFile: string
  mode: ReactMode
  srcMode: string
  moduleId: string
  env?: string
  defs?: Record<string, unknown>
  externalClasses?: string[]
  decodeHTMLText?: boolean
  context: string
  rnConfig: RnConfig
  bag: DiagnosticBag
}): TemplateMeta {
  try {
    const parsed = parseTemplate(source, {
      warn: (message: string) => pushDiag(options.bag, 'warning', options.resourceFile, message),
      error: (message: string) => pushDiag(options.bag, 'error', options.resourceFile, message),
      mode: options.mode,
      srcMode: options.srcMode,
      env: options.env,
      defs: options.defs || {},
      decodeHTMLText: options.decodeHTMLText,
      externalClasses: options.externalClasses || [],
      moduleId: options.moduleId,
      filePath: options.resourceFile,
      customBuiltInComponents: options.rnConfig.customBuiltInComponents,
      isUrlRequest: (url: string) => isUrlRequest(url, options.context)
    })
    return parsed.meta || {}
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error('[mpx compiler][' + options.resourceFile + ']: ' + message)
  }
}

function renderTemplateModule (meta: TemplateMeta, srcMode: string, resourceFile: string, watchFiles: string[], bag: DiagnosticBag): string {
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
  const imports: string[] = []
  ;(meta.imports || []).forEach((importSrc) => {
    const request = appendQuery(importSrc, { mpxRnTemplate: '1', srcMode })
    imports.push('require(' + quoteRequest(request) + ')')
    const watched = resolveRelative(resourceFile, importSrc)
    if (watched && watchFiles.indexOf(watched) < 0) watchFiles.push(watched)
  })
  const builtIn: string[] = []
  Object.keys(meta.builtInComponentsMap || {}).forEach((name) => {
    const request = meta.builtInComponentsMap ? appendQuery(meta.builtInComponentsMap[name], { isComponent: 'true' }) : ''
    builtIn.push(JSON.stringify(name) + ': function () { return getBuiltInBaseComponent(require(' + quoteRequest(request) + '), { __mpxBuiltIn: true }) }')
  })
  let localTemplatesCode = 'var localTemplates = {\n'
  Object.keys(meta.templates || {}).forEach((name) => {
    const body = genTemplate(meta.templates && meta.templates[name])
    if (body) localTemplatesCode += JSON.stringify(name) + ': ' + body + ',\n'
  })
  localTemplatesCode += '};'
  try {
    localTemplatesCode = bindTemplate(localTemplatesCode, ignoreMap)
  } catch (error) {
    const detail = error instanceof Error ? error.stack || error.message : String(error)
    pushDiag(bag, 'error', resourceFile, '[Mpx template error]: Invalid render function generated by the template, please check!\n  Error Detail:\n  ' + detail)
  }
  let wxsImports = ''
  Object.keys(meta.wxsModuleMap || {}).forEach((name) => {
    const src = meta.wxsModuleMap ? meta.wxsModuleMap[name] : ''
    wxsImports += 'var ' + name + ' = require(' + quoteRequest(src) + ');\n'
  })
  let assets = ''
  Object.keys(meta.templateAssets || {}).forEach((name) => {
    const src = meta.templateAssets ? meta.templateAssets[name] : ''
    assets += 'var ' + name + ' = require(' + quoteRequest(src) + ');\n'
  })
  const hasTemplateSource = imports.length || Object.keys(meta.templates || {}).length
  const helpers = hasTemplateSource
    ? 'var templates = Object.assign({}, ' + (imports.join(', ') || '{}') + ');\nObject.assign(templates, localTemplates);\nfunction getTemplate(name) {\n  return templates[name] || function(){};\n}\n'
    : ''
  return [
    wxsImports,
    assets,
    'var getBuiltInBaseComponent = require(' + quoteRequest(OPTION_PROCESSOR_REQUEST) + ').getComponent;',
    'var builtInComponentsMap = {' + builtIn.join(',') + '};',
    localTemplatesCode,
    helpers,
    'function getBuiltInComponent(name) {',
    '  var getter = builtInComponentsMap[name];',
    '  return getter && getter();',
    '}',
    'function getTemplateComponent(name, getComponent) {',
    '  return getComponent(name) || getBuiltInComponent(name);',
    '}',
    'Object.keys(localTemplates).forEach(function (name) {',
    '  var template = localTemplates[name];',
    '  localTemplates[name] = function (createElement, getComponent) {',
    '    return template.call(this, createElement, function (componentName) {',
    '      return getTemplateComponent(componentName, getComponent);',
    '    });',
    '  };',
    '});',
    'module.exports = localTemplates;',
    ''
  ].join('\n')
}
