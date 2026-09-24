import * as fs from 'fs'
import * as path from 'path'
import { applyPlatformRules, compileMpxFile } from '../src'

const fixtureDir = path.join(__dirname, '../fixtures')

function readFixture (name: string): string {
  return fs.readFileSync(path.join(fixtureDir, name), 'utf8')
}

describe('compileMpxFile wx assets', () => {
  const result = compileMpxFile(readFixture('page.mpx'), {
    mode: 'wx',
    srcMode: 'wx',
    resourcePath: path.join(fixtureDir, 'page.mpx'),
    context: fixtureDir
  })

  it('emits discrete js, wxml, wxss, and json assets', () => {
    expect(result.mode).toBe('wx')
    expect(result.code).toBeUndefined()
    const files = result.files
    if (!files) throw new Error('expected wx files')
    expect(files.js).toContain("import { createPage } from '@mpxjs/core'")
    expect(files.js).toContain('createPage({')
    expect(files.js).toContain("title: 'MPX Web'")
    expect(files.js).not.toContain('export default')
    expect(files.js).not.toContain('/* @mpxjs/compiler mode=web */')
    expect(files.wxml).toContain('<view>wx-only-template</view>')
    expect(files.wxml).not.toContain('class="page"')
    expect(files.wxml).not.toContain('wx:if')
    expect(files.wxss).toContain('.page')
    expect(files.wxss).toContain('.wx-only')
    expect(files.wxss).not.toContain('.web-only')
    expect(JSON.parse(files.json)).toEqual({
      usingComponents: { child: './child' },
      navigationBarTitleText: 'Hello'
    })
    expect(result.watchFiles).toEqual([
      path.join(fixtureDir, 'page.mpx'),
      path.join(fixtureDir, 'child.mpx')
    ])
  })

  it('keeps the child component script and unscoped blocks', () => {
    const child = compileMpxFile(readFixture('child.mpx'), {
      mode: 'wx',
      resourcePath: path.join(fixtureDir, 'child.mpx')
    })
    const files = child.files
    if (!files) throw new Error('expected wx files')
    expect(files.wxml).toContain('<view class="child">child: {{ label }}</view>')
    expect(files.js).toContain('createComponent({')
    expect(files.js).toContain("label: 'nested'")
    expect(files.wxss).toContain('.child')
    expect(JSON.parse(files.json)).toEqual({})
    expect(child.watchFiles).toEqual([path.join(fixtureDir, 'child.mpx')])
  })

  it('keeps wx and unscoped blocks, and drops web-only blocks', () => {
    const source = [
      '<template mode="web"><view>web</view></template>',
      '<template><view>plain</view></template>',
      '<script mode="web">createPage({ web: true })</script>',
      '<script mode="wx">createPage({ wx: true })</script>',
      '<style mode="web">.web{}</style>',
      '<style>.plain{}</style>'
    ].join('\n')
    const compiled = compileMpxFile(source, {
      mode: 'wx',
      resourcePath: 'pick.mpx'
    })
    const files = compiled.files
    if (!files) throw new Error('expected wx files')
    expect(files.wxml).toContain('<view>plain</view>')
    expect(files.wxml).not.toContain('<view>web</view>')
    expect(files.js).toContain('wx: true')
    expect(files.js).not.toContain('web: true')
    expect(files.wxss).toContain('.plain')
    expect(files.wxss).not.toContain('.web')
  })

  it('keeps applyPlatformRules as an identity wrapper', () => {
    const json = { usingComponents: { child: './child' } }
    const template = '<view wx:if="{{show}}"></view>'
    const style = '.a { color: red }'
    expect(applyPlatformRules(json, { type: 'json', mode: 'wx', srcMode: 'wx' })).toBe(json)
    expect(applyPlatformRules(template, { type: 'template', mode: 'ali', srcMode: 'wx' })).toBe(template)
    expect(applyPlatformRules(style, { type: 'style', mode: 'wx', srcMode: 'wx' })).toBe(style)
  })

  it('emits empty assets when the file has no blocks', () => {
    const empty = compileMpxFile('', {
      mode: 'wx',
      resourcePath: 'empty.mpx'
    })
    expect(empty.files).toEqual({
      js: '',
      wxml: '',
      wxss: '',
      json: '{}\n'
    })
    expect(empty.watchFiles).toEqual([path.resolve('empty.mpx')])
  })

  it('rejects a non-wx source dialect and an external template', () => {
    expect(() => compileMpxFile('<template></template>', {
      mode: 'wx',
      srcMode: 'ali',
      resourcePath: 'x.mpx'
    })).toThrow(/only "wx"/)
    expect(() => compileMpxFile('<template src="./other.wxml"></template>', {
      mode: 'wx',
      resourcePath: 'x.mpx'
    })).toThrow(/template src is not supported/)
  })
})
