/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck — extracted rule table; keep shapes loose
const TAG_NAME = 'root-portal'

export default function ({ print }) {
  return {
    test: TAG_NAME,
    ios (tag, { el }) {
      el.isBuiltIn = true
      return 'mpx-root-portal'
    },
    android (tag, { el }) {
      el.isBuiltIn = true
      return 'mpx-root-portal'
    },
    harmony (tag, { el }) {
      el.isBuiltIn = true
      return 'mpx-root-portal'
    }
  }
}
