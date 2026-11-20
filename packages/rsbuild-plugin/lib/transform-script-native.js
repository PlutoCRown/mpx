const MagicString = require('magic-string')
const remapping = require('@jridgewell/remapping')
const hasOwn = require('@mpxjs/webpack-plugin/lib/utils/has-own')
const addQuery = require('@mpxjs/webpack-plugin/lib/utils/add-query')
const transformScript = require('./transform-script')
const { getAsyncRequest, getResolveRequest } = require('./script-requests')

const nativeModes = new Set(['wx', 'ali', 'tt'])
const wrappers = new Set(['ParenthesizedExpression', 'TSAsExpression', 'TSTypeAssertion', 'TSNonNullExpression', 'TSSatisfiesExpression'])
const expressionFields = {
  VariableDeclarator: ['init'],
  AssignmentExpression: ['right'],
  BinaryExpression: ['left', 'right'],
  LogicalExpression: ['left', 'right'],
  UnaryExpression: ['argument'],
  AwaitExpression: ['argument'],
  YieldExpression: ['argument'],
  ReturnStatement: ['argument'],
  ThrowStatement: ['argument'],
  SpreadElement: ['argument'],
  ArrayExpression: ['elements'],
  SequenceExpression: ['expressions'],
  TemplateLiteral: ['expressions'],
  ArrowFunctionExpression: ['body'],
  CallExpression: ['callee', 'arguments'],
  NewExpression: ['callee', 'arguments'],
  ImportExpression: ['source'],
  ConditionalExpression: ['test', 'consequent', 'alternate'],
  IfStatement: ['test'],
  WhileStatement: ['test'],
  DoWhileStatement: ['test'],
  ForStatement: ['test', 'update'],
  SwitchStatement: ['discriminant'],
  SwitchCase: ['test'],
  ExpressionStatement: ['expression'],
  ExportDefaultDeclaration: ['declaration']
}

function unwrap (node) {
  while (wrappers.has(node?.type)) node = node.expression
  return node
}

function memberName (node) {
  node = unwrap(node)
  if (node?.type === 'Identifier') return node.name
  if (node?.type === 'MemberExpression') {
    const key = node.computed ? node.property.value : node.property.name
    const object = typeof key === 'string' && memberName(node.object)
    if (object) return object + '.' + key
  }
}

function isReference (context) {
  const { parent, key } = context
  if (parent?.type === 'MemberExpression') return key === 'object' || parent.computed
  if (parent?.type === 'Property' && key === 'value' && !parent.shorthand) {
    return context.ancestors().at(-2)?.type === 'ObjectExpression'
  }
  return (wrappers.has(parent?.type) && key === 'expression') || expressionFields[parent?.type]?.includes(key)
}

function inConditionalBranch (node, context) {
  return context.ancestors().some((parent, index, ancestors) => {
    const child = ancestors[index + 1] || node
    return ((parent.type === 'IfStatement' || parent.type === 'ConditionalExpression') &&
        (parent.consequent === child || parent.alternate === child)) ||
      (parent.type === 'LogicalExpression' && parent.right === child) || parent.type === 'ChainExpression'
  })
}

function addDefinitionEdit (node, context, name) {
  const state = context.state
  const { definitions } = state
  const value = definitions[name]
  // Unusual definition values and ambiguous positions use the legacy transform.
  if (!isReference(context) || (value !== null && !['string', 'boolean', 'number'].includes(typeof value)) ||
      (typeof value === 'number' && (!Number.isFinite(value) || Object.is(value, -0)))) {
    context.stop()
    state.unsupported = true
    return
  }
  state.roots.add(name.split('.')[0])
  state.edits.push({ node, replacement: () => '(' + JSON.stringify(value) + ')' })
  context.skip()
}

function requestEdit (node, context, argument, kind, name) {
  const state = context.state
  const { options, definitions } = state
  // Babel substitutes definitions before entering the request visitors.
  if (hasOwn(definitions, memberName(argument)) || hasOwn(definitions, name)) {
    context.stop()
    state.unsupported = true
    return
  }
  if (argument?.type !== 'Literal' || typeof argument.value !== 'string') return
  const request = argument.value
  const { filename = 'module.js', mode = 'wx', resolvePath, requireAsync, rewriteRequest, warn, asyncSubpackageRules } = options
  const resolveRequest = resolvePath ? getResolveRequest(request) : undefined
  if (!resolveRequest && !rewriteRequest && name !== 'require.async' &&
      name !== 'require.extract' && !(name === '__mpx_resolve_path__' && resolvePath)) return

  if (inConditionalBranch(node, context) || node.optional || node.callee?.optional || node.arguments?.length > 1 ||
      (name === 'require.async' && options.retryRequireAsync)) {
    context.stop()
    state.unsupported = true
    return
  }

  if (name) state.roots.add(name.split('.')[0])
  const rewrite = (request, kind) => rewriteRequest?.(request, kind) ?? request
  if (name === 'require.async') {
    const { root, request: cleanRequest } = getAsyncRequest(request, asyncSubpackageRules)
    if (root && !options.disableRequireAsync && !requireAsync) {
      context.stop()
      state.unsupported = true
      return
    }
    state.edits.push({
      node,
      replacement () {
        if (root && !options.disableRequireAsync) {
          const code = requireAsync(cleanRequest, { packageRoot: root, mode, filename })
          if (code === undefined) throw new Error('No native Mpx async entry for ' + JSON.stringify(request) + ' in package ' + JSON.stringify(root))
          return code
        }
        if (!root) warn?.('The require async JS [' + request + '] need to declare subpackage name by root')
        return 'Promise.resolve(require(' + JSON.stringify(rewrite(cleanRequest, 'require')) + '))'
      }
    })
  } else if (name === '__mpx_resolve_path__') {
    if (resolvePath) state.edits.push({ node, replacement: () => JSON.stringify(resolvePath(addQuery(request, {}, false, ['resolve']))) })
  } else if (resolveRequest || name === 'require.extract') {
    state.edits.push({
      node,
      replacement () {
        const resolved = resolveRequest === undefined ? undefined : resolvePath(resolveRequest)
        if (resolved !== undefined) {
          const path = JSON.stringify(resolved)
          return kind === 'import' ? 'Promise.resolve({ default: ' + path + ' })' : path
        }
        if (name === 'require.extract') {
          return 'require(' + JSON.stringify(rewrite(request, kind)) + ')'
        }
        const updated = rewrite(request, kind)
        if (updated !== request) {
          return state.source.slice(node.start, argument.start) + JSON.stringify(updated) + state.source.slice(argument.end, node.end)
        }
      }
    })
  } else {
    state.edits.push({
 node: argument,
replacement: () => {
      const updated = rewrite(request, kind)
      return updated !== request ? JSON.stringify(updated) : undefined
    }
})
  }
}

