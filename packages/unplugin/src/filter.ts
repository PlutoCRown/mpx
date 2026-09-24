// Only bare `.mpx` modules enter the web compiler. Vue block requests such as
// `page.mpx?vue&type=script` stay with rspack-vue-loader. Do not match JS.
export function isMpxTransformId (id: string): boolean {
  if (id.indexOf('?') >= 0) return false
  return id.endsWith('.mpx')
}

// RN compiles the `.mpx` module itself, plus the app-body and imported-template
// queries this package emits. Vue block queries stay out.
export function isRnMpxId (id: string): boolean {
  const queryAt = id.indexOf('?')
  const file = queryAt >= 0 ? id.slice(0, queryAt) : id
  if (queryAt >= 0 && (id.indexOf('?vue') >= 0 || id.indexOf('&vue') >= 0)) return false
  if (file.endsWith('.mpx')) return true
  return queryAt >= 0 && /(^|[?&])mpxRnTemplate(=|&|$)/.test(id)
}

export function readMpxId (id: string): { file: string, query: Record<string, string> } {
  const queryAt = id.indexOf('?')
  const file = queryAt >= 0 ? id.slice(0, queryAt) : id
  const query: Record<string, string> = {}
  if (queryAt < 0) return { file, query }
  id.slice(queryAt + 1).split('&').forEach((part) => {
    if (!part) return
    const eq = part.indexOf('=')
    const key = decodeURIComponent(eq >= 0 ? part.slice(0, eq) : part)
    query[key] = eq >= 0 ? decodeURIComponent(part.slice(eq + 1)) : ''
  })
  return { file, query }
}
