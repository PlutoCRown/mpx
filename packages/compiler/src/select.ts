import type { SfcBlock } from './types'

export function pickBlock (blocks: SfcBlock[], mode: string): SfcBlock | null {
  let selected: SfcBlock | null = null
  let priority = 0
  blocks.forEach((block) => {
    if (block.mode && block.mode !== mode) return
    const next = block.mode === mode ? 2 : 1
    if (!selected || next >= priority) {
      selected = block
      priority = next
    }
  })
  return selected
}

export function matchingStyles (styles: SfcBlock[], mode: string): SfcBlock[] {
  const matched: SfcBlock[] = []
  styles.forEach((style) => {
    if (!style.mode || style.mode === mode) matched.push(style)
  })
  return matched
}
