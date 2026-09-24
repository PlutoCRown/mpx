import * as fs from 'fs'
import * as path from 'path'
import { compileMpxFile, compileReactTemplate, compileToReact } from '../src'

const fixtureDir = path.join(__dirname, '../fixtures')

function readFixture (name: string): string {
  return fs.readFileSync(path.join(fixtureDir, name), 'utf8')
}

describe('compileToReact', () => {
  const source = readFixture('page.mpx')
  const result = compileMpxFile(source, {
    mode: 'ios',
    srcMode: 'wx',
    resourcePath: path.join(fixtureDir, 'page.mpx'),
    context: fixtureDir
  })

  it('emits an RN JS module instead of a Vue SFC or webpack runtime glue', () => {
    expect(result.code).toContain('/* @mpxjs/compiler mode=ios */')
    expect(result.code).toContain('/* template */')
    expect(result.code).toContain('/* styles */')
    expect(result.code).toContain('/* json */')
    expect(result.code).toContain('/* script */')
    expect(result.code).toContain('global.currentInject.render = function (createElement, getComponent)')
    expect(result.code).toContain('export default global.__mpxOptionsMap[')
    expect(result.code).not.toContain('<template>')
    expect(result.code).not.toContain('webpack/lib')
    expect(result.code).not.toContain('Compilation.prototype')
    expect(result.map).toBeUndefined()
  })

  it('rewrites the page template through the react native render function', () => {
    expect(result.code).toContain('getComponent("mpx-')
    expect(result.code).toContain('onTap')
    expect(result.code).toContain('visible')
    expect(result.code).toContain('hidden')
    expect(result.code).not.toContain('wx-only-template')
    expect(result.code).not.toContain('wx:if')
    expect(result.code).not.toContain('<view')
  })

  it('inlines createPage and requires usingComponents as normal modules', () => {
    expect(result.code).toContain('createPage({')
    expect(result.code).toContain("title: 'MPX Web'")
    expect(result.code).toContain('import { getComponent, getAsyncSuspense } from "@mpxjs/webpack-plugin/lib/runtime/optionProcessorReact"')
    expect(result.code).toContain('getComponent(require(')
    expect(result.code).toContain('child.mpx')
    expect(result.code).toContain('isComponent=true')
    expect(result.code).toContain('global.currentInject.pageConfig')
    expect(result.code).toContain('"navigationBarTitleText":"Hello"')
    expect(result.code).not.toContain('usingComponents')
    expect(result.code).toContain('global.currentResource')
    expect(result.watchFiles).toContain(path.join(fixtureDir, 'page.mpx'))
    expect(result.watchFiles).toContain(path.join(fixtureDir, 'child.mpx'))
  })

  it('turns matched styles into an RN class map and drops other modes', () => {
    expect(result.code).toContain('__getClassStyle')
    expect(result.code).toContain('global.__GCC')
    expect(result.code).toContain('page')
    expect(result.code).not.toContain('.web-only')
    expect(result.code).not.toContain('.wx-only')
    expect(result.code).not.toContain('wx-only')
  })

  it('compiles the child component and a production build', () => {
    const child = compileToReact(readFixture('child.mpx'), {
      mode: 'android',
      resourcePath: path.join(fixtureDir, 'child.mpx'),
      outputPath: 'components/child/index',
      isProduction: true
    })
    expect(child.code).toContain('/* @mpxjs/compiler mode=android */')
    expect(child.code).toContain('createComponent({')
    expect(child.code).toContain("label: 'nested'")
    expect(child.code).toContain('global.currentInject.componentPath = \'/\' + "components/child/index"')
    expect(child.code).not.toContain('global.currentResource')
  })

  it('converts rpx, drops ios-unsupported properties, and reports style diagnostics', () => {
    const styled = compileToReact([
      '<template><view class="title">hi</view></template>',
      '<style>',
      '.title { width: 32rpx; vertical-align: middle; }',
      'view { color: red; }',
      '@font-face { font-family: Demo; src: url(demo.ttf); }',
      '</style>',
      '<script>createPage({ data: { } })</script>'
    ].join('\n'), {
      mode: 'ios',
      resourcePath: path.join(fixtureDir, 'styled.mpx')
    })
    expect(styled.code).toContain("_f(32, 'rpx')")
    expect(styled.code).not.toContain('verticalAlign')
    expect(styled.errors && styled.errors.some((message) => message.indexOf('Only single class selector') >= 0)).toBe(true)
    expect(styled.warnings && styled.warnings.some((message) => message.indexOf('@font-face') >= 0)).toBe(true)

    const android = compileToReact([
      '<template><view class="title">hi</view></template>',
      '<style>.title { vertical-align: middle; }</style>',
      '<script>createPage({})</script>'
    ].join('\n'), {
      mode: 'android',
      resourcePath: path.join(fixtureDir, 'styled-android.mpx')
    })
    expect(android.code).toContain('verticalAlign')
  })

  it('emits the AppRegistry shell and the app body with sync and async pages', () => {
    const app = [
      '<script>',
      'import { createApp } from "@mpxjs/core"',
      'createApp({})',
      '</script>',
      '<script type="application/json">',
      '{',
      '  "pages": ["pages/index"],',
      '  "subPackages": [{ "root": "packageA", "pages": ["pages/extra"] }],',
      '  "usingComponents": { "child": "./child?root=sub", "hold": "./hold" },',
      '  "componentPlaceholder": { "child": "hold" },',
      '  "networkTimeout": { "request": 1000 }',
      '}',
      '</script>'
    ].join('\n')
    const shell = compileMpxFile(app, {
      mode: 'harmony',
      resourcePath: path.join(fixtureDir, 'app.mpx'),
      context: fixtureDir,
      rnConfig: { projectName: 'demo' }
    })
    expect(shell.code).toContain("import { AppRegistry } from 'react-native'")
    expect(shell.code).toContain('require("./app.mpx?mpxRnApp=1")')
    expect(shell.code).toContain('AppRegistry.registerComponent("demo", () => app)')
    expect(shell.code).not.toContain('createApp')

    const body = compileToReact(app, {
      mode: 'harmony',
      resourcePath: path.join(fixtureDir, 'app.mpx'),
      context: fixtureDir,
      ctorType: 'app',
      isApp: true,
      rnConfig: { supportSubpackage: true, projectName: 'demo' }
    })
    expect(body.code).toContain('global.__mpxOptionsMap')
    expect(body.code).toContain('mpx-app-scope')
    expect(body.code).toContain('./pages/index.mpx')
    expect(body.code).toContain('./packageA/pages/extra.mpx')
    expect(body.code).toContain('isPage=true')
    expect(body.code).toContain('/* webpackChunkName: "packageA/index" */')
    expect(body.code).toContain('/* webpackChunkName: "sub/index" */')
    expect(body.code).toContain('getAsyncSuspense')
    expect(body.code).toContain('getFallback')
    expect(body.code).toContain('global.__networkTimeout = {"request":1000}')
    expect(body.code).not.toContain('webpack/lib')
  })

  it('compiles an imported template module', () => {
    const compiled = compileReactTemplate('<template name="card"><view>hi</view></template>', {
      mode: 'ios',
      resourcePath: path.join(fixtureDir, 'card.wxml')
    })
    expect(compiled.code).toContain('module.exports = localTemplates')
    expect(compiled.code).toContain('"card"')
    expect(compiled.code).toContain('getBuiltInBaseComponent')
    expect(compiled.code).not.toContain('webpack/lib')
  })

  it('rejects targets outside web and react native', () => {
    expect(() => compileMpxFile('<template></template>', {
      mode: 'wx' as 'web',
      resourcePath: 'x.mpx'
    })).toThrow(/supported: "web", "ios", "android", "harmony"/)
    expect(() => compileToReact('<template></template>', {
      mode: 'ios',
      srcMode: 'ali',
      resourcePath: 'x.mpx'
    })).toThrow(/only "wx"/)
  })
})
