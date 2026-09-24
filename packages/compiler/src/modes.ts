// Asset names mirror webpack-plugin `config[mode].typeExtMap`, without the leading dot.
// tenon has no typeExtMap. web / ios / android / harmony are not mini-program assets.
export const miniProgramAssets = {
  wx: { template: 'wxml', style: 'wxss' },
  ali: { template: 'axml', style: 'acss' },
  swan: { template: 'swan', style: 'css' },
  qq: { template: 'qml', style: 'qss' },
  tt: { template: 'ttml', style: 'ttss' },
  qa: { template: 'qxml', style: 'css' },
  jd: { template: 'jxml', style: 'jxss' },
  dd: { template: 'ddml', style: 'ddss' },
  ks: { template: 'ksml', style: 'css' }
} as const

export type MiniProgramMode = keyof typeof miniProgramAssets

export type MiniProgramFiles<M extends MiniProgramMode> = M extends MiniProgramMode
  ? {
      js: string
      json: string
    } & Record<typeof miniProgramAssets[M]['template'] | typeof miniProgramAssets[M]['style'], string>
  : never

export function isMiniProgramMode (mode: string): mode is MiniProgramMode {
  return Object.prototype.hasOwnProperty.call(miniProgramAssets, mode)
}
