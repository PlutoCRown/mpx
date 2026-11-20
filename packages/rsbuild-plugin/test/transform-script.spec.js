const vm = require('node:vm')
const transformScript = require('../lib/transform-script')

test('resolves paths used by static imports and requires', () => {
  const resolvePath = jest.fn().mockReturnValue('/subpages/map/index')
  const { code } = transformScript(`
    export const route = [page, require('./map?resolve'), __mpx_resolve_path__('./map?resolve')]
    import page from './map?resolve'
  `, { resolvePath })

  expect(resolvePath.mock.calls).toEqual([['./map'], ['./map'], ['./map']])
  expect(code).toMatch(/^const page = "\/subpages\/map\/index";/)
  expect(code).toContain('export const route = [page, "/subpages/map/index", "/subpages/map/index"]')
})

test('uses the native entry mapped by the adapter and retains the other request queries', () => {
  const requireAsync = jest.fn().mockReturnValue('require.async("./map/index.js")')
  const { code } = transformScript('module.exports = require.async("./map?root=submap&flag=on")', {
    filename: 'app.js',
    mode: 'wx',
    requireAsync
  })

  expect(requireAsync).toHaveBeenCalledWith('./map?flag=on', { packageRoot: 'submap', mode: 'wx', filename: 'app.js' })
  expect(code).toContain('require.async("./map/index.js")')
})

test('recognizes async require through TypeScript runtime casts and non-null assertions', () => {
  const requireAsync = jest.fn().mockReturnValue('require.async("./map/index.js")')
  const { code } = transformScript(`
    const a = (require as any).async('./map?root=map')
    const b = (<any>require).async!('./map?root=map')
    const c = require!.async('./map?root=map')
    function local(require: any) { return (require as any).async('./map?root=map') }
  `, { filename: 'app.ts', requireAsync })

  expect(requireAsync).toHaveBeenCalledTimes(3)
  expect(code.match(/require\.async\("\.\/map\/index\.js"\)/g)).toHaveLength(3)
  expect(code).toContain("(require as any).async('./map?root=map')")
})

test('uses the target chunk or the existing synchronous fallback after RN package remapping', async () => {
  const source = 'module.exports = require.async("./session?root=map")'
  const chunk = transformScript(source, { mode: 'web' })
  const sync = transformScript(source, {
    mode: 'ios',
    rnConfig: { transSubpackageRules: [{ from: 'map', to: '' }] }
  })
  const module = { exports: {} }
  const require = jest.fn().mockReturnValue({ ready: true })

  expect(chunk.code).toContain('import(/* webpackChunkName: "map/index" */"./session")')
  vm.runInNewContext(sync.code, { module, require })
  expect(require).toHaveBeenCalledWith('./session')
  await expect(module.exports).resolves.toEqual({ ready: true })
})

test('uses compile constants before resolving requests in live branches', () => {
  const resolvePath = jest.fn().mockReturnValue('/wx/app')
  const { code, map } = transformScript(`
    type Platform = typeof __mpx_mode__
    const data: string = __mpx_mode__ === 'wx' ? require('./page?resolve') : require('./nonexistent?resolve')
    export const result = [data, __mpx_wxs__, process.env.APP_TAG]
  `, {
    filename: 'app.ts',
    defs: { 'process.env.APP_TAG': 'canary' },
    wxs: true,
    resolvePath
  })

  expect(resolvePath.mock.calls).toEqual([['./page']])
  expect(code).toContain('type Platform = typeof __mpx_mode__')
  expect(code).toContain('const data: string = "wx" === \'wx\' ? "/wx/app"')
  expect(code).toContain('[data, true, "canary"]')
  expect(map.sources).toEqual(['app.ts'])
  expect(map.mappings).not.toBe('')
})

test('keeps scopes intact while proxying eligible native calls', () => {
  const rewriteRequest = jest.fn((request) => `${request}?packageRoot=sub`)
  const { code } = transformScript(`
    import { api } from './dep'
    export function custom(wx, Page, require, __mpx_mode__, process) {
      return [wx, Page({}), require.async('./x?root=map'), __mpx_mode__, process.env.APP_TAG]
    }
    Page({ data: { wx }, api })
  `, { srcMode: 'wx', mode: 'ali', defs: { 'process.env.APP_TAG': 'canary' }, rewriteRequest })

  expect(rewriteRequest.mock.calls).toEqual([['./dep', 'import']])
  expect(code).toContain('require.async(\'./x?root=map\')')
  expect(code).toContain('return [wx, Page({}), require.async(\'./x?root=map\'), __mpx_mode__, process.env.APP_TAG]')
  expect(code).toContain('_createFactory("Page")({')
  expect(code).toContain('wx: _mpx')
})

test('keeps the original CommonJS module type when its local require is shadowed', () => {
  const { code } = transformScript(`
    const require = () => 'local'
    module.exports = [require(), wx.request()]
  `, { srcMode: 'wx', mode: 'ali' })
  const module = { exports: {}, require: jest.fn().mockReturnValue({ request: () => 'proxy' }) }

  vm.runInNewContext(code, { module })

  expect(module.require).toHaveBeenCalledWith('@mpxjs/core/src/runtime/mpx')
  expect(module.exports).toEqual(['local', 'proxy'])
})

test('keeps native globals in workspace-linked Mpx runtime modules', () => {
  const { code } = transformScript('export const globalApi = wx', {
    filename: require.resolve('@mpxjs/utils/src/env.js'),
    srcMode: 'wx',
    mode: 'web'
  })

  expect(code).toBe('export const globalApi = wx;')
})

test('preserves retry behavior when a native async chunk fails to load', async () => {
  const { code } = transformScript('module.exports = require.async("./session?root=map")', {
    retryRequireAsync: true,
    requireAsync: () => 'require.async("./map/session.js")'
  })
  const module = { exports: {} }
  const require = { async: jest.fn().mockRejectedValueOnce(new Error()).mockResolvedValue('ready') }

  vm.runInNewContext(code, { require, module })

  await expect(module.exports).resolves.toBe('ready')
  expect(require.async.mock.calls).toEqual([['./map/session.js'], ['./map/session.js']])
})
