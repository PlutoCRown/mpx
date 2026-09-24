const path = require('path')
const mpx = require('@mpxjs/unplugin')

const externalRequest = (request) => {
  if (!request) return false
  if (request === 'react' || request === 'react-native' || request === '@mpxjs/core' || request === '@mpxjs/utils') return true
  if (request.indexOf('optionProcessorReact') >= 0) return true
  if (request.indexOf('/runtime/components/') >= 0) return true
  return false
}

module.exports = {
  context: __dirname,
  entry: './src/main.js',
  mode: 'development',
  devtool: false,
  target: 'node',
  output: {
    path: path.resolve(__dirname, 'dist-webpack'),
    filename: 'main.js',
    clean: true
  },
  resolve: {
    extensions: ['.mpx', '.js', '.json']
  },
  externals: [
    function (data, callback) {
      const request = data.request
      if (externalRequest(request)) return callback(null, 'commonjs ' + request)
      callback()
    }
  ],
  optimization: {
    minimize: false
  },
  plugins: [
    mpx.webpack({ mode: 'android' })
  ]
}
