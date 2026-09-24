import * as fs from 'fs'
import * as path from 'path'
import { rspack } from '@rspack/core'
import { rspack as mpxRspack } from '../src'

const exampleDir = path.join(__dirname, '../examples/rn')

function externalRequest (request: string | undefined): boolean {
  if (!request) return false
  if (request === 'react' || request === 'react-native' || request === '@mpxjs/core' || request === '@mpxjs/utils') return true
  if (request.indexOf('optionProcessorReact') >= 0) return true
  if (request.indexOf('/runtime/components/') >= 0) return true
  return false
}

describe('rspack react native adapter', () => {
  it('bundles .mpx into an RN JS module without vue-loader or Compilation patches', (done) => {
    const compiler = rspack({
      context: exampleDir,
      entry: './src/main.js',
      mode: 'development',
      devtool: false,
      target: 'node',
      output: {
        path: path.join(exampleDir, 'dist'),
        filename: 'main.js',
        clean: true
      },
      resolve: {
        extensions: ['.mpx', '.js', '.json']
      },
      externals: [
        function (data, callback) {
          const request = data.request
          if (externalRequest(request)) {
            callback(undefined, 'commonjs ' + request)
            return
          }
          callback()
        }
      ],
      optimization: {
        minimize: false
      },
      plugins: [
        mpxRspack({ mode: 'ios' })
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
      if (errors.length) {
        finish(new Error(errors.join('\n\n')))
        return
      }
      const bundle = fs.readFileSync(path.join(exampleDir, 'dist/main.js'), 'utf8')
      expect(bundle).toContain('MPX Web')
      expect(bundle).toContain('nested')
      expect(bundle).toContain('global.currentInject.render')
      expect(bundle).toContain('__getClassStyle')
      expect(bundle).not.toContain('wx-only-template')
      expect(bundle).not.toContain('webpack/lib')
      expect(bundle).not.toContain('Compilation.prototype')
      finish()
    })
  })
})
