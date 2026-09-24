import * as fs from 'fs'
import * as path from 'path'
import getRulesRunner from '../platform/index'
import type { RulesRunnerOptions } from '../platform/types'
import type { MpxCtorType } from '../types'
import type { ReactMode } from '../modes'
import {
  isUrlRequest,
  parseComponent,
  parseJson5,
  pathHash,
  pushDiag,
  type DiagnosticBag,
  type HostSfc
} from './host'
import { appendQuery, ensureRelativeMpx, isProjectFile, splitRequest, toPosix } from './paths'

export interface LocalComponent {
  name: string
  request: string
  asyncName: string
  moduleId: string
  absPath: string | null
}

export interface LocalPage {
  outputPath: string
  request: string
  asyncName: string
  isFirst: boolean
  moduleId: string
  absPath: string | null
}

export interface JsonModel {
  jsonObj: Record<string, unknown>
  components: LocalComponent[]
  pages: LocalPage[]
  originalUsingComponents: string[]
  componentGenerics: Record<string, { default?: string }>
  componentPlaceholderNames: string[]
  watchFiles: string[]
}

export function buildJsonModel (options: {
  jsonContent: string
  resourceFile: string
  context: string
  mode: ReactMode
  srcMode: string
  ctorType: MpxCtorType
  env?: string
  bag: DiagnosticBag
}): JsonModel {
  const model: JsonModel = {
    jsonObj: {},
    components: [],
    pages: [],
    originalUsingComponents: [],
    componentGenerics: {},
    componentPlaceholderNames: [],
    watchFiles: []
  }
  if (!options.jsonContent) return model

  let jsonObj: Record<string, unknown>
  try {
    const parsed = parseJson5(options.jsonContent)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('JSON block must be an object')
    }
    jsonObj = parsed as Record<string, unknown>
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error('[mpx compiler][' + options.resourceFile + ']: ' + message)
  }

  const using = jsonObj.usingComponents
  if (using && typeof using === 'object' && !Array.isArray(using)) {
    model.originalUsingComponents = Object.keys(using as Record<string, unknown>)
  }

  const rulesOptions: RulesRunnerOptions = {
    mode: options.mode,
    srcMode: options.srcMode,
    type: 'json',
    waterfall: true,
    warn: (message: string) => pushDiag(options.bag, 'warning', options.resourceFile, message),
    error: (message: string) => pushDiag(options.bag, 'error', options.resourceFile, message),
    diagnostic: { file: options.resourceFile },
    data: { globalComponents: {} }
  }
  if (options.ctorType !== 'app') rulesOptions.mainKey = options.ctorType
  try {
    const runner = getRulesRunner(rulesOptions)
    if (runner) runner(jsonObj)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error('[mpx compiler][' + options.resourceFile + ']: ' + message)
  }
  model.jsonObj = jsonObj
  model.componentGenerics = readGenerics(jsonObj)
  model.componentPlaceholderNames = readPlaceholderNames(jsonObj)

  const fromDir = path.dirname(options.resourceFile)
  const seenPages = new Set<string>()
  processPages(jsonObj.pages, options.context, '', true, options, model, seenPages, fromDir)
  processComponents(jsonObj.usingComponents, options.context, '', options, model, fromDir)
  processPackages(jsonObj.packages, options.context, options, model, seenPages, 0, fromDir)
  const subPackages = jsonObj.subPackages || jsonObj.subpackages
  processSubPackages(subPackages, options.context, options, model, seenPages, fromDir)
  processGenericDefaults(model.componentGenerics, options, model, fromDir)
  return model
}

function processPages (
  pages: unknown,
  context: string,
  tarRoot: string,
  markFirst: boolean,
  options: { mode: ReactMode, resourceFile: string, bag: DiagnosticBag },
  model: JsonModel,
  seenPages: Set<string>,
  fromDir: string
): void {
  if (!Array.isArray(pages)) return
  pages.forEach((page, index) => {
    addPage(page, context, tarRoot, markFirst && index === 0, options, model, seenPages, fromDir)
  })
}

