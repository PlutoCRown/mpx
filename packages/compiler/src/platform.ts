import type { PlatformHooks } from './types'

function identityTemplate (source: string): string {
  return source
}

function identityStyle (source: string): string {
  return source
}

function identityJson (json: Record<string, unknown>): Record<string, unknown> {
  return json
}

export function resolvePlatform (hooks?: PlatformHooks): Required<PlatformHooks> {
  return Object.assign({
    template: identityTemplate,
    style: identityStyle,
    json: identityJson
  }, hooks)
}
