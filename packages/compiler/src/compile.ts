import * as path from 'path'
import { compileWxAssets } from './compile-wx'
import { parseJsonBlock, readPageConfig, readUsingComponents } from './json-block'
import { parseSfc } from './parse-sfc'
import { matchingStyles, pickBlock } from './select'
import { buildScript } from './script'
import { transformTemplate } from './template'
import type { CompileMpxFileOptions, CompileMpxFileResult, SfcBlock } from './types'

export function compileMpxFile (source: string, options: CompileMpxFileOptions): CompileMpxFileResult {
  const mode = options.mode
  if (mode !== 'web' && mode !== 'wx') {
    throw new Error('[mpx compiler] mode "' + mode + '" is not implemented in this slice (wx assets and web SFC only)')
  }
  const srcMode = options.srcMode || 'wx'
  if (srcMode !== 'wx') {
    throw new Error('[mpx compiler] srcMode "' + srcMode + '" is not implemented in this slice (only "wx")')
  }
  const resourceFile = resolveResource(options.resourcePath, options.context)
  const parsed = parseSfc(source)
  const jsonContext = {
    mode,
    srcMode,
    env: options.env,
    defs: options.defs
  }
  if (mode === 'wx') {
    return compileWxAssets({
      parsed,
      resourceFile,
      jsonContext
    })
  }

  const template = pickBlock(parsed.templates, 'web')
  const script = pickBlock(parsed.scripts, 'web')
  const jsonBlock = pickBlock(parsed.jsons, 'web')
  const parsedJson = jsonBlock ? parseJsonBlock(jsonBlock, resourceFile, jsonContext) : emptyJson()
  const json = parsedJson.json
  const usingComponents = readUsingComponents(json)
  const pageConfig = readPageConfig(json)
  const built = buildScript({
    script: script ? script.content : '',
    resourceFile,
    ctorType: options.ctorType,
    usingComponents,
    pageConfig
  })

  let code = ''
  if (template) {
    if (typeof template.attrs.src === 'string') {
      throw new Error('[mpx compiler][' + resourceFile + ']: template src is not supported; keep the template inline')
    }
    code += '<template>' + transformTemplate(template.content) + '</template>\n'
  }
  code += '<script>\n' + built.code + '</script>\n'
  matchingStyles(parsed.styles, 'web').forEach((style) => {
    code += '<style' + styleOpenAttrs(style) + '>' + style.content + '</style>\n'
  })

  const watchFiles = [resourceFile]
  parsedJson.watchFiles.forEach((file) => {
    if (watchFiles.indexOf(file) < 0) watchFiles.push(file)
  })
  built.watchFiles.forEach((file) => {
    if (watchFiles.indexOf(file) < 0) watchFiles.push(file)
  })
  return { mode: 'web', code, watchFiles }
}

function emptyJson (): { json: Record<string, unknown>, watchFiles: string[] } {
  return { json: {}, watchFiles: [] }
}

function resolveResource (resourcePath: string, context?: string): string {
  if (path.isAbsolute(resourcePath)) return resourcePath
  if (context) return path.resolve(context, resourcePath)
  return path.resolve(resourcePath)
}

function styleOpenAttrs (style: SfcBlock): string {
  let attrs = ''
  if (style.scoped) attrs += ' scoped'
  if (style.lang) attrs += ' lang="' + style.lang + '"'
  return attrs
}