function addPage (
  page: unknown,
  context: string,
  tarRoot: string,
  markFirst: boolean,
  options: { mode: ReactMode, resourceFile: string, bag: DiagnosticBag },
  model: JsonModel,
  seenPages: Set<string>,
  fromDir: string
): void {
  let alias: string | null = null
  let request = ''
  if (typeof page === 'string') request = page
  else if (page && typeof page === 'object') {
    const record = page as Record<string, unknown>
    if (typeof record.path === 'string') alias = record.path.replace(/^\//, '')
    if (typeof record.src === 'string') request = record.src
  }
  if (!request || !isUrlRequest(request, context)) return

  const parsed = splitRequest(request)
  const isFirst = markFirst || Object.prototype.hasOwnProperty.call(parsed.query, 'isFirst')
  const asyncName = parsed.query.root || tarRoot
  delete parsed.query.root
  delete parsed.query.isFirst
  const fileRequest = ensureRelativeMpx(appendQuery(parsed.pathname, parsed.query))
  const absPath = resolveFile(context, fileRequest)
  const normalized = moduleRequest(fromDir, absPath, fileRequest)
  const identity = absPath || normalized
  let outputPath = alias
    ? toPosix(alias)
    : pageOutputPath(identity, absPath, context, options)
  if (asyncName) outputPath = toPosix(path.posix.join(asyncName, outputPath))
  const dedupeKey = identity + '|' + outputPath + '|' + asyncName
  if (seenPages.has(dedupeKey)) return
  seenPages.add(dedupeKey)

  const existing = model.pages.filter((item) => item.outputPath === outputPath)[0]
  if (existing && existing.absPath !== absPath) {
    const previous = outputPath
    outputPath = previous + pathHash(identity)
    pushDiag(options.bag, 'warning', options.resourceFile, 'Current page [' + identity + '] is registered with a conflict outputPath [' + previous + '] which is already existed in system, will be renamed with [' + outputPath + ']')
  }

  const emitted = appendQuery(normalized, { mpxRn: '1', isPage: 'true' })
  model.pages.push({
    outputPath,
    request: emitted,
    asyncName,
    isFirst,
    moduleId: '_' + pathHash(identity),
    absPath
  })
  if (absPath) model.watchFiles.push(absPath)
}

function pageOutputPath (
  identity: string,
  absPath: string | null,
  context: string,
  options: { resourceFile: string, bag: DiagnosticBag }
): string {
  if (!absPath) return 'pages/' + safeName(identity) + pathHash(identity) + '/index'
  const relative = path.relative(context, absPath)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    const renamed = 'pages/' + path.parse(absPath).name + pathHash(absPath) + '/index'
    pushDiag(options.bag, 'warning', options.resourceFile, 'Current page [' + absPath + '] is not in current pages directory [' + context + '], the page path will be replaced with [' + renamed + ']')
    return renamed
  }
  return toPosix(relative).replace(/\.[^.]*$/, '')
}

function processComponents (
  components: unknown,
  context: string,
  tarRoot: string,
  options: { mode: ReactMode, resourceFile: string, bag: DiagnosticBag },
  model: JsonModel,
  fromDir: string
): void {
  if (!components || typeof components !== 'object' || Array.isArray(components)) return
  Object.keys(components as Record<string, unknown>).forEach((name) => {
    const value = (components as Record<string, unknown>)[name]
    if (typeof value !== 'string' || !isUrlRequest(value, context)) return
    addComponent(name, value, context, tarRoot, model, fromDir)
  })
}

function addComponent (
  name: string,
  request: string,
  context: string,
  tarRoot: string,
  model: JsonModel,
  fromDir: string
): void {
  const parsed = splitRequest(request)
  const asyncName = parsed.query.root || tarRoot
  delete parsed.query.root
  const fileRequest = ensureRelativeMpx(appendQuery(parsed.pathname, parsed.query))
  const absPath = resolveFile(context, fileRequest)
  const normalized = moduleRequest(fromDir, absPath, fileRequest)
  const identity = absPath || normalized
  const outputPath = 'components/' + safeName(name) + pathHash(identity) + '/index'
  const emitted = appendQuery(normalized, {
    mpxRn: '1',
    isComponent: 'true',
    outputPath
  })
  const previous = model.components.filter((item) => item.name === name)[0]
  const entry: LocalComponent = {
    name,
    request: emitted,
    asyncName,
    moduleId: '_' + pathHash(identity),
    absPath
  }
  if (previous) {
    model.components.splice(model.components.indexOf(previous), 1, entry)
  } else {
    model.components.push(entry)
  }
  if (absPath && model.watchFiles.indexOf(absPath) < 0) model.watchFiles.push(absPath)
}

function processGenericDefaults (
  generics: Record<string, { default?: string }>,
  options: { mode: ReactMode, resourceFile: string, context: string, bag: DiagnosticBag },
  model: JsonModel,
  fromDir: string
): void {
  const defaults: Record<string, string> = {}
  Object.keys(generics).forEach((name) => {
    const fallback = generics[name].default
    if (fallback) defaults[name + 'default'] = fallback
  })
  processComponents(defaults, options.context, '', options, model, fromDir)
}

