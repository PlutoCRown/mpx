/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck — extracted rule table; keep shapes loose
const TAG_NAME = 'sticky-header'

export default function ({ print }) {
  return {
    test: TAG_NAME,
    android (tag, { el }) {
      el.isBuiltIn = true
      return 'mpx-sticky-header'
    },
    ios (tag, { el }) {
      el.isBuiltIn = true
      return 'mpx-sticky-header'
    },
    harmony (tag, { el }) {
      el.isBuiltIn = true
      return 'mpx-sticky-header'
    },
    web (tag, { el }) {
      el.isBuiltIn = true
      return 'mpx-sticky-header'
    }
  }
}
