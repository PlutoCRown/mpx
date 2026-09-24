import { createRequire } from 'module'
import * as fs from 'fs'
import * as path from 'path'

const localRequire = createRequire(__filename)
const libRoot = path.resolve(__dirname, '../../../webpack-plugin/lib')

function loadDep (name: string): unknown {
  const nested = path.join(libRoot, '../node_modules', name)
  if (fs.existsSync(path.join(nested, 'package.json'))) return localRequire(nested)
  return localRequire(name)
}

export interface HostBlock {
  content?: string
  src?: string
  lang?: string
  srcMode?: string
  scoped?: boolean
  setup?: boolean
  attrs?: Record<string, unknown>
}

export interface HostSfc {
  template: HostBlock | null
  script: HostBlock | null
  json: HostBlock | null
  styles: HostBlock[]
}

export interface TemplateMeta {
  wxsModuleMap?: Record<string, string>
  templateAssets?: Record<string, string>
  imports?: string[]
  templates?: Record<string, unknown>
  builtInComponentsMap?: Record<string, string>
  genericsInfo?: { hash?: string, map?: Record<string, boolean> }
  computed?: string[]
  refs?: unknown
  options?: unknown
}

export interface TemplateParseResult {
  root: unknown
  meta: TemplateMeta
}

interface TemplateCompiler {
  parseComponent: (source: string, options: {
    mode: string
    filePath: string
    pad?: string | false
    env?: string
  }) => HostSfc
  parse: (source: string, options: Record<string, unknown>) => TemplateParseResult
}

interface BindThis {
  transform: (code: string, options?: { ignoreMap?: Record<string, boolean> }) => { code: string }
}

interface GenNode {
  genNode: (node: unknown, isRoot?: boolean) => string
  genTemplate: (node: unknown) => string
}

export interface DiagnosticBag {
  warnings: string[]
  errors: string[]
}

const bindThis = localRequire(path.join(libRoot, 'template-compiler/bind-this')) as BindThis
const genNodeReact = localRequire(path.join(libRoot, 'template-compiler/gen-node-react')) as GenNode
const shallowStringify = localRequire(path.join(libRoot, 'utils/shallow-stringify')) as (value: unknown) => string
const isValidIdentifierStr = localRequire(path.join(libRoot, 'utils/is-valid-identifier-str')) as (value: string) => boolean
const dash2hump = (localRequire(path.join(libRoot, 'utils/hump-dash')) as { dash2hump: (value: string) => string }).dash2hump
const constants = localRequire(path.join(libRoot, 'utils/const')) as { MPX_APP_MODULE_ID: string }
const hashSum = loadDep('hash-sum') as (value: string) => string
const JSON5 = loadDep('json5') as { parse: (source: string) => unknown }
const postcss = loadDep('postcss') as (plugins: unknown[]) => { process: (css: string, options: { from?: string }) => { css: string } }
const transSpecial = localRequire(path.join(libRoot, 'style-compiler/plugins/trans-special')) as (options: { id: string, transPage: boolean }) => unknown
const removePad = localRequire(path.join(libRoot, 'style-compiler/plugins/remove-strip-conditional-comments')) as () => unknown
const isUrlRequestRaw = (loadDep('loader-utils') as { isUrlRequest: (url: string, root?: string) => boolean }).isUrlRequest

function loadTemplateCompiler (): TemplateCompiler {
  return localRequire(path.join(libRoot, 'template-compiler/compiler')) as TemplateCompiler
}

function loadStyleHelper (): { getClassMap: (input: Record<string, unknown>) => Record<string, unknown> } {
  return localRequire(path.join(libRoot, 'react/style-helper')) as {
    getClassMap: (input: Record<string, unknown>) => Record<string, unknown>
  }
}

export const OPTION_PROCESSOR_REQUEST = '@mpxjs/webpack-plugin/lib/runtime/optionProcessorReact'
export const APP_MODULE_ID = constants.MPX_APP_MODULE_ID

export function parseComponent (source: string, options: {
  mode: string
  filePath: string
  pad?: string | false
  env?: string
}): HostSfc {
  return loadTemplateCompiler().parseComponent(source, options)
}

export function parseTemplate (source: string, options: Record<string, unknown>): TemplateParseResult {
  return loadTemplateCompiler().parse(source, options)
}

export function bindTemplate (code: string, ignoreMap?: Record<string, boolean>): string {
  const result = bindThis.transform(code, ignoreMap ? { ignoreMap } : undefined)
  return result.code
}

export function genNode (node: unknown, isRoot?: boolean): string {
  return genNodeReact.genNode(node, isRoot)
}

export function genTemplate (node: unknown): string {
  return genNodeReact.genTemplate(node)
}

export function getClassMap (input: Record<string, unknown>): Record<string, unknown> {
  return loadStyleHelper().getClassMap(input)
}

export function stringifyShallow (value: unknown): string {
  return shallowStringify(value)
}

export function isIdentifier (value: string): boolean {
  return isValidIdentifierStr(value)
}

export function dashToHump (value: string): string {
  return dash2hump(value)
}

export function pathHash (value: string): string {
  return hashSum(value)
}

export function parseJson5 (source: string): unknown {
  return JSON5.parse(source)
}

export function prepareReactCss (css: string, filename: string, moduleId: string): string {
  return postcss([
    removePad(),
    transSpecial({ id: moduleId, transPage: true })
  ]).process(css, { from: filename }).css
}

export function isUrlRequest (url: string, root?: string): boolean {
  if (!url || typeof url !== 'string') return false
  if (/^@[A-Za-z_$][A-Za-z0-9_$]*$/.test(url)) return false
  if (/^.+:\/\//.test(url)) return false
  if (/\{\{((?:.|\n|\r)+?)\}\}(?!})/.test(url)) return false
  return isUrlRequestRaw(url, root)
}

export function pushDiag (bag: DiagnosticBag, kind: 'warning' | 'error', resource: string, message: unknown): void {
  const text = typeof message === 'string'
    ? message
    : message instanceof Error
      ? message.message
      : String(message)
  const prefix = kind === 'warning' ? '[mpx compiler warning]' : '[mpx compiler error]'
  bag[kind === 'warning' ? 'warnings' : 'errors'].push(prefix + '[' + resource + ']: ' + text)
}
