import * as path from 'path'

export function toPosix (value: string): string {
  return value.replace(/\\/g, '/')
}

export function splitRequest (request: string): { pathname: string, query: Record<string, string> } {
  const qIndex = request.indexOf('?')
  const pathname = qIndex >= 0 ? request.slice(0, qIndex) : request
  const query: Record<string, string> = {}
  if (qIndex >= 0) {
    request.slice(qIndex + 1).split('&').forEach((part) => {
      if (!part) return
      const eq = part.indexOf('=')
      const key = decodeURIComponent(eq >= 0 ? part.slice(0, eq) : part)
      query[key] = eq >= 0 ? decodeURIComponent(part.slice(eq + 1)) : ''
    })
  }
  return { pathname, query }
}

export function appendQuery (request: string, data: Record<string, string>): string {
  const current = splitRequest(request)
  Object.keys(data).forEach((key) => {
    current.query[key] = data[key]
  })
  const pairs: string[] = []
  Object.keys(current.query).sort().forEach((key) => {
    const value = current.query[key]
    pairs.push(value === '' ? encodeURIComponent(key) : encodeURIComponent(key) + '=' + encodeURIComponent(value))
  })
  return pairs.length ? current.pathname + '?' + pairs.join('&') : current.pathname
}

export function isProjectFile (pathname: string): boolean {
  if (pathname.startsWith('.')) return true
  if (path.isAbsolute(pathname)) return true
  if (pathname.startsWith('@')) return false
  return pathname.indexOf('/') >= 0 || pathname.indexOf('\\') >= 0
}

export function ensureRelativeMpx (request: string): string {
  const current = splitRequest(request)
  if (!isProjectFile(current.pathname)) return request
  if (path.posix.extname(current.pathname) || path.win32.extname(current.pathname)) return request
  return appendQuery(current.pathname + '.mpx', current.query)
}

export function resolveRelative (fromFile: string, request: string): string | null {
  const pathname = splitRequest(request).pathname
  if (!pathname.startsWith('.')) return null
  return path.resolve(path.dirname(fromFile), pathname)
}

export function quoteRequest (request: string): string {
  return JSON.stringify(request)
}
