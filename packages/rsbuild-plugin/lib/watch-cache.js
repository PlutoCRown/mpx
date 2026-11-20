const path = require('node:path')

const sourceFile = /\.(?:mpx|vue|[cm]?[jt]sx?|wxml|wxss|wxs|axml|acss|sjs|css|scss|sass|less|styl|stylus)$/i
const dependencyTypes = ['fileDependencies', 'contextDependencies', 'missingDependencies']
const loaderMethods = {
  addDependency: 'fileDependencies',
  addContextDependency: 'contextDependencies',
  addMissingDependency: 'missingDependencies',
  addBuildDependency: 'fileDependencies',
  emitFile: null,
  emitWarning: null,
  emitError: null
}

function createWatchCache (compiler, previous) {
  const changed = compiler.modifiedFiles
  const files = changed ? Array.from(changed) : []
  // Unknown changes may alter resolution or configuration outside the recorded inputs.
  const reusable = previous && files.length && !compiler.removedFiles?.size &&
    files.every(file => (previous.files.has(file) || previous.missing.has(file)) &&
      sourceFile.test(file) && !previous.buildDependencies.has(file))
  const records = new Map()

  return {
    records,
    get (id, input, validate) {
      const record = reusable ? previous.records.get(id) : undefined
      if (!record || record.input !== input) return
      if (files.some(file => {
        const deps = record.effects.dependencies
        return deps.fileDependencies.has(file) || deps.missingDependencies.has(file) ||
          [...deps.contextDependencies].some(dir => file === dir || file.startsWith(dir + path.sep))
      })) return
      if (validate && !validate(record.value)) return
      records.set(id, record)
      return record
    },
    set (id, input, value, effects) {
      if (!effects.cacheable) return
      records.set(id, {
        input, value, effects: { dependencies: effects.dependencies, operations: effects.operations }
      })
    }
  }
}

function recordEffects (loader, graph) {
  const dependencies = Object.fromEntries(dependencyTypes.map(key => [key, new Set()]))
  const operations = []
  const facade = Object.create(loader)
  const effects = { facade, graph: graph.withDependencies(dependencies), dependencies, operations, cacheable: true }

  // Keep only replayable data, never the old loader or compilation, in a cache entry.
  for (const [method, type] of Object.entries(loaderMethods)) {
    facade[method] = (...args) => {
      if (type) dependencies[type].add(args[0])
      if (method === 'emitError') effects.cacheable = false
      operations.push([method, args])
      loader[method](...args)
    }
  }
  facade.cacheable = value => {
    if (value === false) effects.cacheable = false
  }
  return effects
}

function addDependencies (target, source) {
  for (const key of dependencyTypes) source[key].forEach(file => target[key].add(file))
}

function replayEffects (loader, graph, effects) {
  for (const [method, args] of effects.operations) loader[method](...args)
  addDependencies(graph, effects.dependencies)
}

module.exports = { createWatchCache, recordEffects, addDependencies, replayEffects }
