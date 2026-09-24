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

  it('evaluates script name=json as JavaScript, including require and __mpx_mode__', () => {
    const compiled = compileMpxFile(readFixture('json-module.mpx'), {
      mode: 'web',
      resourcePath: path.join(fixtureDir, 'json-module.mpx')
    })
    expect(compiled.code).toContain('import __mpx_child_0 from "./child.mpx"')
    expect(compiled.code).toContain('import __mpx_extra_1 from "./child.mpx"')
    expect(compiled.code).toContain('child: __mpx_child_0')
    expect(compiled.code).toContain('extra: __mpx_extra_1')
    expect(compiled.code).toContain('"navigationBarTitleText":"Otter"')
    expect(compiled.code).not.toContain('./missing')
    expect(compiled.watchFiles).toEqual([
      path.join(fixtureDir, 'json-module.mpx'),
      path.join(fixtureDir, 'child.mpx'),
      path.join(fixtureDir, 'using-components.js')
    ])
  })

  it('accepts an object literal in script name=json', () => {
    const compiled = compileMpxFile(readFixture('json-literal.mpx'), {
      mode: 'web',
      resourcePath: path.join(fixtureDir, 'json-literal.mpx')
    })
    expect(compiled.code).toContain('import __mpx_child_0 from "./child.mpx"')
    expect(compiled.code).toContain('"navigationBarTitleText":"Literal"')
  })

  it('still parses pure application/json without evaluating it as script', () => {
    const compiled = compileMpxFile(readFixture('json-pure.mpx'), {
      mode: 'web',
      resourcePath: path.join(fixtureDir, 'json-pure.mpx')
    })
    expect(compiled.code).toContain('import __mpx_child_0 from "./child.mpx"')
    expect(compiled.code).toContain('"navigationBarTitleText":"Pure"')
    expect(compiled.code).toContain('__mpxCtorType = "component"')
    expect(() => compileMpxFile([
      '<script type="application/json">',
      'module.exports = { navigationBarTitleText: "Nope" }',
      '</script>'
    ].join('\n'), {
      mode: 'web',
      resourcePath: 'not-json.mpx'
    })).toThrow(/JSON/)
  })

  it('parses application/json as JSON5, including comments and trailing commas', () => {
    const compiled = compileMpxFile([
      '<script type="application/json">',
      '{',
      '  // page title',
      '  "navigationBarTitleText": "Commented",',
      '  "usingComponents": {',
      '    "child": "./child",',
      '  },',
      '}',
      '</script>'
    ].join('\n'), {
      mode: 'web',
      resourcePath: path.join(fixtureDir, 'json5.mpx')
    })
    expect(compiled.code).toContain('"navigationBarTitleText":"Commented"')
    expect(compiled.code).toContain('import __mpx_child_0 from "./child.mpx"')
  })

  it('keeps the web script name=json block when a wx one is also present', () => {
    const compiled = compileMpxFile([
      '<script name="json" mode="wx">',
      'module.exports = { navigationBarTitleText: "WX" }',
      '</script>',
      '<script name="json" mode="web">',
      'module.exports = { navigationBarTitleText: "WEB" }',
      '</script>'
    ].join('\n'), {
      mode: 'web',
      resourcePath: 'mode-json.mpx'
    })
    expect(compiled.code).toContain('"navigationBarTitleText":"WEB"')
    expect(compiled.code).not.toContain('"navigationBarTitleText":"WX"')
  })

  it('emits lang=ts and keeps import type, PropType, and generic constructors', () => {
    const compiled = compileMpxFile(readFixture('script-ts.mpx'), {
      mode: 'web',
      resourcePath: path.join(fixtureDir, 'script-ts.mpx')
    })
    const importType = compiled.code.indexOf('import type')
    const componentImport = compiled.code.indexOf('import __mpx_child_0')
    const typeItem = compiled.code.indexOf('type Item')
    expect(compiled.code).toContain('<script lang="ts">')
    expect(importType).toBeGreaterThanOrEqual(0)
    expect(componentImport).toBeGreaterThan(importType)
    expect(typeItem).toBeGreaterThan(componentImport)
    expect(compiled.code).toContain('PropType<Item[]>')
    expect(compiled.code).toContain('interface CardProps')
    expect(compiled.code).toContain('} as CardProps')
    expect(compiled.code).toContain('data: function () { return {')
    expect(compiled.code).toContain("title: 'typed'")
    expect(compiled.code).toContain('...baseOptions')
    expect(compiled.code).not.toContain('createComponent')
    expect(compiled.code).toContain('<span>{{ title }}</span>')
    expect(compiled.code).toContain('lang="less"')
    expect(compiled.watchFiles).toEqual([
      path.join(fixtureDir, 'script-ts.mpx'),
      path.join(fixtureDir, 'child.mpx')
    ])
  })

  it('accepts unquoted lang=ts and lang=typescript', () => {
    const source = [
      '<script lang=ts>',
      'import type { PropType } from "@mpxjs/core"',
      'createComponent({',
      '  props: {',
      '    name: String as PropType<string>',
      '  }',
      '})',
      '</script>'
    ].join('\n')
    const compiled = compileMpxFile(source, {
      mode: 'web',
      resourcePath: 'lang-ts.mpx'
    })
    expect(compiled.code).toContain('<script lang="ts">')
    expect(compiled.code).toContain('import type { PropType }')
    expect(compiled.code).toContain('PropType<string>')
    expect(compiled.code).not.toContain('createComponent')

    const typescript = compileMpxFile(source.replace('lang=ts', 'lang="typescript"'), {
      mode: 'web',
      resourcePath: 'lang-typescript.mpx'
    })
    expect(typescript.code).toContain('<script lang="ts">')
  })

  it('rejects targets outside this slice', () => {
    expect(() => compileMpxFile('<template></template>', {
      mode: 'wx' as 'web',
      resourcePath: 'x.mpx'
    })).toThrow(/only "web"/)
    expect(() => compileMpxFile('<template></template>', {
      mode: 'web',
      srcMode: 'ali',
      resourcePath: 'x.mpx'
    })).toThrow(/only "wx"/)
  })
})
