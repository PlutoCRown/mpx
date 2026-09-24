/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck — extracted rule table; keep shapes loose
const TAG_NAME = 'block'

export default function () {
  return {
    test: TAG_NAME,
    web (tag, data) {
      data.el.isBlock = true
      return 'template'
    }
  }
}
