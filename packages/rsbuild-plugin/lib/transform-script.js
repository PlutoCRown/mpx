const path = require('node:path')
const { transformSync, template, types: t } = require('@babel/core')
const addQuery = require('@mpxjs/webpack-plugin/lib/utils/add-query')
const parseRequest = require('@mpxjs/webpack-plugin/lib/utils/parse-request')
const hasOwn = require('@mpxjs/webpack-plugin/lib/utils/has-own')
const { matchCondition } = require('@mpxjs/webpack-plugin/lib/utils/match-condition')
const { transSubpackage } = require('@mpxjs/webpack-plugin/lib/utils/trans-async-sub-rules')
const { isReact } = require('@mpxjs/webpack-plugin/lib/utils/env')
const frameworkPackages = path.dirname(path.dirname(require.resolve('@mpxjs/webpack-plugin/package.json')))

function isFrameworkResource (filename) {
  if (/[\\/]node_modules[\\/]@mpxjs[\\/]/.test(filename)) return true
  const relative = path.relative(frameworkPackages, filename)
  if (relative.startsWith('..') || path.isAbsolute(relative)) return false
  const folder = relative.split(path.sep)[1]
  return folder === 'src' || folder === 'lib'
}

const buildRetry = template.statement(`
  function %%retry%% (load, times, interval) {
    return load().catch(function (error) {
      if (times <= 0) throw error
      if (interval <= 0) return %%retry%%(load, times - 1, interval)
      return new Promise(function (resolve) { setTimeout(resolve, interval) }).then(function () {
        return %%retry%%(load, times - 1, interval)
      })
    })
  }
`)

function getMemberName (node) {
  while (t.isTSAsExpression(node) || t.isTSTypeAssertion(node) || t.isTSNonNullExpression(node) || t.isTSSatisfiesExpression(node)) {
    node = node.expression
  }
  if (t.isIdentifier(node)) return node.name
  if (t.isMemberExpression(node) || t.isOptionalMemberExpression(node)) {
    const key = node.computed ? node.property.value : node.property.name
    const owner = typeof key === 'string' && getMemberName(node.object)
    if (owner) return `${owner}.${key}`
  }
}

function promiseResolve (expression) {
  return t.callExpression(t.memberExpression(t.identifier('Promise'), t.identifier('resolve')), [expression])
}

function resolveNamespace (resolvedPath) {
  return t.objectExpression([t.objectProperty(t.identifier('default'), t.stringLiteral(resolvedPath))])
}

function isTypeReference (path) {
  return path.parentPath.isTSType() || path.parentPath.isTSQualifiedName()
}

function skipDeadBranch (path) {
  const { parentPath, key } = path
  if (key === 'consequent' || key === 'alternate') {
    const test = parentPath.get('test').evaluateTruthy()
    if (test !== undefined && test !== (key === 'consequent')) path.skip()
  } else if (key === 'right' && parentPath.isLogicalExpression()) {
    const left = parentPath.get('left')
    const { operator } = parentPath.node
    if (operator === '??') {
      const { confident, value } = left.evaluate()
      if (confident && value != null) path.skip()
    } else if (left.evaluateTruthy() === (operator === '||')) {
      path.skip()
    }
  }
}

