export function hump2dash (value: string): string {
  return value.replace(/[A-Z]/g, function (match) {
    return '-' + match.toLowerCase()
  })
}

export function dash2hump (value: string): string {
  return value.replace(/-([a-z])/g, function (_match, p1: string) {
    return p1.toUpperCase()
  })
}
