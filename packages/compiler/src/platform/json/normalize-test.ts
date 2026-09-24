// @ts-nocheck — extracted rule table; keep shapes loose
import hasOwn from '../../utils/has-own'

export default function normalizeTest (test: string | undefined): (input: unknown, meta: Record<string, unknown>) => boolean {
  if (test) {
    return (input: unknown, meta: Record<string, unknown>) => {
      const pathArr = test.split('|')
      meta.paths = []
      let result = false
      for (let i = 0; i < pathArr.length; i++) {
        if (hasOwn(input as Record<string, unknown>, pathArr[i])) {
          (meta.paths as string[]).push(pathArr[i])
          result = true
        }
      }
      return result
    }
  } else {
    return () => true
  }
}
