const path = require('path')
const { rspack } = require('@rspack/core')
const mpx = require('@mpxjs/unplugin')

// The monorepo root hoists Vue 2 for @mpxjs/webpack-plugin. This demo's
// fixtures live outside the package, so pin the Vue 3 install next to it.
const vuePackage = path.dirname(require.resolve('vue/package.json', {
  paths: [path.resolve(__dirname, '../..')]
}))

module.exports = {
  context: __dirname,
  entry: './src/main.js',
  mode: 'development',
  devtool: false,
  target: 'web',
  experiments: {
    css: true
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
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
    mpx.rspack({ mode: 'web' }),
    new rspack.HtmlRspackPlugin({
      template: path.resolve(__dirname, 'index.html')
    })
  ]
}
