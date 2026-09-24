import * as fs from 'fs'
import * as path from 'path'
import { compileMpxFile } from '../src'
import type { MiniProgramMode } from '../src'
import * as platform from '../src/platform'

const fixtureDir = path.join(__dirname, '../fixtures')

function readFixture (name: string): string {
  return fs.readFileSync(path.join(fixtureDir, name), 'utf8')
}

const targets: Array<{ mode: MiniProgramMode, template: string, style: string }> = [
  { mode: 'ali', template: 'axml', style: 'acss' },
  { mode: 'swan', template: 'swan', style: 'css' },
  { mode: 'qq', template: 'qml', style: 'qss' },
  { mode: 'tt', template: 'ttml', style: 'ttss' },
  { mode: 'qa', template: 'qxml', style: 'css' },
  { mode: 'jd', template: 'jxml', style: 'jxss' },
  { mode: 'dd', template: 'ddml', style: 'ddss' },
  { mode: 'ks', template: 'ksml', style: 'css' }
]

describe('compileMpxFile mini-program assets', () => {
  let rules: jest.SpyInstance
  beforeEach(() => {
    rules = jest.spyOn(platform, 'applyPlatformRules')
  })
  afterEach(() => {
    rules.mockRestore()
  })

  targets.forEach((target) => {
    it('serializes ' + target.mode + ' after applyPlatformRules', () => {
      const resourcePath = path.join(fixtureDir, 'page.mpx')
      const compiled = compileMpxFile(readFixture('page.mpx'), {
        mode: target.mode,
        srcMode: 'wx',
        resourcePath,
        context: fixtureDir
      })
      expect(compiled.mode).toBe(target.mode)
      expect(compiled.code).toBeUndefined()
      const files = compiled.files
      if (!files) throw new Error('expected ' + target.mode + ' files')
      expect(Object.keys(files).sort()).toEqual(['js', 'json', target.style, target.template].sort())
      expect(files.js).toContain('createPage({')
      expect(files.js).not.toContain('export default')
      expect(files[target.template]).toContain('class="page"')
      // Real platform rules: wx:if → target directive prefix (qa has no wx: rewrite in rule tables)
      if (target.mode === 'qa') {
        expect(files[target.template]).toContain('wx:if')
      } else if (target.mode === 'swan') {
        expect(files[target.template]).toContain('s-if')
        expect(files[target.template]).not.toContain('wx:if')
      } else {
        const dirPrefix = ({ ali: 'a:', qq: 'qq:', tt: 'tt:', jd: 'jd:', ks: 'ks:', dd: 'dd:' } as Record<string, string>)[target.mode]
        expect(files[target.template]).toContain(dirPrefix + 'if')
        expect(files[target.template]).not.toContain('wx:if')
      }
      expect(files[target.template]).not.toContain('wx-only-template')
      expect(files[target.style]).toContain('.page')
      expect(files[target.style]).not.toContain('.wx-only')
      expect(files[target.style]).not.toContain('.web-only')
      // Page json window rules: navigationBarTitleText → defaultTitle on ali
      const json = JSON.parse(files.json)
      expect(json.usingComponents).toEqual({ child: './child' })
      if (target.mode === 'ali') {
        expect(json.defaultTitle).toBe('Hello')
        expect(json.navigationBarTitleText).toBeUndefined()
      } else {
        expect(json.navigationBarTitleText).toBe('Hello')
      }
      expect(compiled.watchFiles).toEqual([
        resourcePath,
        path.join(fixtureDir, 'child.mpx')
      ])
      expect(rules.mock.calls.map((call) => call[1])).toEqual([
        { type: 'json', mode: target.mode, srcMode: 'wx' },
        { type: 'template', mode: target.mode, srcMode: 'wx' },
        { type: 'style', mode: target.mode, srcMode: 'wx' }
      ])

      rules.mockClear()
      rules.mockImplementation((input: unknown, opts: { type: string, mode: string, srcMode: string }) => {
        if (opts.type === 'json' && input && typeof input === 'object' && !Array.isArray(input)) {
          return Object.assign({}, input, { ruled: opts.mode })
        }
        if (typeof input === 'string') return input + '/*' + opts.type + '*/'
        return input
      })
      const ruled = compileMpxFile([
        '<template><view wx:if="{{show}}">plain</view></template>',
        '<style>.a{}</style>',
        '<style>.' + target.mode + '{}</style>',
        '<script type="application/json">{ "title": "T" }</script>'
      ].join('\n'), {
        mode: target.mode,
        resourcePath: 'ruled.mpx'
      })
      const ruledFiles = ruled.files
      if (!ruledFiles) throw new Error('expected ruled files')
      expect(ruledFiles[target.template]).toBe('<view wx:if="{{show}}">plain</view>/*template*/')
      expect(ruledFiles[target.style]).toBe('.a{}\n.' + target.mode + '{}/*style*/')
      expect(JSON.parse(ruledFiles.json)).toEqual({ title: 'T', ruled: target.mode })
      expect(ruledFiles.js).toBe('')
      expect(rules.mock.calls.map((call) => call[1])).toEqual([
        { type: 'json', mode: target.mode, srcMode: 'wx' },
        { type: 'template', mode: target.mode, srcMode: 'wx' },
        { type: 'style', mode: target.mode, srcMode: 'wx' }
      ])
    })

    it('emits empty ' + target.mode + ' assets', () => {
      const empty = compileMpxFile('', {
        mode: target.mode,
        resourcePath: 'empty.mpx'
      })
      const expected: Record<string, string> = {
        js: '',
        json: '{}\n'
      }
      expected[target.template] = ''
      expected[target.style] = ''
      expect(empty.files).toEqual(expected)
      expect(empty.watchFiles).toEqual([path.resolve('empty.mpx')])
    })
  })

  it('keeps ali blocks and drops wx-only blocks', () => {
    const compiled = compileMpxFile([
      '<template mode="wx"><view>wx</view></template>',
      '<template><view>plain</view></template>',
      '<template mode="ali"><view>ali</view></template>',
      '<script mode="wx">createPage({ wx: true })</script>',
      '<script mode="ali">createPage({ ali: true })</script>',
      '<style mode="wx">.wx{}</style>',
      '<style>.plain{}</style>',
      '<style mode="ali">.ali{}</style>'
    ].join('\n'), {
      mode: 'ali',
      resourcePath: 'pick.mpx'
    })
    const files = compiled.files
    if (!files) throw new Error('expected ali files')
    expect(files.axml).toBe('<view>ali</view>')
    expect(files.js).toContain('ali: true')
    expect(files.js).not.toContain('wx: true')
    expect(files.acss).toBe('.plain{}\n.ali{}')
    expect(rules.mock.calls[2][0]).toBe('.plain{}\n.ali{}')
    expect(rules.mock.calls[2][1]).toEqual({ type: 'style', mode: 'ali', srcMode: 'wx' })
  })

  it('rejects an external template on a non-wx target', () => {
    expect(() => compileMpxFile('<template src="./other.axml"></template>', {
      mode: 'qq',
      resourcePath: 'x.mpx'
    })).toThrow(/template src is not supported/)
  })

  it('rejects RN and tenon targets', () => {
    ['ios', 'android', 'harmony', 'tenon'].forEach((mode) => {
      expect(() => compileMpxFile('<template></template>', {
        mode: mode as 'web',
        resourcePath: 'x.mpx'
      })).toThrow(/not implemented/)
    })
  })
})
