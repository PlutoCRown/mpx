import * as path from 'path'
import type { CompileMpxFileResult, CompileToReactOptions, MpxCtorType } from '../types'
import { isReactMode } from '../modes'
import { APP_MODULE_ID, parseComponent, pathHash, type DiagnosticBag } from './host'
import { buildJsonModel } from './json'
import { buildScriptOutput } from './script-output'
import { buildStyles } from './styles'
import { buildTemplate } from './template'
import { quoteRequest } from './paths'

const CTOR_PATTERN = /\b(createApp|createPage|createComponent|App|Page|Component)\s*\(/g

export function compileToReact (source: string, options: CompileToReactOptions): CompileMpxFileResult {
  if (!isReactMode(options.mode)) {
    throw new Error('[mpx compiler] mode "' + options.mode + '" is not a react native target')
  }
  const srcMode = options.srcMode || 'wx'
  if (srcMode !== 'wx') {
    throw new Error('[mpx compiler] srcMode "' + srcMode + '" is not implemented in the RN slice (only "wx")')
  }
  const resourceFile = resolveResource(options.resourcePath, options.context)
  const parsed = parseComponent(source, {
    mode: options.mode,
    filePath: resourceFile,
    pad: 'line',
    env: options.env
  })
  const script = parsed.script
  if (script && script.setup) {
    throw new Error('[mpx compiler][' + resourceFile + ']: <script setup> is not supported in the RN slice')
  }
  if (script && script.lang && script.lang !== 'js') {
    throw new Error('[mpx compiler][' + resourceFile + ']: script lang "' + script.lang + '" is not supported in the RN slice')
  }
  const ctorType = options.ctorType || inferCtor(script && script.content ? script.content : undefined) || 'component'
  if (ctorType === 'app' && !options.isApp) {
    return buildAppShell(resourceFile, options)
  }

  const moduleId = options.moduleId || (ctorType === 'app' ? APP_MODULE_ID : '_' + pathHash(resourceFile))
  const bag: DiagnosticBag = { warnings: [], errors: [] }
  const context = options.context || path.dirname(resourceFile)
  const rnConfig = options.rnConfig || {}
  const jsonContent = parsed.json && parsed.json.content && parsed.json.content.trim() ? parsed.json.content : ''
  const jsonModel = buildJsonModel({
    jsonContent,
    resourceFile,
    context,
    mode: options.mode,
    srcMode: (parsed.json && parsed.json.srcMode) || srcMode,
    ctorType,
    env: options.env,
    bag
  })
  const usingComponentsInfo: Record<string, { mid: string, hasVirtualHost: boolean }> = {}
  jsonModel.components.forEach((component) => {
    usingComponentsInfo[component.name] = { mid: component.moduleId, hasVirtualHost: false }
  })
  const template = buildTemplate({
    template: parsed.template,
    resourceFile,
    context,
    mode: options.mode,
    srcMode: (parsed.template && parsed.template.srcMode) || srcMode,
    moduleId,
    ctorType,
    env: options.env,
    usingComponentsInfo,
    originalUsingComponents: jsonModel.originalUsingComponents,
    componentGenerics: jsonModel.componentGenerics,
    componentPlaceholder: jsonModel.componentPlaceholderNames,
    rnConfig,
    defs: options.defs,
    externalClasses: options.externalClasses,
    decodeHTMLText: options.decodeHTMLText,
    globalComponents: options.globalComponents,
    bag
  })
  const styles = buildStyles({
    styles: parsed.styles || [],
    resourceFile,
    mode: options.mode,
    srcMode,
    ctorType,
    moduleId,
    hasUnoCSS: options.hasUnoCSS,
    bag
  })
  const scriptCode = buildScriptOutput({
    script,
    ctorType,
    srcMode: (script && script.srcMode) || srcMode,
    moduleId,
    isProduction: !!options.isProduction,
    resourceFile,
    jsonObj: jsonModel.jsonObj,
    components: jsonModel.components,
    pages: jsonModel.pages,
    builtIn: template.builtIn,
    genericsInfo: template.genericsInfo,
    rnConfig,
    outputPath: options.outputPath || '',
    hasApp: !!options.hasApp,
    bag
  })
  const watchFiles = [resourceFile]
  jsonModel.watchFiles.forEach((file) => {
    if (watchFiles.indexOf(file) < 0) watchFiles.push(file)
  })
  template.watchFiles.forEach((file) => {
    if (watchFiles.indexOf(file) < 0) watchFiles.push(file)
  })
  if (script && script.src) {
    const src = script.src
    const watched = src.startsWith('.') ? path.resolve(path.dirname(resourceFile), src.split('?')[0]) : ''
    if (watched && watchFiles.indexOf(watched) < 0) watchFiles.push(watched)
  }
  return {
    code: '/* @mpxjs/compiler mode=' + options.mode + ' */\n' + template.output + styles + '/* json */\n' + scriptCode,
    watchFiles,
    warnings: bag.warnings,
    errors: bag.errors
  }
}

function buildAppShell (resourceFile: string, options: CompileToReactOptions): CompileMpxFileResult {
  const request = './' + path.basename(resourceFile) + '?mpxRnApp=1'
  let code = '/* @mpxjs/compiler mode=' + options.mode + ' */\n'
  code += "import { AppRegistry } from 'react-native'\n"
  code += 'var app = require(' + quoteRequest(request) + ').default\n'
  const projectName = options.rnConfig && options.rnConfig.projectName
  if (projectName) {
    code += 'AppRegistry.registerComponent(' + JSON.stringify(projectName) + ', () => app)\n'
  } else {
    code += 'export default app\n'
  }
  return {
    code,
    watchFiles: [resourceFile],
    warnings: [],
    errors: []
  }
}

function inferCtor (script: string | undefined): MpxCtorType | null {
  if (!script) return null
  CTOR_PATTERN.lastIndex = 0
  const matched = CTOR_PATTERN.exec(script)
  if (!matched) return null
  if (matched[1] === 'createApp' || matched[1] === 'App') return 'app'
  if (matched[1] === 'createPage' || matched[1] === 'Page') return 'page'
  return 'component'
}

function resolveResource (resourcePath: string, context?: string): string {
  const file = resourcePath.split('?')[0]
  if (path.isAbsolute(file)) return file
  if (context) return path.resolve(context, file)
  return path.resolve(file)
}
