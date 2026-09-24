import * as path from 'path'
import type { JsonJsContext } from './eval-json-js'
import { parseJsonBlock, readUsingComponents } from './json-block'
import { miniProgramAssets } from './modes'
import type { MiniProgramFiles, MiniProgramMode } from './modes'
import { applyPlatformRules } from './platform'
import { matchingStyles, pickBlock } from './select'
import type { CompileMpxFileResult, ParsedSfc } from './types'

export function compileMiniAssets (input: {
  mode: MiniProgramMode
  parsed: ParsedSfc
  resourceFile: string
  jsonContext: JsonJsContext
}): CompileMpxFileResult {
  const mode = input.mode
  const resourceFile = input.resourceFile
  const spec = miniProgramAssets[mode]
  const template = pickBlock(input.parsed.templates, mode)
  const script = pickBlock(input.parsed.scripts, mode)
  const jsonBlock = pickBlock(input.parsed.jsons, mode)
  if (template && typeof template.attrs.src === 'string') {
    throw new Error('[mpx compiler][' + resourceFile + ']: template src is not supported; keep the template inline')
  }

  const parsedJson = jsonBlock ? parseJsonBlock(jsonBlock, resourceFile, input.jsonContext) : { json: {}, watchFiles: [] }
  const srcMode = input.jsonContext.srcMode
  let styleText = ''
  matchingStyles(input.parsed.styles, mode).forEach((style, index) => {
    if (index > 0) styleText += '\n'
    styleText += style.content
  })
  const nextJson = applyPlatformRules(parsedJson.json, { type: 'json', mode, srcMode }) as Record<string, unknown>
  const templateText = applyPlatformRules(template ? template.content : '', { type: 'template', mode, srcMode }) as string
  const styleOut = applyPlatformRules(styleText, { type: 'style', mode, srcMode }) as string
  const files: Record<string, string> = {
    js: script ? script.content : ''
  }
  files[spec.template] = templateText
  files[spec.style] = styleOut
  files.json = JSON.stringify(nextJson, null, 2) + '\n'

  return {
    mode,
    files: files as MiniProgramFiles<MiniProgramMode>,
    watchFiles: collectWatchFiles(resourceFile, parsedJson.watchFiles, readUsingComponents(nextJson))
  }
}

function collectWatchFiles (resourceFile: string, extra: string[], usingComponents: Array<{ name: string, request: string }>): string[] {
  const watchFiles = [resourceFile]
  extra.forEach((file) => {
    if (watchFiles.indexOf(file) < 0) watchFiles.push(file)
  })
  usingComponents.forEach((component) => {
    const request = toComponentRequest(component.request)
    const watched = resolveWatch(resourceFile, request)
    if (watched && watchFiles.indexOf(watched) < 0) watchFiles.push(watched)
  })
  return watchFiles
}

function toComponentRequest (request: string): string {
  if (!request.startsWith('.')) return request
  const query = request.indexOf('?')
  const pathname = query >= 0 ? request.slice(0, query) : request
  const search = query >= 0 ? request.slice(query) : ''
  if (path.posix.extname(pathname)) return request
  return pathname + '.mpx' + search
}

function resolveWatch (resourceFile: string, request: string): string | null {
  if (!request.startsWith('.')) return null
  const query = request.indexOf('?')
  const pathname = query >= 0 ? request.slice(0, query) : request
  return path.resolve(path.dirname(resourceFile), pathname)
}
