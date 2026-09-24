/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck — extracted rule table; keep shapes loose
const TAG_NAME = 'web-view'

export default function () {
  return {
    test: TAG_NAME,
    web (tag, { el }) {
      el.isBuiltIn = true
      return 'mpx-web-view'
    },
    ios (tag, { el }) {
      el.isBuiltIn = true
      return 'mpx-web-view'
    },
    android (tag, { el }) {
      el.isBuiltIn = true
      return 'mpx-web-view'
    },
    harmony (tag, { el }) {
      el.isBuiltIn = true
      return 'mpx-web-view'
    }
  }
}
