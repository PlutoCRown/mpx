// Only bare `.mpx` modules enter the compiler. Vue block requests such as
// `page.mpx?vue&type=script` stay with rspack-vue-loader. Do not match JS.
export function isMpxTransformId (id: string): boolean {
  if (id.indexOf('?') >= 0) return false
  return id.endsWith('.mpx')
}
