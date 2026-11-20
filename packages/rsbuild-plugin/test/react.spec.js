const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')

const run = promisify(execFile)
const fixtureScript = `
  const { createRsbuild } = require('@rsbuild/core')
  const { pluginMpx } = require('./lib')
  const [cwd, mode, entry, config] = process.argv.slice(1)
  async function main () {
    const instance = await createRsbuild({
      cwd,
      rsbuildConfig: {
        logLevel: 'silent',
        source: { entry: { app: entry } },
        output: { minify: false },
        plugins: [pluginMpx({ mode, rnConfig: JSON.parse(config) })]
      }
    })
    const build = await instance.build()
    try {
      const { warnings } = build.stats.toJson({ all: false, warnings: true })
      if (warnings.length) throw new Error(JSON.stringify(warnings))
    } finally {
      await build.close()
    }
  }
  main().catch(error => {
    console.error(error)
    process.exitCode = 1
  })
`

async function buildFixture (mode, entry, files, verify, rnConfig = {}) {
  const root = fs.mkdtempSync(path.join(__dirname, '.rn-'))
  try {
    Object.entries(files).forEach(([name, source]) => {
      const file = path.join(root, name)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, source)
    })
    await run(process.execPath, ['-e', fixtureScript, root, mode, entry, JSON.stringify(rnConfig)], { cwd: path.join(__dirname, '..') })
    const readOutput = name => fs.readFileSync(path.join(root, 'dist', name), 'utf8')
    await verify(readOutput)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

test.each(['ios', 'android', 'harmony'])('compiles application, page and scoped RN styles for %s', async mode => {
  await buildFixture(mode, './app.mpx', {
    'app.mpx': `<script lang="ts">
      import { createApp } from '@mpxjs/core'
      import platform from './platform.js'
      import nativeRegistry from 'react-native/Libraries/TurboModule/TurboModuleRegistry'
      const current: string = platform
      global.fixturePlatform = current
      global.nativeRegistry = nativeRegistry
      createApp({})
    </script>
    <script type="application/json">{"pages": ["./page.mpx"]}</script>`,
    'page.mpx': `<template><view class="fixture-style"><text>{{label}}</text></view></template>
    <style scoped>
      .fixture-style { width: 10px; }
      /* @mpx-if (__mpx_mode__ === 'wx') */
      .fixture-style { animation: wx-animation 2s; }
      /* @mpx-endif */
    </style>
    <style lang="stylus">@require "./theme.styl"</style>
    <script>import { createPage } from '@mpxjs/core'; createPage({ data: { label: 'ready' } })</script>
    <script type="application/json">{"navigationBarTitleText": "fixture"}</script>`,
    'theme.styl': '@require "./nested-theme.styl"',
    'nested-theme.styl': `/* @mpx-if (__mpx_mode__ === 'wx') */
.fixture-style
  animation wx-stylus-animation 2s
/* @mpx-else */
.fixture-style
  height 12px
/* @mpx-endif */`,
    'platform.js': 'export default "generic-fallback"',
    'platform.ios.js': 'export default "rn-platform-fallback"'
  }, (readOutput) => {
    const script = readOutput('app.js')
    expect(script).toContain('"page":{"navigationBarTitleText":"fixture"}')
    expect(script).toContain('rn-platform-fallback')
    expect(script).toContain('fixture-style')
    expect(script).toMatch(/width\s*:\s*10/)
    expect(script).not.toContain('wx-animation')
    expect(script).not.toContain('wx-stylus-animation')
    expect(script).toMatch(/height['"]?\s*:\s*12/)
    expect(script).toContain('mpx-app-scope')
    expect(script).toMatch(/require\(['"]react-native['"]\)/)
    expect(script).toContain('require("react-native/Libraries/TurboModule/TurboModuleRegistry")')
    expect(script).toMatch(/module\.exports = __webpack_exports__\[['"]default['"]\]/)
  })
})

test('loads native chunks through the host instead of a browser transport', async () => {
  await buildFixture('ios', './app.js', {
    'app.js': 'module.exports = function () { return require.async("./feature?root=feature") }',
    'feature.js': 'export const value = 123'
  }, async (readOutput) => {
    const calls = []
    const context = vm.createContext({ module: { exports: {} }, console })
    context.global = context
    context.__mpx = {
      config: {
        rnConfig: {
          async loadChunkAsync (request) {
            calls.push(request)
            vm.runInContext(readOutput('feature/index.js'), context)
            return 'load'
          }
        }
      }
    }
    vm.runInContext(readOutput('app.js'), context)

    expect(await context.module.exports()).toMatchObject({ value: 123 })
    expect(calls).toEqual([{ package: 'feature', url: '/feature/index.js' }])
  })
})

test.each([true, false])('preserves RN shared chunk placement when asyncCommonSubpackage is %s', async asyncCommonSubpackage => {
  await buildFixture('ios', './app.js', {
    'app.js': `module.exports = function () {
      return Promise.all([require.async('./alpha?root=alpha'), require.async('./beta?root=beta')])
    }`,
    'alpha.js': 'module.exports = require("./shared")',
    'beta.js': 'module.exports = require("./shared")',
    'shared.js': 'module.exports = { mark: "shared-native-fixture" }'
  }, readOutput => {
    const sharedBundle = asyncCommonSubpackage ? 'async-common/index.js' : 'app.js'
    expect(readOutput(sharedBundle)).toContain('shared-native-fixture')
    expect(readOutput('alpha/index.js')).not.toContain('shared-native-fixture')
    expect(readOutput('beta/index.js')).not.toContain('shared-native-fixture')
  }, { asyncCommonSubpackage })
})
