/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck — extracted rule table; keep shapes loose
const TAG_NAME = 'page-container'

export default function () {
  return {
    test: TAG_NAME,
    event: [
      {
        test: 'beforeleave',
        ali () {
          return 'beforeLeave'
        }
      }
    ]
  }
}
