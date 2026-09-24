/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck — extracted rule table; keep shapes loose
const TAG_NAME = 'icon'

export default function () {
  return {
    test: TAG_NAME,
    web (tag, { el }) {
      el.isBuiltIn = true
      return 'mpx-icon'
    },
    ios (tag, { el }) {
      el.isBuiltIn = true
      return 'mpx-icon'
    },
    android (tag, { el }) {
      el.isBuiltIn = true
      return 'mpx-icon'
    },
    harmony (tag, { el }) {
      el.isBuiltIn = true
      return 'mpx-icon'
    }
  }
}
