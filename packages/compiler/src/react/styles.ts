import type { MpxCtorType } from '../types'
import type { ReactMode } from '../modes'
import {
  getClassMap,
  isIdentifier,
  prepareReactCss,
  pushDiag,
  stringifyShallow,
  type DiagnosticBag,
  type HostBlock
} from './host'

export function buildStyles (options: {
  styles: HostBlock[]
  resourceFile: string
  mode: ReactMode
  srcMode: string
  ctorType: MpxCtorType
  moduleId: string
  hasUnoCSS?: boolean
  bag: DiagnosticBag
}): string {
  const styles = options.styles.filter((style) => style.content && style.content.trim())
  if (!styles.length) return ''
  const formatValueName = '_f'
  const prepared = styles.map((style) => {
    return {
      content: prepareReactCss(style.content || '', options.resourceFile, options.moduleId),
      filename: options.resourceFile,
      srcMode: style.srcMode || options.srcMode
    }
  })
  let classMap: Record<string, unknown>
  try {
    classMap = getClassMap({
      styles: prepared,
      filename: options.resourceFile,
      mode: options.mode,
      srcMode: options.srcMode,
      ctorType: options.ctorType,
      formatValueName,
      warn: (message: string) => pushDiag(options.bag, 'warning', options.resourceFile, message),
      error: (message: string) => pushDiag(options.bag, 'error', options.resourceFile, message)
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error('[mpx compiler][' + options.resourceFile + ']: ' + message)
  }

  let classMapCode = ''
  Object.keys(classMap).forEach((key) => {
    if (classMapCode) classMapCode += ','
    const keyCode = isIdentifier(key) ? key : "['" + key + "']"
    classMapCode += keyCode + ': function(' + formatValueName + '){return ' + stringifyShallow(classMap[key]) + ';}'
  })

  let output = '/* styles */\n'
  output += 'global.__classCaches = global.__classCaches || []\n'
  output += 'var __classCache = new Map()\n'
  output += 'global.__classCaches.push(__classCache)\n'
  if (options.ctorType === 'app') {
    if (options.hasUnoCSS) {
      output += 'var __unoClassMap;\n'
      output += 'global.__getUnoStyle = function(className) {\n'
      output += '  if (!__unoClassMap) {\n'
      output += '    __unoClassMap = {__unoCssMapPlaceholder__}\n'
      output += '  }\n'
      output += '  return global.__GCC(className, __unoClassMap, __classCache);\n'
      output += '};\n'
      output += 'var __unoVarClassMap;\n'
      output += 'global.__getUnoVarStyle = function(className) {\n'
      output += '  if (!__unoVarClassMap) {\n'
      output += '    __unoVarClassMap = {__unoVarUtilitiesCssMap__}\n'
      output += '  }\n'
      output += '  return global.__GCC(className, __unoVarClassMap, __classCache);\n'
      output += '};\n'
      output += 'var __appClassMap\n'
      output += 'global.__getAppClassStyle = function(className) {\n'
      output += '  if(!__appClassMap) {\n'
      output += '    __appClassMap = {__unoCssMapPreflights__, ' + classMapCode + '};\n'
      output += '  }\n'
      output += '  return global.__GCC(className, __appClassMap, __classCache);\n'
      output += '};\n'
    } else {
      output += 'var __appClassMap\n'
      output += 'global.__getAppClassStyle = function(className) {\n'
      output += '  if(!__appClassMap) {\n'
      output += '    __appClassMap = {' + classMapCode + '};\n'
      output += '  }\n'
      output += '  return global.__GCC(className, __appClassMap, __classCache);\n'
      output += '};\n'
    }
    return output
  }
  output += 'var __classMap\n'
  output += 'global.currentInject.injectMethods = {\n'
  output += '  __getClassStyle: function(className) {\n'
  output += '    if(!__classMap) {\n'
  output += '      __classMap = {' + classMapCode + '};\n'
  output += '    }\n'
  output += '    return global.__GCC(className, __classMap, __classCache);\n'
  output += '  }\n'
  output += '};\n'
  return output
}
