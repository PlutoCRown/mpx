import * as path from 'path'
import { compileMpxFile } from '../src'

const fixtureDir = path.join(__dirname, '../fixtures')
const resourcePath = path.join(fixtureDir, 'json-js.mpx')

function jsonSource (body: string): string {
  return [
    '<template><view>hi</view></template>',
    '<script>',
    'createPage({ data: { title: "t" } })',
    '</script>',
    '<script name="json">',
    body,
    '</script>'
  ].join('\n')
}

describe('script name=json', () => {
  it('evaluates module.exports for wx and web', () => {
    const source = jsonSource([
      'const pages = ["./pages/index"]',
      'if (__mpx_env__ === "someEnv" && __mpx_mode__ === "wx") pages.push("./pages/someEnv")',
      'module.exports = {',
      '  navigationBarTitleText: __mpx_mode__ === "wx" ? "WX" : "WEB",',
      '  pages: pages,',
      '  usingComponents: { child: "./child" }',
      '}'
    ].join('\n'))

    const wx = compileMpxFile(source, {
      mode: 'wx',
      env: 'someEnv',
      resourcePath
    })
    const wxFiles = wx.files
    if (!wxFiles) throw new Error('expected wx files')
    expect(JSON.parse(wxFiles.json)).toEqual({
      navigationBarTitleText: 'WX',
      pages: ['./pages/index', './pages/someEnv'],
      usingComponents: { child: './child' }
    })
    expect(wx.watchFiles).toEqual([
      resourcePath,
      path.join(fixtureDir, 'child.mpx')
    ])

    const web = compileMpxFile(source, {
      mode: 'web',
      env: 'someEnv',
      resourcePath,
      context: fixtureDir
    })
    expect(web.code).toContain('"navigationBarTitleText":"WEB"')
    expect(web.code).toContain('"./pages/index"')
    expect(web.code).not.toContain('someEnv')
    expect(web.code).toContain('import __mpx_child_0 from "./child.mpx"')
    expect(web.watchFiles).toEqual([
      resourcePath,
      path.join(fixtureDir, 'child.mpx')
    ])
  })

  it('loads a relative json require and keeps caller defs', () => {
    const source = jsonSource([
      'const part = require("./json-part")',
      'module.exports = {',
      '  navigationBarTitleText: part.navigationBarTitleText,',
      '  mode: __mpx_mode__,',
      '  flag: CUSTOM_FLAG',
      '}'
    ].join('\n'))
    const wx = compileMpxFile(source, {
      mode: 'wx',
      resourcePath,
      defs: { CUSTOM_FLAG: 'on', __mpx_mode__: 'ali' }
    })
    const files = wx.files
    if (!files) throw new Error('expected wx files')
    expect(JSON.parse(files.json)).toEqual({
      navigationBarTitleText: 'FromPart',
      mode: 'wx',
      flag: 'on'
    })
    expect(wx.watchFiles).toEqual([
      resourcePath,
      path.join(fixtureDir, 'json-part.js')
    ])
  })

  it('accepts object spread inside the json script', () => {
    const source = jsonSource([
      'const part = require("./json-part")',
      'module.exports = { ...part, extra: true }'
    ].join('\n'))
    const wx = compileMpxFile(source, {
      mode: 'wx',
      resourcePath
    })
    const files = wx.files
    if (!files) throw new Error('expected wx files')
    expect(JSON.parse(files.json)).toEqual({
      navigationBarTitleText: 'FromPart',
      extra: true
    })
  })

  it('still parses application/json as JSON text', () => {
    const source = [
      '<script type="application/json">',
      '{ "navigationBarTitleText": "Plain" }',
      '</script>'
    ].join('\n')
    const wx = compileMpxFile(source, { mode: 'wx', resourcePath })
    const files = wx.files
    if (!files) throw new Error('expected wx files')
    expect(JSON.parse(files.json)).toEqual({ navigationBarTitleText: 'Plain' })

    expect(() => compileMpxFile([
      '<script type="application/json">',
      'module.exports = { a: 1 }',
      '</script>'
    ].join('\n'), { mode: 'wx', resourcePath })).toThrow(/not valid JSON|Unexpected token/)
  })

  it('reports alias requires without resolving them', () => {
    const source = jsonSource('const part = require("#/config")\nmodule.exports = part\n')
    expect(() => compileMpxFile(source, {
      mode: 'wx',
      resourcePath
    })).toThrow(/alias/i)
  })
})
