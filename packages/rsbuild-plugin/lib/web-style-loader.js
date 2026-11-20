const { stripCondition } = require('@mpxjs/webpack-plugin/lib/style-compiler/strip-conditional')

module.exports = function webStyleLoader (source, sourceMap) {
  // Vue's style block requests still carry the complete SFC here.
  const content = /\.(?:mpx|vue)$/.test(this.resourcePath)
    ? source
    : stripCondition(source, this.getMpx().defs)
  this.callback(null, content, sourceMap)
}
