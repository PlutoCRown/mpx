/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck — extracted rule table; keep shapes loose
const TAG_NAME = 'template'

export default function () {
  return {
    test: TAG_NAME,
    props: [
      {
        test: 'data',
        swan ({ name, value }) {
          return {
            name,
            value: `{${value}}`
          }
        }
      }
    ]
  }
}
