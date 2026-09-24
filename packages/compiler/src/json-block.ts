import type { SfcBlock } from './types'

export function parseJsonBlock (block: SfcBlock, resourceFile: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(block.content)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('JSON block must be an object')
    }
    return parsed as Record<string, unknown>
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const hint = block.name === 'json'
      ? ' (<script name="json"> JS / module.exports is not compiled in this slice)'
      : ''
    throw new Error('[mpx compiler][' + resourceFile + ']: ' + message + hint)
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
