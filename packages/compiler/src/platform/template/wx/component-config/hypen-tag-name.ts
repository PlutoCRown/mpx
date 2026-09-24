/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck — extracted rule table; keep shapes loose
import { capitalToHyphen } from '../../../../utils/string'


export default function () {
  return {
    // tag name contains capital letters
    test: /[A-Z]/,
    ali: capitalToHyphen,
    swan: capitalToHyphen
  }
}
