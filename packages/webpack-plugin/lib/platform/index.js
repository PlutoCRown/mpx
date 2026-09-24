/**
 * Thin compatibility shim: delegates to @mpxjs/compiler platform rules
 * while keeping the existing require-path contract.
 *
 * CompilerBridge is set lazily on first call to avoid circular dependency
 * with template-compiler/compiler.js which also requires this module.
 */
const { getRulesRunner, setCompilerBridge } = require('@mpxjs/compiler')

let bridgeInitialized = false

function ensureBridge () {
  if (bridgeInitialized) return
  bridgeInitialized = true
  const {
    parseMustacheWithContext,
    stringifyWithResolveComputed,
    makeAttrsMap,
    evalExp
  } = require('../template-compiler/compiler')
  setCompilerBridge({
    parseMustacheWithContext,
    stringifyWithResolveComputed,
    makeAttrsMap,
    evalExp
  })
}

module.exports = function shimGetRulesRunner (options) {
  ensureBridge()
  return getRulesRunner(options)
}
