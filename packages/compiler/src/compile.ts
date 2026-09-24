import * as path from 'path'
import { parseJsonBlock } from './json'
import { parseSfc } from './parse-sfc'
import { buildScript } from './script'
import { transformTemplate } from './template'
import type { CompileMpxFileOptions, CompileMpxFileResult, SfcBlock } from './types'

export function compileMpxFile (source: string, options: CompileMpxFileOptions): CompileMpxFileResult {
  if (options.mode !== 'web') {
    throw new Error('[mpx compiler] mode "' + options.mode + '" is not implemented in this slice (only "web")')
  }
  const srcMode = options.srcMode || 'wx'
  if (srcMode !== 'wx') {
    throw new Error('[mpx compiler] srcMode "' + srcMode + '" is not implemented in this slice (only "wx")')
  }
  const resourceFile = resolveResource(options.resourcePath, options.context)
  const parsed = parseSfc(source)
  const template = pickBlock(parsed.templates)
  const script = pickBlock(parsed.scripts)
  const jsonBlock = pickBlock(parsed.jsons)
  const parsedJson = parseJsonBlock(jsonBlock, resourceFile, srcMode)
  const usingComponents = readUsingComponents(parsedJson.json)
  const pageConfig = readPageConfig(parsedJson.json)
  const built = buildScript({
    script: script ? script.content : '',
    resourceFile,
    ctorType: options.ctorType,
    usingComponents,
    pageConfig,
    lang: script ? script.lang : undefined
  })

  let code = ''
  if (template) {
    if (typeof template.attrs.src === 'string') {
      throw new Error('[mpx compiler][' + resourceFile + ']: template src is not supported; keep the template inline')
    }
    code += '<template>' + transformTemplate(template.content) + '</template>\n'
  }
  code += openScript(built.lang) + '\n' + built.code + '</script>\n'
  parsed.styles.forEach((style) => {
    if (!modeMatches(style)) return
    code += '<style' + styleOpenAttrs(style) + '>' + style.content + '</style>\n'
  })

  const watchFiles = [resourceFile]
  built.watchFiles.forEach((file) => {
    if (watchFiles.indexOf(file) < 0) watchFiles.push(file)
  })
  parsedJson.watchFiles.forEach((file) => {
    if (watchFiles.indexOf(file) < 0) watchFiles.push(file)
  })
  return { code, watchFiles }
}

function resolveResource (resourcePath: string, context?: string): string {
  if (path.isAbsolute(resourcePath)) return resourcePath
  if (context) return path.resolve(context, resourcePath)
  return path.resolve(resourcePath)
}

function modeMatches (block: SfcBlock): boolean {
  return !block.mode || block.mode === 'web'
}

function pickBlock (blocks: SfcBlock[]): SfcBlock | null {
  let selected: SfcBlock | null = null
  let priority = 0
  blocks.forEach((block) => {
    if (block.mode && block.mode !== 'web') return
    const next = block.mode === 'web' ? 2 : 1
    if (!selected || next >= priority) {
      selected = block
      priority = next
    }
  })
  return selected
}

function openScript (lang: string | null): string {
  if (!lang) return '<script>'
  return '<script lang="' + lang.replace(/"/g, '&quot;') + '">'
}

function readUsingComponents (json: Record<string, unknown>): Array<{ name: string, request: string }> {
  const raw = json.usingComponents
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
  const list: Array<{ name: string, request: string }> = []
  Object.keys(raw as Record<string, unknown>).forEach((name) => {
    const request = (raw as Record<string, unknown>)[name]
    if (typeof request === 'string') list.push({ name, request })
  })
  return list
}

function readPageConfig (json: Record<string, unknown>): Record<string, unknown> | null {
  const config: Record<string, unknown> = {}
  Object.keys(json).forEach((key) => {
    if (key !== 'usingComponents') config[key] = json[key]
  })
  return Object.keys(config).length ? config : null
}

function styleOpenAttrs (style: SfcBlock): string {
  let attrs = ''
  if (style.scoped) attrs += ' scoped'
  if (style.lang) attrs += ' lang="' + style.lang + '"'
  return attrs
}
