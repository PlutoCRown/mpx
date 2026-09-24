import type { MpxCtorType, RnConfig } from '../types'
import { OPTION_PROCESSOR_REQUEST, pushDiag, stringifyShallow, type DiagnosticBag, type HostBlock } from './host'
import type { BuiltInComponent } from './template'
import type { LocalComponent, LocalPage } from './json'
import { appendQuery, quoteRequest } from './paths'

export function buildScriptOutput (options: {
  script: HostBlock | null
  ctorType: MpxCtorType
  srcMode: string
  moduleId: string
  isProduction: boolean
  resourceFile: string
  jsonObj: Record<string, unknown>
  components: LocalComponent[]
  pages: LocalPage[]
  builtIn: BuiltInComponent[]
  genericsInfo: { hash: string } | null
  rnConfig: RnConfig
  outputPath: string
  hasApp: boolean
  bag: DiagnosticBag
}): string {
  const processor = quoteRequest(OPTION_PROCESSOR_REQUEST)
  let output = '/* script */\n'
  if (options.ctorType === 'app') {
    output += 'import { getComponent, getAsyncSuspense } from ' + processor + '\n\n'
    const pages = buildPagesMap(options.pages, options.jsonObj, options.rnConfig)
    const components = buildComponentsMap(options.components, [], options.jsonObj, options.rnConfig, options.bag, options.resourceFile)
    output += buildAppParams(options, pages.pagesMap, pages.firstPage, components)
  } else {
    output += 'import { getComponent, getAsyncSuspense } from ' + processor + '\n'
    const components = buildComponentsMap(options.components, options.builtIn, options.jsonObj, options.rnConfig, options.bag, options.resourceFile)
    output += buildLocalParams(options, components)
  }
  output += '/** script content **/\n'
  output += scriptBody(options.script)
  output += 'export default global.__mpxOptionsMap[' + JSON.stringify(options.moduleId) + ']\n'
  return output
}

function scriptBody (script: HostBlock | null): string {
  if (!script) return ''
  if (script.src) return 'require(' + quoteRequest(script.src) + ')\n'
  if (!script.content) return ''
  return script.content.endsWith('\n') ? script.content : script.content + '\n'
}

function buildPagesMap (pages: LocalPage[], json: Record<string, unknown>, rnConfig: RnConfig): { pagesMap: Record<string, string>, firstPage: string } {
  const pagesMap: Record<string, string> = {}
  let firstPage = ''
  const entryPagePath = typeof json.entryPagePath === 'string' ? json.entryPagePath : ''
  pages.slice().sort(compareOutputPath).forEach((page) => {
    const request = quoteRequest(page.request)
    if (page.asyncName && rnConfig.supportSubpackage) {
      pagesMap[page.outputPath] = getAsyncSuspense('page', page.moduleId, request, 'MpxPage', page.asyncName, chunkFallback(rnConfig, 'PageFallback'), chunkLoading(rnConfig))
    } else {
      pagesMap[page.outputPath] = getter(componentCall(request, 'MpxPage'))
    }
    if (page.outputPath === entryPagePath) firstPage = page.outputPath
    if (!firstPage && page.isFirst) firstPage = page.outputPath
  })
  return { pagesMap, firstPage }
}

function buildComponentsMap (
  components: LocalComponent[],
  builtIn: BuiltInComponent[],
  json: Record<string, unknown>,
  rnConfig: RnConfig,
  bag: DiagnosticBag,
  resourceFile: string
): Record<string, string> {
  const componentsMap: Record<string, string> = {}
  const placeholders = json.componentPlaceholder
  const placeholderMap = placeholders && typeof placeholders === 'object' && !Array.isArray(placeholders)
    ? placeholders as Record<string, unknown>
    : {}
  components.slice().sort(compareName).forEach((component) => {
    const request = quoteRequest(component.request)
    if (component.asyncName && rnConfig.supportSubpackage) {
      const placeholder = placeholderMap[component.name]
      let fallback = ''
      if (typeof placeholder === 'string') {
        const placeholderCfg = components.filter((item) => item.name === placeholder)[0]
        if (!placeholderCfg) {
          pushDiag(bag, 'error', resourceFile, '[json processor]: componentPlaceholder ' + placeholder + ' is not built-in component or custom component, please check!')
        } else if (placeholderCfg.asyncName) {
          pushDiag(bag, 'warning', resourceFile, '[json processor]: componentPlaceholder ' + placeholder + ' should not be a async component, please check!')
          fallback = getter(componentCall(quoteRequest(placeholderCfg.request), placeholder))
        } else {
          fallback = getter(componentCall(quoteRequest(placeholderCfg.request), placeholder))
        }
      } else {
        pushDiag(bag, 'error', resourceFile, '[json processor]: ' + component.name + ' has no componentPlaceholder, please check!')
      }
      componentsMap[component.name] = getAsyncSuspense('component', component.moduleId, request, component.name, component.asyncName, fallback, '')
    } else {
      componentsMap[component.name] = getter(componentCall(request, component.name))
    }
  })
  builtIn.slice().sort(compareName).forEach((component) => {
    componentsMap[component.name] = getter('getComponent(require(' + quoteRequest(component.request) + '), {__mpxBuiltIn: true})')
  })
  return componentsMap
}