function processSubPackages (
  subPackages: unknown,
  context: string,
  options: { mode: ReactMode, resourceFile: string, bag: DiagnosticBag },
  model: JsonModel,
  seenPages: Set<string>,
  fromDir: string
): void {
  if (!Array.isArray(subPackages)) return
  subPackages.forEach((subPackage) => {
    if (!subPackage || typeof subPackage !== 'object') return
    const record = subPackage as Record<string, unknown>
    const root = typeof record.root === 'string' ? record.root : ''
    if (root.startsWith('.')) {
      pushDiag(options.bag, 'error', options.resourceFile, 'Current subpackage root [' + root + '] is not allow starts with \'.\'')
      return
    }
    const tarRoot = typeof record.tarRoot === 'string' ? record.tarRoot : root
    const srcRoot = typeof record.srcRoot === 'string' ? record.srcRoot : root
    if (!tarRoot) return
    processPages(record.pages, path.join(context, srcRoot), tarRoot, false, options, model, seenPages, fromDir)
  })
}

function processPackages (
  packages: unknown,
  context: string,
  options: { mode: ReactMode, resourceFile: string, env?: string, bag: DiagnosticBag },
  model: JsonModel,
  seenPages: Set<string>,
  depth: number,
  fromDir: string
): void {
  if (!Array.isArray(packages) || depth > 8) return
  packages.forEach((packagePath) => {
    if (typeof packagePath !== 'string' || !isUrlRequest(packagePath, context)) return
    const parsed = splitRequest(packagePath)
    const absPath = resolveFile(context, ensureRelativeMpx(parsed.pathname))
    if (!absPath) {
      pushDiag(options.bag, 'error', options.resourceFile, 'Cannot resolve package [' + packagePath + ']')
      return
    }
    let content: Record<string, unknown>
    try {
      content = readPackageJson(absPath, options.mode, options.env)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      pushDiag(options.bag, 'error', options.resourceFile, message)
      return
    }
    if (model.watchFiles.indexOf(absPath) < 0) model.watchFiles.push(absPath)
    const nextContext = path.dirname(absPath)
    const tarRoot = parsed.query.root || ''
    if (Array.isArray(content.pages)) {
      processPages(content.pages, nextContext, tarRoot, false, options, model, seenPages, fromDir)
    }
    if (Array.isArray(content.packages)) {
      processPackages(content.packages, nextContext, options, model, seenPages, depth + 1, fromDir)
    }
  })
}

function readPackageJson (file: string, mode: ReactMode, env?: string): Record<string, unknown> {
  const content = fs.readFileSync(file, 'utf8')
  if (path.extname(file) !== '.mpx') {
    const parsed = parseJson5(content)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, unknown>
  }
  const parts: HostSfc = parseComponent(content, { mode, filePath: file, pad: 'line', env })
  const json = parts.json && parts.json.content
  if (!json || !json.trim()) return {}
  const parsed = parseJson5(json)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  return parsed as Record<string, unknown>
}

function moduleRequest (fromDir: string, absPath: string | null, fallback: string): string {
  if (!absPath) return fallback
  const query = splitRequest(fallback).query
  let relative = toPosix(path.relative(fromDir, absPath))
  if (!relative.startsWith('.')) relative = './' + relative
  return appendQuery(relative, query)
}

function resolveFile (context: string, request: string): string | null {
  const pathname = splitRequest(request).pathname
  if (!isProjectFile(pathname)) return null
  if (path.isAbsolute(pathname)) return pathname
  return path.resolve(context, pathname)
}

function readGenerics (json: Record<string, unknown>): Record<string, { default?: string }> {
  const raw = json.componentGenerics
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const generics: Record<string, { default?: string }> = {}
  Object.keys(raw as Record<string, unknown>).forEach((name) => {
    const value = (raw as Record<string, unknown>)[name]
    if (!value || typeof value !== 'object' || Array.isArray(value)) return
    const record = value as Record<string, unknown>
    const entry: { default?: string } = {}
    if (typeof record.default === 'string') entry.default = record.default
    generics[name] = entry
  })
  return generics
}

function readPlaceholderNames (json: Record<string, unknown>): string[] {
  const raw = json.componentPlaceholder
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
  const names: string[] = []
  Object.keys(raw as Record<string, unknown>).forEach((key) => {
    const value = (raw as Record<string, unknown>)[key]
    if (typeof value === 'string') names.push(value)
  })
  return names
}

function safeName (value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_$]+/g, '_')
  return cleaned || 'component'
}
