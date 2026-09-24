/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck — extracted rule table; keep shapes loose
const TAG_NAME = 'label'

export default function ({ print }) {
  const ksPropLog = print({ platform: 'ks', tag: TAG_NAME, isError: false })

  return {
    test: TAG_NAME,
    ios (tag, { el }) {
      el.isBuiltIn = true
      return 'mpx-label'
    },
    android (tag, { el }) {
      el.isBuiltIn = true
      return 'mpx-label'
    },
    harmony (tag, { el }) {
      el.isBuiltIn = true
      return 'mpx-label'
    },
    props: [
      {
        test: /^(for)$/,
        ks: ksPropLog
      }
    ]
  }
}
