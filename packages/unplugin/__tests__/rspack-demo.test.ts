import * as fs from 'fs'
import * as path from 'path'
import { rspack } from '@rspack/core'
import { rspack as mpxRspack } from '../src'

const exampleDir = path.join(__dirname, '../examples/web')
const vuePackage = path.dirname(require.resolve('vue/package.json', {
  paths: [path.join(__dirname, '..')]
}))

describe('rspack web demo', () => {
  it('builds the .mpx fixture into a web bundle through Vue', (done) => {
    const compiler = rspack({
      context: exampleDir,
      entry: './src/main.js',
      mode: 'development',
      devtool: false,
      target: 'web',
      experiments: {
        css: true
      },
      output: {
        path: path.join(exampleDir, 'dist'),
        filename: 'main.js',
        publicPath: '/',
        clean: true
      },
      resolve: {
        alias: {
          vue: vuePackage
        },
        extensions: ['.mpx', '.mjs', '.js', '.json', '.vue']
      },
      optimization: {
        minimize: false
      },
      plugins: [
        mpxRspack({ mode: 'web' }),
        new rspack.HtmlRspackPlugin({
          template: path.join(exampleDir, 'index.html')
        })
      ]
    })

    compiler.run((error, stats) => {
      const finish = (failure?: Error) => {
        compiler.close(() => {
          if (failure) done(failure)
          else done()
        })
      }
      if (error) {
        finish(error)
        return
      }
      if (!stats) {
        finish(new Error('rspack returned no stats'))
        return
      }
      const info = stats.toJson({ errors: true, warnings: true })
      const errors = (info.errors || []).map((item) => item.message || String(item))
      const warnings = (info.warnings || []).map((item) => item.message || String(item))
      if (errors.length || warnings.some((message) => message.indexOf('was not found in \'vue\'') >= 0)) {
        finish(new Error(errors.concat(warnings).join('\n\n')))
        return
      }
      const bundle = fs.readFileSync(path.join(exampleDir, 'dist/main.js'), 'utf8')
      const html = fs.readFileSync(path.join(exampleDir, 'dist/index.html'), 'utf8')
      expect(bundle).toContain('MPX Web')
      expect(bundle).toContain('nested')
      expect(bundle).toContain('visible')
      expect(bundle).not.toContain('wx-only-template')
      expect(html).toContain('id="app"')
      expect(html).toContain('main.js')
      finish()
    })
  })
})
