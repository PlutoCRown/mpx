/**
 * CompilerBridge provides external template-compiler functions
 * that the platform rules need but which live outside this package.
 * The consuming build tool (webpack-plugin, unplugin, etc.) injects
 * the real implementations via setCompilerBridge() before creating
 * any rules runner.
 *
 * When unset, a sufficient default bridge is auto-provided so
 * @mpxjs/compiler package tests and paths that only need json/string
 * transforms do not throw. Webpack-plugin still installs the real
 * bridge via its shim.
 */
export interface CompilerBridge {
  parseMustacheWithContext: (value: string) => { result: string; hasBinding: boolean }
  stringifyWithResolveComputed: (value: string) => string
  makeAttrsMap: (attrsList: Array<{ name: string; value: unknown }>) => Record<string, unknown>
  evalExp: (value: string) => { success: boolean; result: unknown }
}

const defaultBridge: CompilerBridge = {
  parseMustacheWithContext (value: string) {
    const tagRE = /\{\{((?:.|\n|\r)+?)\}\}(?!})/
    const match = tagRE.exec(value)
    if (match) {
      return { result: match[1].trim(), hasBinding: true }
    }
    return { result: JSON.stringify(value), hasBinding: false }
  },
  stringifyWithResolveComputed (value: string) {
    return JSON.stringify(value)
  },
  makeAttrsMap (attrsList) {
    const map: Record<string, unknown> = {}
    attrsList.forEach((attr) => { map[attr.name] = attr.value })
    return map
  },
  evalExp (value: string) {
    try {
      // eslint-disable-next-line no-new-func
      return { success: true, result: new Function('return (' + value + ')')() }
    } catch (_e) {
      return { success: false, result: undefined }
    }
  }
}

let bridge: CompilerBridge | null = null

export function setCompilerBridge (b: CompilerBridge): void {
  bridge = b
}

export function getCompilerBridge (): CompilerBridge {
  if (!bridge) {
    bridge = defaultBridge
  }
  return bridge
}
