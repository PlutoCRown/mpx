const fs = require('fs').promises
const os = require('os')
const path = require('path')
const { discoverEntries } = require('../lib/entries')

let context

beforeEach(async () => {
  context = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mpx-rsbuild-entries-')))
})

afterEach(async () => {
  await fs.rm(context, { force: true, recursive: true })
})

async function write (files) {
  await Promise.all(Object.entries(files).map(async ([name, contents]) => {
    const file = path.join(context, name)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, contents)
  }))
}

function configure (json) {
  return `<script type="application/json">${JSON.stringify(json)}</script>`
}

it('evaluates JSONJS and watches conditional page candidates, external JSON and package configuration', async () => {
  await write({
    'src/app.mpx': '<script name="json" src="./app.json.js"></script>',
    'src/app.json.js': 'module.exports = { pages: require("./pages.js"), packages: ["./sub/app.mpx?root=detail"] }',
    'src/pages.js': 'module.exports = ENABLE_PAGE ? [{ src: "./pages/index", path: "home" }] : []',
    'src/pages/index.wx.mpx': configure({ navigationBarTitleText: 'default' }),
    'src/sub/app.mpx': configure({ pages: ['./page'] }),
    'src/sub/page.mpx': configure({})
  })
  const options = { context, mode: 'wx', env: 'test', defs: { ENABLE_PAGE: true } }
  const build = () => discoverEntries({ app: './src/app.mpx' }, options)
  const initial = await build()
  const app = initial.entries.get('app')
  expect(app.json).toEqual({ pages: ['home'], subPackages: [{ root: 'detail', pages: ['page'] }] })
  expect(initial.entries.get('home').resourcePath).toBe(path.join(context, 'src/pages/index.wx.mpx'))
  expect(initial.findEntry(path.join(context, 'src/pages/index.wx.mpx'), '', 'page').name).toBe('home')
  expect([...initial.fileDependencies]).toEqual(expect.arrayContaining(['src/app.json.js', 'src/pages.js', 'src/sub/app.mpx'].map(name => path.join(context, name))))
  expect(initial.missingDependencies.has(path.join(context, 'src/pages/index.wx.test.mpx'))).toBe(true)

  await write({ 'src/pages/index.wx.test.mpx': configure({ navigationBarTitleText: 'specific' }) })
  const updated = await build()
  expect(updated.entries.get('home').json.navigationBarTitleText).toBe('specific')
  expect(updated.entries.get('home').resourcePath).toBe(path.join(context, 'src/pages/index.wx.test.mpx'))
})

it('reuses the main-package component from an ordinary package and isolates the independent package', async () => {
  await write({
    'app.mpx': configure({
      pages: ['./home'],
      subPackages: [{ root: 'more', pages: ['./page'] }, { root: 'isolated', pages: ['./page'], independent: './init.js' }]
    }),
    'home.mpx': configure({ usingComponents: { card: '#shared/card' } }),
    'more/page.mpx': configure({ usingComponents: { card: '#shared/card' } }),
    'isolated/page.mpx': configure({ usingComponents: { card: '#shared/card' } }),
    'isolated/init.js': 'module.exports = {}',
    'shared/card.mpx': configure({ usingComponents: { inner: './inner' } }),
    'shared/inner.mpx': configure({ usingComponents: { card: './card' } })
  })
  const graph = await discoverEntries({ app: './app.mpx' }, {
    context,
    pathHashMode: 'relative',
    resolve: { alias: { '#shared': path.join(context, 'shared') } }
  })
  const mainPage = graph.entries.get('home')
  const morePage = graph.entries.get('more/page')
  const isolatedPage = graph.entries.get('isolated/page')
  const mainCardPath = mainPage.json.usingComponents.card
  expect(morePage.json.usingComponents.card).toBe(mainCardPath)
  expect(isolatedPage.json.usingComponents.card).toBe('/isolated' + mainCardPath)
  const isolatedCard = graph.entries.get(isolatedPage.json.usingComponents.card.slice(1))
  const isolatedInner = graph.entries.get(isolatedCard.json.usingComponents.inner.slice(1))
  expect(isolatedInner.json.usingComponents.card).toBe(isolatedPage.json.usingComponents.card)
  expect(isolatedCard.independent).toBe(true)
  expect(graph.independentPackages.get('isolated')).toBe(path.join(context, 'isolated/init.js'))
  expect(graph.entries.get('app').json.subPackages[1]).toEqual({ root: 'isolated', pages: ['page'], independent: true })
})

it('resolves a native npm component from its miniprogram distribution and collects worker assets', async () => {
  await write({
    'app.mpx': configure({ pages: ['./home'], workers: 'workers' }),
    'home.mpx': configure({ usingComponents: { card: 'native-package/card' } }),
    'workers/worker.js': 'module.exports = "worker"',
    'node_modules/native-package/package.json': JSON.stringify({ name: 'native-package', miniprogram: 'miniprogram_dist' }),
    'node_modules/native-package/miniprogram_dist/card.js': 'Component({})',
    'node_modules/native-package/miniprogram_dist/card.json': '{ component: true }',
    'node_modules/native-package/miniprogram_dist/card.wxml': '<view />',
    'node_modules/native-package/miniprogram_dist/card.wxss': 'view { color: red; }'
  })
  const graph = await discoverEntries({ app: './app.mpx' }, { context })
  const home = graph.entries.get('home')
  const card = graph.entries.get(home.json.usingComponents.card.slice(1))
  expect(card.json).toEqual({ component: true })
  expect(card.descriptor.template.src).toBe(path.join(context, 'node_modules/native-package/miniprogram_dist/card.wxml'))
  expect(card.descriptor.styles[0].src).toBe(path.join(context, 'node_modules/native-package/miniprogram_dist/card.wxss'))
  expect(graph.assets.get('workers/worker.js').source.toString()).toBe('module.exports = "worker"')
  expect(graph.contextDependencies.has(path.join(context, 'workers'))).toBe(true)
})

it('compiles only matched routes and one fallback per empty package in a production mini build', async () => {
  await write({
    'app.mpx': configure({
      pages: ['./hidden', './keep'],
      packages: ['./more/app.mpx?root=mixed'],
      subPackages: [{ root: 'mixed', pages: ['./keep'] }, { root: 'empty', pages: ['./first', './second'] }]
    }),
    'keep.mpx': configure({}),
    'hidden.mpx': configure({ usingComponents: { missing: './missing' } }),
    'more/app.mpx': configure({ pages: ['./unused'] }),
    'more/unused.mpx': configure({}),
    'mixed/keep.mpx': configure({}),
    'empty/first.mpx': configure({}),
    'empty/second.mpx': configure({})
  })
  const graph = await discoverEntries({ app: './app.mpx' }, {
    context,
    mode: 'wx',
    production: true,
    partialCompileRules: { include: /[/\\]keep\.mpx$/ }
  })
  expect(graph.entries.get('app').json).toEqual({
    pages: ['keep'],
    subPackages: [{ root: 'mixed', pages: ['keep'] }, { root: 'empty', pages: ['first'] }]
  })
  expect([...graph.entries.keys()]).toEqual(['app', 'keep', 'mixed/keep', 'empty/first'])
  expect(graph.entries.get('empty/first').resourcePath).toMatch(/default-page\.mpx$/)
  expect(graph.findEntry(path.join(context, 'empty/first.mpx'), 'empty')).toBe(graph.entries.get('empty/first'))
  expect(graph.findEntry(path.join(context, 'hidden.mpx')).name).toBe('hidden')
})