function buildAppParams (
  options: {
    moduleId: string
    srcMode: string
    isProduction: boolean
    resourceFile: string
    jsonObj: Record<string, unknown>
  },
  pagesMap: Record<string, string>,
  firstPage: string,
  componentsMap: Record<string, string>
): string {
  const json = options.jsonObj
  let content = '\n'
  content += 'global.getApp = function () {}\n'
  content += 'global.getCurrentPages = function () { return [] }\n'
  content += 'global.__networkTimeout = ' + jsonLiteral(json.networkTimeout) + '\n'
  content += 'global.__mpxGenericsMap = {}\n'
  content += 'global.__mpxOptionsMap = {}\n'
  content += 'global.__mpxPagesMap = {}\n'
  content += 'global.__style = ' + jsonLiteral(json.style || 'v1') + '\n'
  content += 'global.__mpxPageConfig = ' + jsonLiteral(json.window) + '\n'
  content += 'global.__appComponentsMap = ' + stringifyShallow(componentsMap) + '\n'
  content += 'global.__preloadRule = ' + jsonLiteral(json.preloadRule) + '\n'
  content += 'global.currentInject.pagesMap = ' + stringifyShallow(pagesMap) + '\n'
  content += 'global.currentInject.firstPage = ' + JSON.stringify(firstPage) + '\n'
  content += runtimeIds(options)
  return content
}

function buildLocalParams (
  options: {
    ctorType: MpxCtorType
    moduleId: string
    srcMode: string
    isProduction: boolean
    resourceFile: string
    jsonObj: Record<string, unknown>
    genericsInfo: { hash: string } | null
    outputPath: string
    hasApp: boolean
  },
  componentsMap: Record<string, string>
): string {
  let content = ''
  if (options.ctorType === 'page') {
    const pageConfig = Object.assign({}, options.jsonObj)
    delete pageConfig.usingComponents
    content += 'global.currentInject.pageConfig = ' + JSON.stringify(pageConfig) + '\n'
  }
  content += '\nvar componentsMap = ' + stringifyShallow(componentsMap) + '\n'
  content += 'global.currentInject.componentsMap = componentsMap\n'
  if (options.genericsInfo) {
    if (!options.hasApp) content += 'global.__mpxGenericsMap = global.__mpxGenericsMap || {}\n'
    content += 'const genericHash = ' + JSON.stringify(options.genericsInfo.hash) + '\n'
    content += 'global.__mpxGenericsMap[genericHash] = componentsMap\n'
  }
  if (options.ctorType === 'component') {
    content += 'global.currentInject.componentPath = \'/\' + ' + JSON.stringify(options.outputPath) + '\n'
  }
  content += runtimeIds(options)
  return content
}

function runtimeIds (options: { moduleId: string, srcMode: string, isProduction: boolean, resourceFile: string }): string {
  let content = 'global.currentModuleId = ' + JSON.stringify(options.moduleId) + '\n'
  content += 'global.currentSrcMode = ' + JSON.stringify(options.srcMode) + '\n'
  if (!options.isProduction) content += 'global.currentResource = ' + JSON.stringify(options.resourceFile) + '\n'
  return content
}

function jsonLiteral (value: unknown): string {
  const text = JSON.stringify(value)
  return text === undefined ? 'undefined' : text
}

function chunkFallback (rnConfig: RnConfig, displayName: string): string {
  const fallback = rnConfig.asyncChunk && rnConfig.asyncChunk.fallback
  if (!fallback) return ''
  const request = quoteRequest(appendQuery(fallback, { isComponent: 'true' }))
  return getter(componentCall(request, displayName))
}

function chunkLoading (rnConfig: RnConfig): string {
  const loading = rnConfig.asyncChunk && rnConfig.asyncChunk.loading
  if (!loading) return ''
  const request = quoteRequest(appendQuery(loading, { isComponent: 'true' }))
  return getter(componentCall(request, 'PageLoading'))
}

function compareOutputPath (a: LocalPage, b: LocalPage): number {
  if (a.outputPath < b.outputPath) return -1
  if (a.outputPath > b.outputPath) return 1
  return 0
}

function compareName<T extends { name: string }> (a: T, b: T): number {
  if (a.name < b.name) return -1
  if (a.name > b.name) return 1
  return 0
}

function getter (expression: string): string {
  return 'function(){ return ' + expression + ' }'
}

function componentCall (request: string, displayName: string): string {
  return 'getComponent(require(' + request + '), {displayName: ' + JSON.stringify(displayName) + '})'
}

function getAsyncSuspense (type: string, moduleId: string, request: string, displayName: string, chunkName: string, fallback: string, loading: string): string {
  const chunkComment = chunkName ? '/* webpackChunkName: "' + chunkName + '/index" */' : ''
  let code = 'getAsyncSuspense({\n'
  code += '  type: ' + JSON.stringify(type) + ',\n'
  code += '  moduleId: ' + JSON.stringify(moduleId) + ',\n'
  code += '  chunkName: ' + JSON.stringify(chunkName) + ',\n'
  if (fallback) code += '  getFallback: ' + fallback + ',\n'
  if (loading) code += '  getLoading: ' + loading + ',\n'
  code += '  getChildren () {\n'
  code += '    return import(' + chunkComment + request + ').then(function (res) {\n'
  code += '      return getComponent(res, {displayName: ' + JSON.stringify(displayName) + '})\n'
  code += '    })\n'
  code += '  }\n'
  code += '})'
  return code
}
