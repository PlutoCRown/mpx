/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck — extracted rule table; keep shapes loose
const TAG_NAME = 'radio-group'

export default function () {
  return {
    test: TAG_NAME,
    web (tag, { el }) {
      el.isBuiltIn = true
      return 'mpx-radio-group'
    },
    ios (tag, { el }) {
      el.isBuiltIn = true
      return 'mpx-radio-group'
    },
    android (tag, { el }) {
      el.isBuiltIn = true
      return 'mpx-radio-group'
    },
    harmony (tag, { el }) {
      el.isBuiltIn = true
      return 'mpx-radio-group'
    }
  }
}
