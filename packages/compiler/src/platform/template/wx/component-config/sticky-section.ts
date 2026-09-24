/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck — extracted rule table; keep shapes loose
const TAG_NAME = 'sticky-section'

export default function ({ print }) {
  return {
    test: TAG_NAME,
    android (tag, { el }) {
      el.isBuiltIn = true
      return 'mpx-sticky-section'
    },
    ios (tag, { el }) {
      el.isBuiltIn = true
      return 'mpx-sticky-section'
    },
    harmony (tag, { el }) {
      el.isBuiltIn = true
      return 'mpx-sticky-section'
    },
    web (tag, { el }) {
      el.isBuiltIn = true
      return 'mpx-sticky-section'
    }
  }
}
