const { createRequire } = require('module')
const { pluginMpxSizeReport } = require('../src')

const { createRsbuild } = createRequire(require.resolve('../../rsbuild-plugin/package.json'))('@rsbuild/core')
const [cwd, budget] = process.argv.slice(2)

async function run () {
  const rsbuild = await createRsbuild({
    cwd,
    config: {
      logLevel: 'error',
      source: { entry: { app: './app.js', 'package/nested/page': './feature.js' } },
      output: { target: 'node', sourceMap: true, minify: false },
      plugins: [{
        name: 'mpx:size-report-test',
        setup (api) {
          api.modifyRspackConfig((config) => {
            config.plugins.push({
              apply (compiler) {
                compiler.hooks.thisCompilation.tap('SizeReportTest', (compilation) => {
                  compilation.mpxBuildInfo = { mode: 'wx', packageRoots: ['package', 'package/nested'] }
                })
              }
            })
          })
        }
      }, pluginMpxSizeReport({
        filename: '../reports/size.json',
        reportAssets: true,
        threshold: budget && { packages: { 'package/nested': Number(budget) } }
      })]
    }
  })
  const build = await rsbuild.build()
  await build.close()
}

run().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
