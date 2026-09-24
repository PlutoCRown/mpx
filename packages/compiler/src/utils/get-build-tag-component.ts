import { isBuildInWebTag, isBuildInReactTag } from './dom-tag-config'

export interface BuildInTagComponent {
  name: string
  resource: string
}

export default function getBuildInTagComponent (mode: string, tag: string, libResolver?: (file: string) => string): BuildInTagComponent | undefined {
  const lib = libResolver || ((file: string) => '@mpxjs/webpack-plugin/lib/' + file)

  const aliBuildTag: Record<string, BuildInTagComponent> = ['view', 'text'].reduce((obj: Record<string, BuildInTagComponent>, name) => {
    obj[name] = {
      name: `mpx-${name}`,
      resource: lib(`runtime/components/ali/mpx-${name}.mpx`)
    }
    return obj
  }, {})

  switch (mode) {
    case 'ali':
      return aliBuildTag[tag]
    case 'web':
      if (isBuildInWebTag(`mpx-${tag}`)) {
        return {
          name: `mpx-${tag}`,
          resource: lib(`runtime/components/web/mpx-${tag}.vue`)
        }
      }
      return undefined
    case 'ios':
    case 'android':
    case 'harmony':
      if (isBuildInReactTag(`mpx-${tag}`)) {
        return {
          name: `mpx-${tag}`,
          resource: lib(`runtime/components/react/dist/mpx-${tag}.jsx`)
        }
      }
      return undefined
  }
}
