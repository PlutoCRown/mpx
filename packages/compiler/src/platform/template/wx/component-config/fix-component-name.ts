/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck — extracted rule table; keep shapes loose
import { isOriginTag, isBuildInWebTag, isBuildInReactTag } from '../../../../utils/dom-tag-config'


export default function () {
  const handleComponentTag = (el, data) => {
    const newTag = `mpx-com-${el.tag}`
    const usingComponents = data.usingComponents || []
    // 当前组件名与原生tag或内建tag同名，对组件名进行转义
    // json转义见：platform/json/wx/index.js fixComponentName
    if (usingComponents.includes(newTag)) {
      el.tag = newTag
    }
    return el
  }

  return {
    waterfall: true,
    skipNormalize: true,
    supportedModes: ['web', 'ios', 'android', 'harmony'],
    test: (input) => isOriginTag(input) || isBuildInWebTag(input) || isBuildInReactTag(input),
    web: handleComponentTag,
    ios: handleComponentTag,
    android: handleComponentTag,
    harmony: handleComponentTag
  }
}
