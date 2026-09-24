/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck — extracted rule table; keep shapes loose
const TAG_NAME = 'picker-view-column'

export default function () {
  return {
    test: TAG_NAME,
    web (tag, { el }) {
      el.isBuiltIn = true
      return 'mpx-picker-view-column'
    },
    ios (tag, { el }) {
      el.isBuiltIn = true
      return 'mpx-picker-view-column'
    },
    android (tag, { el }) {
      el.isBuiltIn = true
      return 'mpx-picker-view-column'
    },
    harmony (tag, { el }) {
      el.isBuiltIn = true
      return 'mpx-picker-view-column'
    }
  }
}