function declarationEdit (node, context, kind) {
  const { source } = node
  if (!source || node.importKind === 'type' || node.exportKind === 'type' ||
      (node.specifiers?.length && node.specifiers.every(specifier => specifier.importKind === 'type'))) return
  const { options, edits } = context.state
  if (kind === 'import' && options.resolvePath && getResolveRequest(source.value) !== undefined) {
    // The legacy pass hoists these bindings and preserves the original ESM module type.
    context.state.unsupported = true
    context.stop()
  } else if (options.rewriteRequest) {
    edits.push({
 node: source,
replacement: () => {
      const updated = options.rewriteRequest(source.value, kind)
      if (updated !== undefined && updated !== source.value) return JSON.stringify(updated)
    }
})
  }
}

function createScriptWalker (createWalker) {
  return createWalker({
    Identifier (node, context) {
      const { definitions, uncertain } = context.state
      if (!isReference(context)) {
        uncertain.add(node.name)
        if (hasOwn(definitions, node.name)) {
          context.state.unsupported = true
          context.stop()
        }
      } else if (hasOwn(definitions, node.name)) {
        addDefinitionEdit(node, context, node.name)
      }
    },
    MemberExpression (node, context) {
      const name = memberName(node)
      if (name && hasOwn(context.state.definitions, name)) addDefinitionEdit(node, context, name)
    },
    CallExpression (node, context) {
      const name = memberName(node.callee)
      if (name === 'require' || name === 'require.async' || name === 'require.extract' || name === '__mpx_resolve_path__') {
        requestEdit(node, context, node.arguments[0], 'require', name)
      }
    },
    ImportExpression (node, context) {
      requestEdit(node, context, node.source, 'import')
    },
    ImportDeclaration (node, context) {
      declarationEdit(node, context, 'import')
    },
    ExportNamedDeclaration (node, context) {
      declarationEdit(node, context, 'export')
    },
    ExportAllDeclaration (node, context) {
      declarationEdit(node, context, 'export')
    },
    WithStatement (_node, context) {
      context.state.unsupported = true
      context.stop()
    },
    JSXElement (_node, context) {
      context.state.unsupported = true
      context.stop()
    },
    ChainExpression (node, context) {
      const name = memberName(node.expression)
      if (name && hasOwn(context.state.definitions, name)) {
        context.state.unsupported = true
        context.stop()
      }
    }
  })
}

let nativeCompiler

module.exports = async function transformNativeScript (source, options = {}) {
  const { filename = 'module.js', mode = 'wx', srcMode = mode, env = '', wxs = false, lang, defs, babelPlugins, inputSourceMap } = options
  if (!nativeModes.has(mode) || mode !== srcMode || babelPlugins?.length) return transformScript(source, options)

  nativeCompiler ||= import('@swc-next/core')
    .then(({ parseSync, createWalker }) => ({ parseSync, walker: createScriptWalker(createWalker) }))
    .catch(error => {
      if (!/^(?:Cannot find|Failed to load) native binding/.test(error.message)) throw error
    })
  const compiler = await nativeCompiler
  if (!compiler) return transformScript(source, options)
  const { parseSync, walker } = compiler
  const language = lang || filename.split('.').pop()
  let program
  try {
    program = parseSync(source, {
      lang: /^(?:[cm]?ts|tsx)$/.test(language) ? language === 'tsx' ? 'tsx' : 'ts' : 'jsx',
      sourceType: 'unambiguous',
      semanticErrors: true
    }).program
  } catch {
    return transformScript(source, options)
  }

  const definitions = Object.assign({}, defs, {
    __mpx_mode__: mode,
    __mpx_src_mode__: srcMode,
    __mpx_env__: env,
    __mpx_wxs__: wxs
  })
  const state = { source, options, definitions, edits: [], roots: new Set(), uncertain: new Set(), unsupported: false }
  walker.walk(program, state)
  if (state.unsupported || [...state.roots].some(name => state.uncertain.has(name))) return transformScript(source, options)

  let end = 0
  state.edits.sort((a, b) => a.node.start - b.node.start)
  for (const { node } of state.edits) {
    if (node.start < end) return transformScript(source, options)
    end = node.end
  }

  let output
  for (const { node, replacement } of state.edits) {
    const code = replacement()
    if (code === undefined) continue
    output ||= new MagicString(source)
    output.overwrite(node.start, node.end, code)
  }
  if (!output) return { code: source, map: inputSourceMap }
  const map = JSON.parse(output.generateMap({ source: filename, includeContent: true, hires: 'boundary' }).toString())
  return { code: output.toString(), map: inputSourceMap ? remapping([map, inputSourceMap], () => null) : map }
}
