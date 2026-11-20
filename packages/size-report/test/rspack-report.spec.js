const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const runner = path.join(__dirname, 'run-rspack-report.js')
let project

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'mpx-rspack-report-'))
  fs.writeFileSync(path.join(project, 'app.js'), 'console.log("app")')
  fs.writeFileSync(path.join(project, 'feature.js'), 'console.log("feature")')
})

afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true })
})

test('reports emitted bytes by package and module estimates from the chunk graph', () => {
  execFileSync(process.execPath, [runner, project], { stdio: 'pipe' })
  const dist = path.join(project, 'dist')
  const report = JSON.parse(fs.readFileSync(path.join(project, 'reports/size.json'), 'utf8'))
  expect(report).toMatchObject({ backend: 'rspack', mode: 'wx' })
  const assets = report.assetsSizeInfo.assets
  assets.forEach((asset) => expect(asset.bytes).toBe(fs.statSync(path.join(dist, asset.name)).size))
  expect(report.totalBytes).toBe(assets.reduce((total, asset) => total + asset.bytes, 0))
  const main = assets.find(({ name }) => name === 'app.js')
  expect(main.modules).toEqual(expect.arrayContaining([expect.objectContaining({ identifier: 'app.js', estimatedBytes: expect.any(Number) })]))
  expect(report.packageBytes).toMatchObject({
    main: main.bytes,
    'package/nested': assets.filter(({ packageName }) => packageName === 'package/nested').reduce((total, asset) => total + asset.bytes, 0)
  })
  expect(assets.find(({ name }) => name === 'package/nested/page.js.map')).toBeUndefined()
})

test('writes the report and fails when the package budget is exceeded', () => {
  expect(() => execFileSync(process.execPath, [runner, project, '1'], { stdio: 'pipe' })).toThrow('超过阈值')
  expect(fs.existsSync(path.join(project, 'reports/size.json'))).toBe(true)
})
