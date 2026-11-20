const vm = require('node:vm')
const transformNativeScript = require('../lib/transform-script-native')

test('rewrites native async and resolve calls while retaining the source and mapping', async () => {
  const source = 'const 标签 = __mpx_mode__; module.exports=[标签, (require).async("./async?root=map&flag=on"), require("./page?resolve")]'
  const requireAsync = jest.fn().mockReturnValue('require.async("./map/async.js")')
  const resolvePath = jest.fn().mockReturnValue('/map/page')
  const { code, map } = await transformNativeScript(source, { filename: 'entry.js', requireAsync, resolvePath })

  expect(code).toContain('module.exports=[标签, require.async("./map/async.js"), "/map/page"]')
  expect(requireAsync).toHaveBeenCalledWith('./async?flag=on', { packageRoot: 'map', mode: 'wx', filename: 'entry.js' })
  expect(resolvePath).toHaveBeenCalledWith('./page')
  expect(map.sourcesContent).toEqual([source])
  const module = { exports: {} }
  vm.runInNewContext(code, { module, require: { async: value => value } })
  expect(module.exports).toEqual(['wx', './map/async.js', '/map/page'])
})

test('rewrites only value imports and composes the input source map', async () => {
  const source = 'import type { Record } from "./schema";\nexport const env = process.env.APP_TAG;\nimport { x } from "./shared";'
  const rewriteRequest = jest.fn(request => request + '?mpxPackage=map')
  const { code, map } = await transformNativeScript(source, {
    filename: 'entry.ts',
    defs: { 'process.env.APP_TAG': 'test' },
    rewriteRequest,
    inputSourceMap: {
      version: 3,
      sources: ['entry.mpx'],
      names: [],
      mappings: 'AACA;AACA;AACA',
      sourcesContent: ['<script>\n' + source + '\n</script>']
    }
  })
  expect(code).toContain('from "./schema"')
  expect(code).toContain('from "./shared?mpxPackage=map"')
  expect(code).toContain('env = ("test")')
  expect(rewriteRequest.mock.calls).toEqual([['./shared', 'import']])
  expect(map.sources).toEqual(['entry.mpx'])
  expect(map.sourcesContent[0]).toContain('<script>')
})

test('falls back before registering async entries in shadowed or dead branches', async () => {
  const requireAsync = jest.fn().mockReturnValue('require.async("./map/async.js")')
  const source = [
    'function shadow(require) { return require.async("./local?root=map") }',
    'if (__mpx_mode__ === "ali") require.async("./missing?root=map");',
    'require.async("./real?root=map");'
  ].join('\n')
  await transformNativeScript(source, { filename: 'entry.js', requireAsync })
  expect(requireAsync.mock.calls).toEqual([['./real', { filename: 'entry.js', mode: 'wx', packageRoot: 'map' }]])
})