module.exports = function transformScript (source, {
  filename = 'module.js',
  lang,
  mode = 'wx',
  srcMode = mode,
  localSrcMode = srcMode,
  env = '',
  defs,
  wxs = false,
  transMpxRules,
  forceDisableProxyCtor,
  asyncSubpackageRules,
  rnConfig,
  disableRequireAsync,
  retryRequireAsync,
  warn,
  resolvePath,
  requireAsync,
  rewriteRequest,
  babelPlugins = [],
  inputSourceMap
} = {}) {
  const react = isReact(mode)
  const nativeAsync = mode === 'wx' || mode === 'ali' || mode === 'tt'
  const supportsAsync = !disableRequireAsync && (nativeAsync || mode === 'web' || (react && rnConfig?.supportSubpackage !== false))
  const transGlobals = srcMode !== mode && localSrcMode !== mode &&
    !isFrameworkResource(filename) && (!transMpxRules || matchCondition(filename, transMpxRules))
  const constructors = new Set(['Page', 'Component', 'App'])
  if (mode === 'ali' || mode === 'web' || react) constructors.add('Behavior')
  const definitions = Object.assign({}, defs, {
    __mpx_mode__: mode,
    __mpx_src_mode__: srcMode,
    __mpx_env__: env,
    __mpx_wxs__: wxs
  })
  const language = lang || filename.split('.').pop()
  const ts = /^(?:[cm]?ts|tsx)$/.test(language)
  const parsePlugins = ['decorators-legacy']
  if (ts) parsePlugins.push('typescript')
  if (!ts || language === 'tsx') parsePlugins.push('jsx')

  function rewrite (node, kind) {
    if (!t.isStringLiteral(node)) return node
    const result = rewriteRequest?.(node.value, kind)
    return result === undefined || result === node.value ? node : t.inherits(t.stringLiteral(result), node)
  }

  function resolved (request) {
    if (!resolvePath || !request.includes('?') || !parseRequest(request).queryObj.resolve) return
    return resolvePath(addQuery(request, {}, false, ['resolve']))
  }

  function replaceAsync (path, request, wrapRetry) {
    const { queryObj, resourcePath } = parseRequest(request)
    const declaredRoot = queryObj.root || asyncSubpackageRules?.find(rule => matchCondition(resourcePath, rule))?.root
    const packageRoot = react ? transSubpackage(rnConfig?.transSubpackageRules, declaredRoot) : declaredRoot
    const cleanRequest = queryObj.root ? addQuery(request, {}, false, ['root']) : request
    if (packageRoot && supportsAsync) {
      const code = requireAsync?.(cleanRequest, { packageRoot, mode, filename })
      let expression
      if (code !== undefined) {
        expression = template.expression.ast(code, { preserveComments: true })
      } else if (nativeAsync) {
        throw path.buildCodeFrameError(`No native Mpx async entry for ${JSON.stringify(request)} in package ${JSON.stringify(packageRoot)}`)
      } else {
        const argument = rewrite(t.stringLiteral(cleanRequest), 'async')
        const chunkName = JSON.stringify(`${packageRoot}/index`).replace(/\*\//g, '*\\u002f')
        t.addComment(argument, 'leading', ` webpackChunkName: ${chunkName} `)
        expression = t.callExpression(t.import(), [argument])
      }
      path.replaceWith(wrapRetry(expression))
    } else {
      if (!declaredRoot) warn?.(`The require async JS [${request}] need to declare subpackage name by root`)
      const argument = rewrite(t.stringLiteral(cleanRequest), 'require')
      path.replaceWith(promiseResolve(t.callExpression(t.identifier('require'), [argument])))
    }
    path.skip()
  }

  const { code, map } = transformSync(source, {
    filename,
    sourceFileName: filename,
    babelrc: false,
    configFile: false,
    sourceType: 'unambiguous',
    sourceMaps: true,
    inputSourceMap,
    parserOpts: { plugins: parsePlugins, allowReturnOutsideFunction: true },
    plugins: [...babelPlugins, function () {
      return {
        visitor: {
          Program (program) {
            const preamble = []
            const runtimeImports = new Map()
            const runtime = (name) => {
              if (!runtimeImports.has(name)) runtimeImports.set(name, program.scope.generateUidIdentifier(name))
              return t.cloneNode(runtimeImports.get(name))
            }
            let retry

            function wrapRetry (expression) {
              const times = retryRequireAsync === true ? 1 : retryRequireAsync?.times
              if (!(times > 0)) return expression
              if (!retry) {
                retry = program.scope.generateUidIdentifier('mpxRetry')
                preamble.push(buildRetry({ retry }))
              }
              const load = t.functionExpression(null, [], t.blockStatement([t.returnStatement(expression)]))
              return t.callExpression(t.cloneNode(retry), [
                load,
                t.valueToNode(times),
                t.valueToNode(retryRequireAsync?.interval || 0)
              ])
            }

            function replaceDefinition (path) {
              if (!path.isReferenced() || isTypeReference(path)) return
              const name = getMemberName(path.node)
              if (name && hasOwn(definitions, name) && !path.scope.getBinding(name.split('.')[0])) {
                path.replaceWith(t.valueToNode(definitions[name]))
                path.skip()
              }
            }

            program.traverse({
              ReferencedIdentifier: replaceDefinition,
              'MemberExpression|OptionalMemberExpression': replaceDefinition
            })

            program.traverse({
              enter: skipDeadBranch,
              ReferencedIdentifier (path) {
                if (transGlobals && path.node.name === 'wx' && !isTypeReference(path) && !path.scope.getBinding('wx')) {
                  path.replaceWith(runtime('mpx'))
                }
              },
              ImportDeclaration (path) {
                const { importKind, source, specifiers } = path.node
                if (importKind === 'type' || importKind === 'typeof' ||
                    (specifiers.length && specifiers.every(specifier => specifier.importKind === 'type'))) return
                const resolvedPath = resolved(source.value)
                if (resolvedPath === undefined) {
                  path.node.source = rewrite(source, 'import')
                  return
                }
                const declarations = specifiers.filter(specifier => specifier.importKind !== 'type').map(specifier => {
                  const isDefault = t.isImportDefaultSpecifier(specifier) ||
                    (t.isImportSpecifier(specifier) && (specifier.imported.name || specifier.imported.value) === 'default')
                  let value = t.valueToNode(undefined)
                  if (isDefault) value = t.stringLiteral(resolvedPath)
                  else if (t.isImportNamespaceSpecifier(specifier)) value = resolveNamespace(resolvedPath)
                  return t.variableDeclarator(specifier.local, value)
                })
                if (declarations.length) preamble.push(t.inherits(t.variableDeclaration('const', declarations), path.node))
                path.remove()
              },
              'ExportNamedDeclaration|ExportAllDeclaration' (path) {
                if (path.node.source && path.node.exportKind !== 'type') path.node.source = rewrite(path.node.source, 'export')
              },
              CallExpression (path) {
                const { callee, arguments: [argument] } = path.node
                const name = getMemberName(callee)
                if (name && path.scope.getBinding(name.split('.')[0])) return
                if (transGlobals && !forceDisableProxyCtor && constructors.has(name)) {
                  path.get('callee').replaceWith(t.callExpression(runtime('createFactory'), [t.stringLiteral(name)]))
                }
                if (!t.isStringLiteral(argument)) return
                if (name === 'require.async') {
                  replaceAsync(path, argument.value, wrapRetry)
                } else if (name === '__mpx_resolve_path__' && resolvePath) {
                  const result = resolvePath(addQuery(argument.value, {}, false, ['resolve']))
                  if (result !== undefined) path.replaceWith(t.stringLiteral(result))
                } else if (name === 'require' || name === 'require.extract' || t.isImport(callee)) {
                  const isImport = t.isImport(callee)
                  const resolvedPath = resolved(argument.value)
                  if (resolvedPath !== undefined) {
                    path.replaceWith(isImport ? promiseResolve(resolveNamespace(resolvedPath)) : t.stringLiteral(resolvedPath))
                  } else {
                    path.node.arguments[0] = rewrite(argument, isImport ? 'import' : 'require')
                    if (name === 'require.extract') path.node.callee = t.identifier('require')
                  }
                  path.skip()
                }
              }
            })

            runtimeImports.forEach((id, name) => {
              const request = t.stringLiteral(`@mpxjs/core/src/runtime/${name}`)
              if (program.node.sourceType === 'module') {
                preamble.unshift(t.importDeclaration([t.importDefaultSpecifier(id)], request))
              } else {
                if (program.scope.getBinding('require') && program.scope.getBinding('module')) {
                  program.scope.rename('require', program.scope.generateUid('localRequire'))
                }
                const requireFunction = program.scope.getBinding('require')
                  ? t.memberExpression(t.identifier('module'), t.identifier('require'))
                  : t.identifier('require')
                const requireCall = t.callExpression(requireFunction, [request])
                preamble.unshift(t.variableDeclaration('var', [t.variableDeclarator(id, requireCall)]))
              }
            })
            if (preamble.length) program.unshiftContainer('body', preamble)
            if (program.node.sourceType === 'module' && !program.node.body.some(node => t.isImportOrExportDeclaration(node))) {
              program.pushContainer('body', t.exportNamedDeclaration(null, []))
            }
          }
        }
      }
    }]
  })
  return { code, map }
}
