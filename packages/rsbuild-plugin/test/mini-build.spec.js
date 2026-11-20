const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { promisify } = require('node:util')
const { execFile } = require('node:child_process')

const run = promisify(execFile)
const workDir = path.resolve(__dirname, '../../..')
const fixtureDir = fs.realpath(os.tmpdir())
const runner = path.join(__dirname, 'run-mini-build.js')

let fixture

beforeEach(async () => {
  fixture = await fs.mkdtemp(path.join(await fixtureDir, 'mpx-rsbuild-'))
})

afterEach(async () => {
  await fs.rm(fixture, { recursive: true, force: true })
})

it('emits a runnable mini-program with SFC, inline WXS, and native async JS', async () => {
  await run(process.execPath, [runner, fixture, workDir, 'build'])
}, 20000)

it('updates the output on page edits and clears removed page files in watch mode', async () => {
  await run(process.execPath, [runner, fixture, workDir, 'watch'])
}, 20000)

it('updates production watch artifacts and keeps dependencies on reused modules', async () => {
  await run(process.execPath, [runner, fixture, workDir, 'watch-production'])
}, 20000)
