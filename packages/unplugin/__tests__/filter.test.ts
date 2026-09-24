import { isMpxTransformId } from '../src/filter'

describe('isMpxTransformId', () => {
  it('accepts only bare .mpx ids', () => {
    expect(isMpxTransformId('/app/src/page.mpx')).toBe(true)
    expect(isMpxTransformId('page.mpx')).toBe(true)
  })

  it('does not run on JS or Vue block requests', () => {
    expect(isMpxTransformId('/app/src/main.js')).toBe(false)
    expect(isMpxTransformId('/app/src/main.ts')).toBe(false)
    expect(isMpxTransformId('/app/src/App.vue')).toBe(false)
    expect(isMpxTransformId('/app/src/page.mpx?vue&type=script')).toBe(false)
    expect(isMpxTransformId('/app/src/page.mpx?vue&type=template&lang=html')).toBe(false)
  })
})
