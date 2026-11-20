const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')

const [, , root, workDir, command] = process.argv
const source = path.join(root, 'src')
const dist = path.join(root, 'dist')
const watching = command.startsWith('watch')
const appJson = pages => `<script>App({ value: require('./shared') })</script><json>{pages:${JSON.stringify(pages)},subpackages:[{root:"sub",pages:["./sub"]},{root:"independent",independent:true,pages:["./entry"]}]}</json>`

async function waitFor (condition) {
  const limit = Date.now() + 5000
  while (Date.now() < limit) {
    if (await condition()) return
    await new Promise(resolve => setTimeout(resolve, 40))
  }
  throw new Error('Expected a successful watch rebuild')
}

async function main () {
  await fs.mkdir(path.join(source, 'sub'), { recursive: true })
  await fs.mkdir(path.join(source, 'independent'), { recursive: true })
  await fs.symlink(path.join(workDir, 'node_modules'), path.join(root, 'node_modules'), 'junction')
  await fs.writeFile(path.join(source, 'app.mpx'), appJson(['./index']))
  const index = '<template><wxs module="format">module.exports = {msg: __mpx_wxs__ ? "native" : "js"};</wxs><view class="text-test">{{format.msg}} {{$t("hello")}}</view></template><script setup lang="ts">import type { Props } from "./props"; const value: Props["value"] = "demo"; export interface ViewState { value: string }; defineExpose({ value });</script><style>view { color: red; }</style>'
  const sub = '<template src="./part.wxml"></template><script>Page({ value: require("../shared"), platform: require("./device.js"), process: process.browser, onLoad: () => require.async("./async.js?root=sub"), ordinaryImport: () => import("./ordinary.js") })</script>'
  await fs.writeFile(path.join(source, 'index.mpx'), index)
  await fs.writeFile(path.join(source, 'sub/sub.mpx'), command === 'watch-production' ? sub.replace('platform: ', 'route: require("../index?resolve"), platform: ') : sub)
  await fs.writeFile(path.join(source, 'sub/part.wxml'), '<view>sub</view>')
  await fs.writeFile(path.join(source, 'shared.js'), 'module.exports = "shared"')
  await fs.writeFile(path.join(source, 'props.ts'), 'export interface Props { value: string }')
  await fs.writeFile(path.join(source, 'sub/device.wx.js'), 'module.exports = "wx"')
  await fs.writeFile(path.join(source, 'independent/entry.mpx'), '<template><view>independent</view></template><script>Page({ value: require("../shared") })</script>')
  await fs.writeFile(path.join(source, 'sub/async.js'), 'module.exports = "async"')
  await fs.writeFile(path.join(source, 'sub/ordinary.js'), 'export default "ordinary"')
  await fs.writeFile(path.join(source, 'plugin.json'), '{"main":"./plugin-main.js"}')
  await fs.writeFile(path.join(source, 'plugin-main.js'), 'module.exports = { value: "public" }')
  await fs.writeFile(path.join(root, 'tsconfig.json'), '{}')

  const { createRsbuild } = require('@rsbuild/core')
  const { pluginMpx } = require('../lib')
  const UnoCSS = require('../../unocss-plugin').default
  const rsbuild = await createRsbuild({
    cwd: root,
    rsbuildConfig: {
      mode: command === 'watch' ? 'development' : 'production',
      plugins: [pluginMpx({ i18n: { locale: 'en', messages: { en: { hello: 'Hello' } } } })],
      source: { entry: { app: './src/app.mpx', plugin: './src/plugin.json?isPlugin' } },
      output: { target: 'node', sourceMap: { js: 'source-map' } },
      tools: { rspack: { plugins: [new UnoCSS({ root, config: { rules: [['text-test', { color: 'blue' }]] } })] } },
      performance: { printFileSize: false }
    }
  })
  const result = await rsbuild.build({ watch: watching })
  try {
    const read = name => fs.readFile(path.join(dist, name), 'utf8')
    const readPending = name => read(name).catch(error => {
      if (error.code === 'ENOENT') return ''
      throw error
    })
    await waitFor(async () => {
      const assets = await Promise.all(['index.js', 'app.json', 'index.wxss', 'styles/uno.wxss'].map(readPending))
      return assets.every(Boolean)
    })
    assert.deepEqual(JSON.parse(await read('app.json')).pages, ['index'])
    assert.match(await read('index.wxss'), /color:\s*red/)
    assert.match(await read('index.wxss'), /@import "\.\/styles\/uno\.wxss"/)
    assert.match(await read('styles/uno.wxss'), /\.text-test\s*\{/)
    if (command === 'watch-production') {
      const indexFile = path.join(source, 'index.mpx')
      const subFile = await read('sub/sub.js')
      const asyncFile = /\brequire\.async\("(\.\/mpx-async\/[^"]+)"\)/.exec(subFile)[1]
      assert.match(subFile, /"\/index"/)
      await fs.writeFile(indexFile, index.replace('class="text-test"', 'class="text-test" data-test="edited-template"'))
      await waitFor(async () => (await readPending('index.wxml')).includes('edited-template') &&
        (await readPending('index.js.map')).includes('edited-template'))
      assert.match(await read('styles/uno.wxss'), /\.text-test\b/)
      assert.ok(await read(path.posix.join('sub', asyncFile)))

      await fs.writeFile(path.join(source, 'sub/part.wx.wxml'), '<view>platform candidate</view>')
      await waitFor(async () => (await readPending('sub/sub.wxml')).includes('platform candidate'))

      await fs.writeFile(path.join(source, 'app.mpx'), appJson([{ src: './index', path: 'renamed' }]))
      await waitFor(async () => (await readPending('sub/sub.js')).includes('"/renamed"') &&
        JSON.parse((await readPending('app.json')) || '{}').pages?.[0] === 'renamed')
      assert.ok(await read(path.posix.join('sub', asyncFile)))
    } else if (command === 'watch') {
      await fs.writeFile(path.join(source, 'index.mpx'), '<template><view>changed page</view></template><script>Component({})</script>')
      await waitFor(async () => (await readPending('index.wxml')).includes('changed page'))
      await fs.writeFile(path.join(source, 'replacement.mpx'), '<template><view>replacement page</view></template><script>Component({})</script>')
      await fs.writeFile(path.join(source, 'app.mpx'), appJson(['./replacement']))
      await waitFor(async () => JSON.parse((await readPending('app.json')) || '{}').pages?.[0] === 'replacement')
      await waitFor(async () => (await readPending('replacement.wxml')).includes('replacement page'))
      await waitFor(async () => (await fs.stat(path.join(dist, 'index.js')).catch(() => null)) === null)
      assert.match(await read('replacement.wxml'), /replacement page/)
    } else {
      const template = await read('index.wxml')
      const wxs = /<wxs\b(?=[^>]*\bmodule="format")[^>]*\bsrc="([^"]+)"/.exec(template)
      assert.ok(wxs)
      const wxsModule = { exports: {} }
      vm.runInNewContext(await read(wxs[1]), { module: wxsModule })
      assert.equal(wxsModule.exports.msg, 'native')
      const i18nWxs = /<wxs\b(?=[^>]*\bmodule="_i_")[^>]*\bsrc="([^"]+)"/.exec(template)
      assert.ok(i18nWxs)
      const i18nModule = { exports: {} }
      vm.runInNewContext(await read(i18nWxs[1]), { module: i18nModule, getRegExp: (pattern, flags) => new RegExp(pattern, flags) })
      assert.equal(i18nModule.exports.t(null, 'en', 'en', 'hello'), 'Hello')
      const file = path.join(dist, 'sub/sub.js')
      const code = await read('sub/sub.js')
      assert.match(await read('app.js'), /require\("\.\/_mpx\/shared\.js"\)/)
      assert.match(code, /require\("\.\.\/_mpx\/shared\.js"\)/)
      assert.match(code, /\brequire\.async\("\.\/mpx-async\//)
      assert.doesNotMatch(code, /__MPX_(?:NATIVE_REQUIRE|ASYNC)/)
      const nativeRequire = createRequire(file)
      nativeRequire.async = async filename => nativeRequire(filename)
      const module = { exports: {} }
      let options
      const scope = {
        require: nativeRequire,
        module,
        exports: module.exports,
        Component: () => {},
        Page: value => { options = value }
      }
      vm.runInNewContext(code, scope)
      assert.equal(options.value, 'shared')
      assert.deepEqual(JSON.parse(await read('plugin.json')), { main: 'plugin-main.js' })
      assert.deepEqual(createRequire(path.join(dist, 'app.js'))('./plugin-main.js'), { value: 'public' })
      assert.equal(options.platform, 'wx')
      assert.equal(options.process, true)
      assert.equal(await options.onLoad(), 'async')
      assert.equal((await options.ordinaryImport()).default, 'ordinary')
      const independentFile = 'independent/entry.js'
      const independentCode = await read(independentFile)
      assert.match(independentCode, /require\("\.\/_mpx\/runtime\.js"\)/)
      assert.doesNotMatch(independentCode, /require\("\.\.\/_mpx\//)
      const independentModule = { exports: {} }
      vm.runInNewContext(independentCode, Object.assign({}, scope, {
        require: createRequire(path.join(dist, independentFile)),
        module: independentModule,
        exports: independentModule.exports
      }))
      assert.equal(options.value, 'shared')
    }
  } finally {
    await result.close()
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
