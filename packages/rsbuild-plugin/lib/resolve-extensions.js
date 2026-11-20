const sourceExtensions = ['.mpx', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.json', '.vue']

module.exports = function configureResolveExtensions (resolve, { mode, env }) {
  const modes = mode === 'android' || mode === 'harmony' ? [mode, 'ios'] : [mode]
  const suffixes = modes.flatMap(platform => env ? [`.${platform}.${env}`, `.${platform}`] : [`.${platform}`])
  if (env) suffixes.push('.' + env)
  const variants = extension => suffixes.map(suffix => suffix + extension).concat(extension)
  const configured = (resolve.extensions || []).filter(extension => extension !== '...')
  const extensions = [...new Set(sourceExtensions.concat(configured))]
  resolve.extensions = [...new Set(extensions.flatMap(extension => sourceExtensions.includes(extension) ? variants(extension) : [extension]))]
  const aliases = Object.assign({}, resolve.extensionAlias)
  sourceExtensions.forEach(extension => {
    const candidates = [extension].concat(aliases[extension] || [])
    aliases[extension] = [...new Set(candidates.flatMap(candidate => variants(candidate).slice(0, -1)).concat(aliases[extension] || extension))]
  })
  resolve.extensionAlias = aliases
}
