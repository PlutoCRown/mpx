const fs = require('node:fs/promises')
const path = require('node:path')
const { promisify } = require('node:util')
const { execFile } = require('node:child_process')

const run = promisify(execFile)
const root = path.resolve(__dirname, '..')

async function verifyWeb (fixture) {
  const assert = require('node:assert/strict')
  const fs = require('node:fs/promises')
  const path = require('node:path')
  const { createRsbuild } = require('@rsbuild/core')
  const { createBundleRenderer } = require('vue-server-renderer')
  const hash = require('hash-sum')
  const { pluginMpx } = require('./lib')
  const { JSDOM, ResourceLoader } = require(require.resolve('jsdom', { paths: [path.dirname(require.resolve('jest-environment-jsdom'))] }))

  await Promise.all(Object.entries({
    'app.mpx': '<script>import { createApp } from "@mpxjs/core"; createApp({})</script><script type="application/json">{"pages":["./page"],"subPackages":[{"root":"detail","pages":["./index",{"src":"./alternate","path":"index"}]}]}</script>',
    'page.mpx': '<template><view id="fixture-page" class="fixture-style">{{message}}<text id="route">{{route}}</text></view></template><script lang="ts">import { createPage } from "@mpxjs/core"; const message: string = __mpx_mode__ === "web" ? "mpx web fixture" : "wrong target"; const route = require("./detail/alternate?resolve"); createPage({data:{message,route}})</script><style scoped>.fixture-style {width:75rpx; color:red}</style><style src="./external.css"></style>',
    'external.css': '/* @mpx-if (__mpx_mode__ === "web") */\n.web-style {color:black}\n/* @mpx-else */\n.mini-style {color:white}\n/* @mpx-endif */',
    'detail/index.mpx': '<template><view>mpx async fixture</view></template><script>import { createPage } from "@mpxjs/core"; createPage({})</script>',
    'detail/alternate.mpx': '<template><view>mpx alternate route</view></template><script>import { createPage } from "@mpxjs/core"; createPage({})</script>'
  }).map(async ([name, source]) => {
    const file = path.join(fixture, name)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, source)
  }))

  const alias = Object.fromEntries(['vue-router', 'vue-i18n', 'vue-i18n-bridge'].map(name => [name, require.resolve(name)]))
  const build = await createRsbuild({
    cwd: fixture,
    rsbuildConfig: {
      resolve: { alias },
      source: { entry: { index: './app.mpx' } },
      environments: {
        web: { output: { target: 'web', distPath: { root: 'dist/web' } } },
        server: { output: { target: 'node', distPath: { root: 'dist/server' } } }
      },
      plugins: [pluginMpx({ mode: 'web' })]
    }
  })
  const { close } = await build.build()
  try {
    const clientDir = path.resolve(fixture, 'dist/web')
    const serverDir = path.resolve(fixture, 'dist/server')
    const initialHtml = await fs.readFile(path.join(clientDir, 'index.html'), 'utf8')
    const clientManifest = JSON.parse(await fs.readFile(path.join(clientDir, 'vue-ssr-client-manifest.json'), 'utf8'))
    const serverBundle = JSON.parse(await fs.readFile(path.join(serverDir, 'vue-ssr-server-bundle.json'), 'utf8'))
    assert.match(initialHtml, /id="app"/)
    assert.ok(clientManifest.initial.some(file => file.endsWith('.css')))
    const css = await fs.readFile(path.join(clientDir, clientManifest.initial.find(file => file.endsWith('.css'))), 'utf8')
    assert.match(css, /\.fixture-style\._[\da-f]+\{[^}]*width:10vw/)
    assert.match(css, /\.web-style\{/)
    assert.doesNotMatch(css, /\.mini-style\{/)
    assert.ok(clientManifest.async.some(file => file.endsWith('.js')))
    assert.ok(serverBundle.files[serverBundle.entry])
    const renderer = createBundleRenderer(serverBundle, {
      runInNewContext: false,
      basedir: fixture,
      template: '<!doctype html><html><head></head><body><!--vue-ssr-outlet--></body></html>',
      clientManifest
    })
    const rendered = await renderer.renderToString({ url: '/' })
    assert.match(rendered, /mpx web fixture/)
    const asyncRendered = await renderer.renderToString({ url: '/detail/index' })
    assert.match(asyncRendered, /mpx async fixture/)
    assert.ok(clientManifest.async.some(file => asyncRendered.includes(`src="/${file}"`)))
    const alternateRoute = '/detail/index' + hash(path.join(fixture, 'detail/alternate.mpx'))
    assert.ok(rendered.includes(alternateRoute))
    assert.match(await renderer.renderToString({ url: alternateRoute }), /mpx alternate route/)

    class FixtureResources extends ResourceLoader {
      fetch (url) {
        return fs.readFile(path.join(clientDir, new URL(url).pathname))
      }
    }
    const browser = new JSDOM(rendered, {
      url: 'http://localhost/',
      runScripts: 'dangerously',
      resources: new FixtureResources()
    })
    try {
      browser.window.scrollTo = () => {}
      const initial = browser.window.document.getElementById('fixture-page')
      assert.ok(initial)
      await new Promise(resolve => browser.window.addEventListener('load', resolve, { once: true }))
      await new Promise(resolve => browser.window.setTimeout(resolve, 0))
      const hydrated = browser.window.document.getElementById('fixture-page')
      assert.equal(hydrated, initial)
      assert.equal(hydrated.textContent, 'mpx web fixture' + alternateRoute)
      await browser.window.__mpxRouter.push('/detail/index')
      await new Promise(resolve => browser.window.setTimeout(resolve, 0))
      assert.match(browser.window.document.body.textContent, /mpx async fixture/)
    } finally {
      browser.window.close()
    }
  } finally {
    await close()
  }
}

it('renders Vue 2 SSR output and hydrates the matching Rsbuild client in a browser DOM', async () => {
  const fixture = await fs.mkdtemp(path.join(root, 'test/.web-fixture-'))
  try {
    await run(process.execPath, ['-e', `(${verifyWeb.toString()})(process.argv[1]).catch(error => { console.error(error); process.exitCode = 1 })`, fixture], {
      cwd: root,
      env: Object.assign({}, process.env, { NODE_ENV: 'production' })
    })
  } finally {
    await fs.rm(fixture, { force: true, recursive: true })
  }
}, 20000)
