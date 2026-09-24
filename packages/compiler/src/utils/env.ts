export function isReact (mode: string): boolean {
  return mode === 'ios' || mode === 'android' || mode === 'harmony'
}

export function isWeb (mode: string): boolean {
  return mode === 'web'
}

export function isMiniProgram (mode: string): boolean {
  return !isWeb(mode) && !isReact(mode)
}

export function isNoMode (mode: string): boolean {
  return mode === 'noMode'
}
