const path = require('path')
const { promisify } = require('util')

const pluginName = 'MpxRspackSizeReport'
const jsAsset = /\.[cm]?js$/i
const webpackOnlyOptions = ['groups', 'reportPages', 'reportRedundance', 'needEntryPathRules', 'skylineSubpackages']

function formatSize (bytes) {
  return (bytes / 1024).toFixed(2) + 'KiB'
}

function parseSize (value) {
  if (typeof value === 'number') return value
  if (typeof value !== 'string') return
  const match = /^([\d.]+)\s*([km])?i?b?$/i.exec(value.trim())
  if (match) return Number(match[1]) * ({ k: 1024, m: 1024 ** 2 }[match[2]?.toLowerCase()] || 1)
}

function getFileModules (compilation, compiler) {
  const root = compiler.inputFileSystem.realpathSync?.(compiler.context) || compiler.context
  const modules = new Map()
  compilation.chunks.forEach((chunk) => {
    const files = Array.from(chunk.files).filter((file) => jsAsset.test(file))
    if (!files.length) return
    const members = Array.from(compilation.chunkGraph.getChunkModulesIterable(chunk), (module) => {
      const file = module.nameForCondition()
      const identifier = file && path.isAbsolute(file) ? path.relative(root, file) : file || module.identifier()
      const estimatedBytes = module.size('javascript')
      return { identifier, size: formatSize(estimatedBytes), estimatedBytes }
    }).sort((a, b) => b.estimatedBytes - a.estimatedBytes)
    files.forEach((file) => modules.set(file, members))
  })
  return modules
}

function getReport (compilation, compiler, reportAssets) {
  const info = compilation.mpxBuildInfo
  const packageRoots = (info?.packageRoots || []).filter(Boolean).sort((a, b) => b.length - a.length)
  const fileModules = reportAssets && getFileModules(compilation, compiler)
  const assets = []
  const packageBytes = Object.create(null)
  const sizeSummaryBytes = { totalSize: 0, staticSize: 0, chunkSize: 0, copySize: 0 }
  compilation.getAssets().forEach(({ name, source, info: assetInfo }) => {
    if (/\.map$/i.test(name)) return
    const packageName = packageRoots.find((packageRoot) => name.startsWith(packageRoot + '/')) || 'main'
    const bytes = source.size()
    const type = assetInfo.copied ? 'copy' : jsAsset.test(name) ? 'chunk' : 'static'
    packageBytes[packageName] = (packageBytes[packageName] || 0) + bytes
    sizeSummaryBytes.totalSize += bytes
    sizeSummaryBytes[type + 'Size'] += bytes
    if (reportAssets) {
      const asset = { type, name, packageName, size: formatSize(bytes), bytes }
      if (fileModules.has(name)) asset.modules = fileModules.get(name)
      assets.push(asset)
    }
  })
  const formatEntries = (entries) => Object.fromEntries(Object.entries(entries).map(([key, bytes]) => [key, formatSize(bytes)]))
  const report = {
    backend: 'rspack',
    mode: info?.mode,
    packageBytes,
    totalBytes: sizeSummaryBytes.totalSize,
    sizeSummary: Object.assign({ sizeInfo: formatEntries(packageBytes) }, formatEntries(sizeSummaryBytes))
  }
  if (reportAssets) report.assetsSizeInfo = { assets: assets.sort((a, b) => b.bytes - a.bytes) }
  return report
}

function checkThreshold (compilation, report, threshold, ignored) {
  if (threshold == null) return
  const totalBudget = parseSize(threshold.size ?? threshold)
  const ignoredBytes = (ignored || []).reduce((total, name) => total + (report.packageBytes[name] || 0), 0)
  const total = report.totalBytes - ignoredBytes
  if (totalBudget != null && total > totalBudget) {
    compilation.errors.push(new Error(`[Mpx size-report] 总包体积 ${total}B 超过阈值 ${totalBudget}B`))
  } else if (threshold.preWarningSize && totalBudget != null) {
    compilation.warnings.push(new Error(`[Mpx size-report] 总包剩余 ${totalBudget - total}B`))
  }
  const budgets = threshold.packages
  if (budgets == null) return
  Object.entries(report.packageBytes).forEach(([name, bytes]) => {
    const budget = parseSize(typeof budgets === 'object' ? budgets[name] : budgets)
    if (budget != null && bytes > budget) {
      compilation.errors.push(new Error(`[Mpx size-report] ${name} 体积 ${bytes}B 超过阈值 ${budget}B`))
    }
  })
}

async function createDirectory (mkdir, directory) {
  try {
    await mkdir(directory)
  } catch (error) {
    if (error.code === 'EEXIST') return
    if (error.code !== 'ENOENT') throw error
    await createDirectory(mkdir, path.dirname(directory))
    await createDirectory(mkdir, directory)
  }
}

function applyReport (compiler, options) {
  const unsupported = webpackOnlyOptions.filter((option) => options[option])
  compiler.hooks.afterEmit.tapPromise(pluginName, async (compilation) => {
    const logger = compilation.getLogger(pluginName)
    if (unsupported.length) logger.warn(`Rspack 体积报告暂未提供配置项 ${unsupported.join(', ')}`)
    const reportPath = path.resolve(compiler.outputPath, options.filename || 'report.json')
    const reportAsset = path.relative(compiler.outputPath, reportPath).split(path.sep).join('/')
    if (compilation.getAsset(reportAsset)) throw new Error(`[Mpx size-report] 报告路径与构建产物冲突: ${reportAsset}`)
    const report = getReport(compilation, compiler, options.reportAssets)
    const serialized = JSON.stringify(report)
    const fileSystem = compiler.outputFileSystem
    await createDirectory(promisify(fileSystem.mkdir.bind(fileSystem)), path.dirname(reportPath))
    await promisify(fileSystem.writeFile.bind(fileSystem))(reportPath, serialized)
    logger.info(`Size report is generated in ${reportPath}!`)
    checkThreshold(compilation, report, options.threshold, options.ignoreSubpackages)
    if (options.server?.enable && !compiler.watchMode) {
      const startServer = require('./server')
      startServer(serialized.replace(/</g, '\\u003c'), Object.assign({ host: '127.0.0.1', port: 0, logger }, options.server))
    }
    if (options.callback) options.callback(report)
  })
}

module.exports = function pluginMpxSizeReport (options = {}) {
  return {
    name: 'mpx:size-report',
    setup (api) {
      api.modifyRspackConfig((config) => {
        config.plugins ||= []
        config.plugins.push({
          apply (compiler) {
            applyReport(compiler, options)
          }
        })
      })
    }
  }
}
