import * as fs from 'fs'
import * as path from 'path'
import { compileMpxFile } from '../src'

const fixtureDir = path.join(__dirname, '../fixtures')

function readFixture (name: string): string {
  return fs.readFileSync(path.join(fixtureDir, name), 'utf8')
}

describe('compileMpxFile web SFC', () => {
  const source = readFixture('page.mpx')
  const result = compileMpxFile(source, {
    mode: 'web',
    srcMode: 'wx',
    resourcePath: path.join(fixtureDir, 'page.mpx'),
    context: fixtureDir
  })

  it('emits a Vue SFC instead of web JS or webpack runtime glue', () => {
    const templateAt = result.code.indexOf('<template>')
    const scriptAt = result.code.indexOf('<script>')
    const styleAt = result.code.indexOf('<style>')
    expect(templateAt).toBeGreaterThanOrEqual(0)
    expect(scriptAt).toBeGreaterThan(templateAt)
    expect(styleAt).toBeGreaterThan(scriptAt)
    expect(result.mode).toBe('web')
    expect(result.files).toBeUndefined()
    expect(result.code).toContain('/* @mpxjs/compiler mode=web */')
    expect(result.code).not.toContain('processComponentOption')
    expect(result.code).not.toContain('webpack/lib')
    expect(result.code).not.toContain('<script type="application/json">')
    expect(result.map).toBeUndefined()
  })

  it('rewrites the page template to Vue directives and HTML tags', () => {
    expect(result.code).toContain('<div class="page">')
    expect(result.code).toContain('<span class="title">{{ title }}</span>')
    expect(result.code).toContain('v-if="show"')
    expect(result.code).toContain('v-else')
    expect(result.code).toContain('v-for="(item, index) in items"')
    expect(result.code).toContain(':key="item.id"')
    expect(result.code).toContain('@click="onTap"')
    expect(result.code).toContain('@click.stop="onCatch"')
    expect(result.code).toContain('<child></child>')
    expect(result.code).not.toContain('wx-only-template')
    expect(result.code).not.toContain('wx:if')
    expect(result.code).not.toContain('<view')
  })

  it('turns createPage and usingComponents into a Vue options script', () => {
    expect(result.code).toContain('data: function () { return {')
    expect(result.code).toContain('title: \'MPX Web\'')
    expect(result.code).toContain('onTap ()')
    expect(result.code).toContain('import __mpx_child_0 from "./child.mpx"')
    expect(result.code).toContain('child: __mpx_child_0')
    expect(result.code).toContain('"navigationBarTitleText":"Hello"')
    expect(result.code).toContain('__mpxCtorType = "page"')
    expect(result.code).toContain('>visible</div>')
    expect(result.code).not.toContain('@mpxjs/core')
    expect(result.watchFiles).toEqual([
      path.join(fixtureDir, 'page.mpx'),
      path.join(fixtureDir, 'child.mpx')
    ])
  })

  it('keeps web styles and drops wx-only styles', () => {
    expect(result.code).toContain('.page')
    expect(result.code).toContain('.web-only')
    expect(result.code).not.toContain('.wx-only')
  })

  it('compiles the child component fixture', () => {
    const child = compileMpxFile(readFixture('child.mpx'), {
      mode: 'web',
      resourcePath: path.join(fixtureDir, 'child.mpx')
    })
    expect(child.code).toContain('<div class="child">child: {{ label }}</div>')
    expect(child.code).toContain('label: \'nested\'')
    expect(child.code).toContain('.child')
    expect(child.code).toContain('__mpxCtorType = "component"')
  })

  it('maps image and class bindings, and honors an explicit ctorType', () => {
    const compiled = compileMpxFile([
      '<template>',
      '  <image src="{{ icon }}" />',
      '  <view class="{{ flag }}"></view>',
      '</template>',
      '<script>',
      'createComponent({',
      '  data () {',
      '    return { icon: "a.png", flag: "on" }',
      '  }',
      '})',
      '</script>'
    ].join('\n'), {
      mode: 'web',
      resourcePath: 'inline.mpx',
      ctorType: 'page'
    })
    expect(compiled.code).toContain('<img :src="icon" />')
    expect(compiled.code).toContain('<div :class="flag"></div>')
    expect(compiled.code).toContain('data () {')
    expect(compiled.code).not.toContain('return data')
    expect(compiled.code).toContain('__mpxCtorType = "page"')
  })

  it('rejects targets outside this slice', () => {
    expect(() => compileMpxFile('<template></template>', {
      mode: 'ios' as 'web',
      resourcePath: 'x.mpx'
    })).toThrow(/mini-program assets and web SFC only/)
    expect(() => compileMpxFile('<template></template>', {
      mode: 'web',
      srcMode: 'ali',
      resourcePath: 'x.mpx'
    })).toThrow(/only "wx"/)
  })
})
