import { buildJsonDefs, evalJsonJs } from './eval-json-js'
import type { JsonJsContext } from './eval-json-js'
import type { SfcBlock } from './types'

export interface ParsedJsonBlock {
  json: Record<string, unknown>
  watchFiles: string[]
}

export function parseJsonBlock (block: SfcBlock, resourceFile: string, context: JsonJsContext): ParsedJsonBlock {
  if (block.name === 'json') return parseJsonJsBlock(block.content, resourceFile, context)
  return {
    json: parsePureJson(block.content, resourceFile),
    watchFiles: []
  }
}

export function readUsingComponents (json: Record<string, unknown>): Array<{ name: string, request: string }> {
  const raw = json.usingComponents
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
  const list: Array<{ name: string, request: string }> = []
  Object.keys(raw as Record<string, unknown>).forEach((name) => {
    const request = (raw as Record<string, unknown>)[name]
    if (typeof request === 'string') list.push({ name, request })
  })
  return list
}

export function readPageConfig (json: Record<string, unknown>): Record<string, unknown> | null {
  const config: Record<string, unknown> = {}
  Object.keys(json).forEach((key) => {
    if (key !== 'usingComponents') config[key] = json[key]
  })
  return Object.keys(config).length ? config : null
}

function parseJsonJsBlock (content: string, resourceFile: string, context: JsonJsContext): ParsedJsonBlock {
  const watchFiles: string[] = []
  let exported: unknown
  try {
    exported = evalJsonJs(content, resourceFile, buildJsonDefs(context), watchFiles)
  } catch (error) {
    if (error instanceof Error && error.message.indexOf('[mpx compiler][') === 0) throw error
    const message = error instanceof Error ? error.message : String(error)
    throw new Error('[mpx compiler][' + resourceFile + ']: ' + message)
  }
  return {
    json: toJsonObject(exported, resourceFile),
    watchFiles
  }
}

function parsePureJson (content: string, resourceFile: string): Record<string, unknown> {
  try {
    return toJsonObject(JSON.parse(content), resourceFile)
  } catch (error) {
    if (error instanceof Error && error.message.indexOf('[mpx compiler][') === 0) throw error
    const message = error instanceof Error ? error.message : String(error)
    throw new Error('[mpx compiler][' + resourceFile + ']: ' + message)
  }
}

function toJsonObject (value: unknown, resourceFile: string): Record<string, unknown> {
  let normalized: unknown
  try {
    normalized = JSON.parse(JSON.stringify(value))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error('[mpx compiler][' + resourceFile + ']: ' + message)
  }
  if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) {
    throw new Error('[mpx compiler][' + resourceFile + ']: JSON block must be an object')
  }
  return normalized as Record<string, unknown>
}
