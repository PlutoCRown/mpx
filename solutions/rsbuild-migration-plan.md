# Mpx 迁移到 Rsbuild 的实施计划

## 1. 交付范围与升级决策

**一次交付 Mpx 的 Rsbuild/Rspack 构建链路，并同步替换 `mpx-cli-service` 的构建后端。** 范围覆盖现有小程序目标、Web/SSR 和 RN/DRN。按功能拆分工作包，每个工作包有独立验收，同次完成跨仓集成和发布验证。现有 Webpack 构建用于行为对照和旧项目回退。

| 升级项 | 实现决策 |
| --- | --- |
| Webpack → Rsbuild + Rspack | Rsbuild 负责配置、命令、多目标编排和 build/watch。Rspack 负责模块图、入口、chunk 和打包。Mpx 负责各平台的编译语义和输出协议。 |
| Webpack 插件 → 共享编译逻辑 + 两种构建适配 | 提取实际需要复用的 SFC、模板、样式、JSON/JSONJS、`script setup` 和平台规则。共享逻辑通过显式上下文使用文件系统、解析、依赖登记与诊断，返回编译结果和资源记录。Webpack 和 Rspack 分别处理各自的构建对象和生命周期。 |
| JS → TS | 新的适配器、配置契约、资源记录、入口和分包状态使用 TS。现有 JS 编译器、Babel/PostCSS 和运行时代码按原实现复用，按调用点抽取共享边界。 |
| JS → Rust | 本次使用原版 Rspack 的 Rust 打包核心，Mpx 自定义的编译和适配采用 JS/TS。真实项目剖析如果发现纯计算热点，再评估独立 Rust 模块的端到端收益和分发成本。若主要成本来自 Node-API 边界访问，先评估批量读写和减少调用。 [Rspack JS API 架构](https://rspack.rs/api/javascript-api/architecture) |
| Vue CLI → Rsbuild | `mpx-cli` 仓库同步交付新的 Service、CLI 入口、项目预设和模板。保留现有命令契约，平台默认配置由 Mpx 的 Rsbuild 插件提供。 |

## 2. 功能工作包

| 工作包 | 范围 | 独立验收 |
| --- | --- | --- |
| 1. 共享编译逻辑 | SFC 解析、区块选择、模板、样式、JSON/JSONJS、`script setup`、平台规则、诊断。 | 同一输入对照区块内容、资源记录、错误与依赖。覆盖外链 `src`、JSONJS 递归依赖、预处理顺序和 source map。 |
| 2. 解析、入口与分包归属 | 条件文件、npm/原生资源、App/Page/Component/Plugin 入口，主包、普通分包和独立分包，部分编译规则。 | 同一个组件在单包、跨包共享和独立包下归属正确。新增、改名、删除、移动分包后，入口清单和落盘文件一致。 |
| 3. 脚本改写与编译常量 | `require.async`、路径标记、构造器和 API 改写、逐模块常量及 source map。 | 覆盖局部变量遮蔽、CommonJS/ESM 导出、压缩后的异步加载、条件编译及映射位置。 |
| 4. 小程序产物与运行时 | 离散 JSON、模板、样式、WXS/SJS、静态资源，chunk 包装、相对路径和平台加载。 | 各现有小程序目标跑编译和产物检查。微信开发者工具与真机验证普通分包、独立分包、异步分包和 WXS 执行。 |
| 5. Web 与 SSR | Vue 2.7 SFC、样式、路由、异步 chunk、SSR 客户端 manifest 和服务端 bundle。 | 浏览器能启动、导航和异步加载。SSR 能渲染、注水，既有部署入口能加载 client/server 产物。 [Rsbuild Vue 2 插件](https://v2.rsbuild.rs/plugins/list/) |
| 6. RN/DRN | RN 模板和样式、externals、异步 chunk/重试、刷新协议、DRN 宿主和原生工程产物接入。 | iOS、Android、Harmony 分别编译，在对应宿主检查首屏、异步分包及开发刷新。标准 RN 工程与 DRN 的入口和目录契约分别验收。 |
| 7. Rsbuild 接入与 `mpx-cli-service` | Mpx 插件、CLI 服务和模板、目标参数、配置转换、落盘 watch、缓存及旧产物清理。 | 现有命令通过新后端执行，单目标和多目标得到正确目录和退出状态。`inspect`、连续 watch、报错恢复与跨进程缓存分别验收。 |
| 8. 插件生态与宿主集成 | UnoCSS、size-report、控制中心、业务自定义 loader，迁移诊断、文档及 Skill。 | 验证 UnoCSS 样式注入、体积统计和控制中心开关。用 `ut-otter` 和 `mp-apphome` 核对配置、关键产物和运行路径。 [UnoCSS 实现](../packages/unocss-plugin/AGENTS.md) · [size-report 实现](../packages/size-report/AGENTS.md) |

## 3. 架构与关键 API

- **编译上下文与数据。** 拆分 `compilation.__mpx__` 的职责。共享编译逻辑接收源文件、`mode`、`srcMode`、`env`、`defs` 和文件依赖接口，并返回内容、依赖、诊断及资源记录。入口、包归属、路径和产物映射归当前 compilation 管理。缓存只存可重放的普通数据，文件变更、配置变更或依赖删除时都能重建映射。向 UnoCSS 和 size-report 提供所需的模板与产物信息。 [现有编译状态和模块划分](../packages/webpack-plugin/AGENTS.md)
- **解析、入口与模块身份。** 用现有 JSON/JSONJS 求值和条件解析收集初始入口及分包约束。需要在 Rspack 初始化前知道的分包配置从这些记录生成。编译中后续发现的入口在 `finishMake` 用 `EntryPlugin.createDependency()` 和 `compilation.addEntry()` 补齐，队列按现有可观测语义处理主包和分包。进入模块图前确定需隔离的模块身份，并沿请求显式传递包归属。对共享模块按实际引用关系确定归属，单独验证独立包和跨包共享。 [JSON 读取](../packages/webpack-plugin/lib/utils/get-json-content.js) · [现有入口记录](../packages/webpack-plugin/lib/json-compiler/helper.js) · [Rspack `finishMake`](https://rspack.rs/api/plugin-api/compiler-hooks#finishmake)
- **区块请求和源代码转换。** 复用 selector 和子请求编排，使用 `matchResource`、`resourceQuery` 和互斥规则选择 loader 链。用 AST 转换承接原 Webpack parser hook 的源码语义。编译器生成的 `require.extract`、`__mpx_dynamic_entry__` 等内部协议分别改为资源记录、入口登记和标准模块请求。逐模块常量在源码转换阶段生成，保留诊断和 source map。 [现有子请求](../packages/webpack-plugin/lib/helpers.js) · [Rspack `matchResource`](https://rspack.rs/api/loader-api/inline-match-resource)
- **产物和加载。** 模板、JSON、样式等片段在 `processAssets` 有序合并，核对索引冲突并回填最终路径。WXS 需要单 chunk、受限语法、正确导出与子编译依赖。小程序和 DRN 的 chunk 加载各自遵循目标运行时协议。新增 Webpack/Rspack 对照以路径、包归属和实际行为为准，允许模块 ID 与打包器生成的内部代码不同。 [现有提取](../packages/webpack-plugin/lib/extractor.js) · [WXS 子编译](../packages/webpack-plugin/lib/wxs/loader.js) · [Rspack `processAssets`](https://rspack.rs/api/plugin-api/compilation-hooks#processassets) · [Rspack chunk 加载](https://rspack.rs/config/output#outputchunkloading)
- **Rsbuild 插件边界。** `mode`、`srcMode`、`env`、`defs`、分包规则与 Mpx 入口类型归 Mpx。alias、输出目录与常规构建选项归 Rsbuild。用 `modifyRspackConfig` 注入适配器，使用 Rsbuild 自带的 Rspack。小程序和 RN 显式配置输出格式、chunk、静态文件和 JS/CSS 规则。通过 `inspect` 检查 HTML、浏览器运行时、CSS 和资源默认规则是否符合各目标。 [Rsbuild 插件开发](https://rsbuild.rs/plugins/dev/) · [Rspack 配置接入](https://rsbuild.rs/guide/configuration/rspack)

## 4. `mpx-cli` 跨仓交付

`mpx` 仓库维护共享编译逻辑、Rspack 适配和 Rsbuild 插件。`mpx-cli` 仓库维护 `@mpxjs/mpx-cli-service`、目标解析、项目预设和模板。当前 Service 修改 Vue CLI 原型，`vue-cli-plugin-mpx` 的 build/watch 直接调用 Webpack。新 Service 改用 Rsbuild 的 JavaScript API，由 Mpx 插件提供平台构建能力。 [现有 Service](https://github.com/mpx-ecology/mpx-cli/blob/b4030d7ac409c02fad67150848512c9790b38082/packages/mpx-cli-service/lib/Service.js) · [现有 build 实现](https://github.com/mpx-ecology/mpx-cli/blob/b4030d7ac409c02fad67150848512c9790b38082/packages/vue-cli-plugin-mpx/commands/build/index.js)

| 内容 | 交付要求 |
| --- | --- |
| 命令与目标 | 保留 `mpx-cli-service`、`build`、`serve`、`inspect`、`build:ssr`、`serve:ssr`，以及 `--targets=wx,ali`、`--targets=wx:didi`、`--mode`、`--env` 等现有使用契约。区分构建模式、Mpx 目标和目标环境，验证多目标的配置、输出隔离及失败退出状态。 |
| 开发与产物 | 小程序 `serve` 走落盘 watch，Web `serve` 走 dev server。保持平台项目配置、插件/云函数工程目录、SSR 产物和 RN 构建目录的可用性。对现有开发者工具配置更新流程验证实际行为。 [平台配置与 RN 产物接入](https://github.com/mpx-ecology/mpx-cli/blob/b4030d7ac409c02fad67150848512c9790b38082/packages/vue-cli-plugin-mpx/utils/symlink.js) |
| 项目配置与模板 | 新模板生成 `rsbuild.config.*` 和新版命令。旧 `mpx.config.js` 中的声明式配置由迁移工具转换。给 `chainWebpack`、`configureWebpack`、Vue CLI 插件钩子及依赖 Webpack 配置的调用点报出用途和迁移位置。迁移已有的 SSR、TypeScript、ESLint、测试等预设接入。 |
| 真实项目 | `ut-otter` 覆盖小程序、控制中心开关及实际依赖的宿主配置。`mp-apphome` 覆盖小程序、Web、DRN 及其 `--mini`、`--fast`、`--drn` 等扩展。业务参数由项目扩展解析。新旧命令用同一份 Mpx 源码和配置语义对照。 |

## 5. 兼容与废弃清单

### 5.1 退役旧工具链专属机制和已失效选项

| 项目 | 源码证据与处理 |
| --- | --- |
| loader 的 `transRpx` | 2018 年已有旧写法，2020 年引入 `transRpxRules` 并标记废弃。当前旧字段只触发警告。迁移时提示使用 `transRpxRules`，新 loader 不提供旧字段。 [旧字段](../packages/webpack-plugin/lib/index.js) · [标准配置](../docs-vitepress/api/compile.md) |
| `forceDisableBuiltInLoader` | 2020 年引入，供应旧版 `vue-loader` 接入使用。当前核心已删除配置读取，`mp-apphome` 和 `ut-otter` 的 DRN 配置仍传入。迁移时删除字段，通过显式 loader 规则表达项目真正需要的处理链。 [引入提交](https://github.com/didi/mpx/commit/a5b704555) · [删除提交](https://github.com/didi/mpx/commit/87341c50e) |
| `enableAliRequireAsync` | 2024 年改为支付宝默认支持并删除选项，`mp-apphome` 配置仍有该字段。删字段，保留支付宝原生异步分包行为与 `disableRequireAsync` 的现有语义。 [默认开启的提交](https://github.com/didi/mpx/commit/10e71c696) |
| `DllPlugin`、`DllReferencePlugin`、`build:dll` | 2020 年引入的 Webpack 专属预编译工作流。抽查两个宿主均未发现该调用。Rsbuild 链路停止支持 Mpx DLL 包装和旧 manifest，给存量项目迁移提示。持久缓存承担重复编译优化，分包规则承担产物拆分。 [现有 DLL 文档](../docs-vitepress/guide/advance/dll-plugin.md) |
| size-report 对 Webpack 3/4 chunk 的兼容 | 旧 `webpackJsonp`、WebWorker 等历史产物形状退出 Rsbuild 报告链路。改读结构化的 chunk、模块和资源信息，报告继续验证模块与产物体积。 [旧产物解析分支](../packages/size-report/src/utils/parse-asset.js) |
| `scrollOptions.observeDOM` | 2021 年已撤掉实际行为。当前 Web `scroll-view` 会报警告并强制传给 BetterScroll `false`，`mp-apphome` 仍存在 4 处配置。迁移时清理业务配置，验收滚动和内容更新。 [Web 滚动实现](../packages/webpack-plugin/lib/runtime/components/web/mpx-scroll-view.vue) |
| `hackResolveBuildDependencies` | 2022 年加入的 Webpack `FileSystemInfo` 补丁。改用 Rspack 的显式缓存依赖与失效策略，验证配置、锁文件、依赖文件变化后的正确性。 [Rspack 缓存配置](https://rspack.rs/config/cache) |
| Vue CLI 原型补丁与 Webpack 特有协议 | 退役 Service/PluginAPI 原型重写、`webpack-chain` 空选项占位、内部配置队列插入和旧 Webpack parser 定位回退。业务插件接入 Rsbuild 的配置与构建钩子。内部的 `require.extract`、`__mpx_dynamic_entry__` 和自定义 Dependency 随适配层替换。 [旧配置补丁](https://github.com/mpx-ecology/mpx-cli/blob/b4030d7ac409c02fad67150848512c9790b38082/packages/vue-cli-plugin-mpx/config/index.js) |

### 5.2 一次性转换与调用方验证

| 旧写法 | 新写法及边界 |
| --- | --- |
| `modeRules` | 转为 `srcModeRules`。旧字段始于 2019 年，当前是别名。新模板只生成 `srcModeRules`，同时移除旧 CLI 默认注入的 `modeRules: {}`。两字段同时出现时提示冲突。依赖旧条件文件跳过转换的完整原生模板要显式声明 `srcModeRules` 或 `src-mode`。 [当前条件编译文档](../docs-vitepress/guide/cross-platform/conditional.md) |
| `@_mode` | 用模板解析识别条件段并转为 `@mode`，覆盖组合条件和带环境的属性。此写法始于 2024 年，当前两者等价。抽查在 `mp-apphome` 匹配到 38 个文件，`ut-otter` 也有组合写法。扫描发布包携带的模板源码，第三方包完成兼容前在解析入口保留别名。 [指令语义](../docs-vitepress/api/directives.md) |
| 布尔 `checkUsingComponents` 与顶层 `transSubpackageRules` | 分别转成 `checkUsingComponentsRules` 和 `rnConfig.transSubpackageRules`。已有新字段时保留其优先级。`mp-apphome` 同时传入布尔值和规则对象，迁移应保留规则对象。 [现有配置归一化](../packages/webpack-plugin/lib/index.js) |
| `partialCompile`、扁平 `partialCompileRules` 和 `page` / `component` 别名 | 新配置统一用 `partialCompileRules.pages` 和 `partialCompileRules.components`。扁平规则转换到 `pages`，保持已有的只过滤页面语义。`mp-apphome --mini` 动态生成扁平规则，要迁其生成函数，并验证被保留页面的组件依赖及占位行为。 [规则语义](../docs-vitepress/api/compile.md) · [规则实现](../packages/webpack-plugin/lib/utils/partial-compile-rules.js) |
| `mpx.config.webConfig.disablePageTransition` | 把静态赋值移到编译期的 `webConfig.disablePageTransition`，依赖运行时条件的赋值需人工复核。Web 产物已在编译期决定转场处理。RN 的同名运行时配置仍有活跃消费者。 [已废弃的 Web 写法](../docs-vitepress/api/app-config.md) · [RN 使用点](../packages/core/src/platform/createApp.ios.js) |
| CLI 的隐式目标参数和无效目标回退 | 当前无 `--targets` 时会从所有参数名猜目标，显式目标拼错也可能被过滤后回退到微信。新 CLI 统一解析 `--targets`，省略时保持默认微信，显式无效值报错。迁移工具检查旧脚本是否依赖隐式目标，并改写为显式目标。 [当前目标解析](https://github.com/mpx-ecology/mpx-cli/blob/b4030d7ac409c02fad67150848512c9790b38082/packages/cli-shared-utils/lib/target.js#L52) |

**保留仍有运行语义的能力。** `require.async(...?root=...)`、`?resolve`、JSONJS、WXS、`resolveMode` 的原生和 npm 路径语义，以及 `mode` / `srcMode` / `env` 条件编译仍由新链路实现。`require.async` 和 `?resolve` 在真实业务中有调用，分别验证分包加载和最终资源路径。对外选项、语法和命令的变更在实现时同步更新 Mpx 文档、CLI 文档及相关 Skill。 [异步分包](../docs-vitepress/guide/advance/async-subpackage.md) · [资源与配置 API](../docs-vitepress/api/compile.md) · [仓库开发约定](../AGENTS.md)

## 6. 验证证据与整体验收

- **锁定对照环境。** Mpx 主干的基线为 `@mpxjs/webpack-plugin@2.11.3`、Webpack 5.111.1，`ut-otter` 微信宿主锁定的是插件 2.11.0-beta.2、Webpack 5.94.0 和 CLI Service 2.2.30。记录宿主原始基线，使用同一份 Mpx 源码建立双链对照。当前验证组合为 Rsbuild/Rspack 2.3.3，其 Node 要求为 `^20.19.0 || >=22.12.0`。 [根依赖](../package.json) · [编译插件依赖](../packages/webpack-plugin/package.json) · [Rsbuild 2.3.3 包清单](https://github.com/web-infra-dev/rsbuild/blob/v2.3.3/packages/core/package.json)
- **已有最小实验。** Rspack 2.3.3 在 `finishMake` 中动态加入页面和后续组件，通过 `matchResource` 匹配模板 loader，在 `processAssets` 合并模板片段并回填路径，`this.importModule()` 已实测。同一 fixture 可由 `createRsbuild().build()` 用 Node 目标执行。历史提交 `1ac78bdb8` 和 `549899333` 的 Web 原型采用 Vue 3 与 Rspack 1.7.5，可参考 SFC/JSON/TS fixture。 [Rsbuild 实例 API](https://rsbuild.rs/api/javascript-api/instance#rsbuild-build)
- **补充探针。** Rspack 2.3.3 有 `compilation.addEntry`、`createChildCompiler`，未暴露原 Webpack 的 parser hook 和 `DefinePlugin.runtimeValue`。同一资源带不同包 query 可以形成不同模块，但 resolver 的 `issuer` 会丢失 query。改为显式传递后，首次出包实现了隔离，watch 有一次按预期移除引用，也曾出现通知后读到旧产物，原因待定位。完整微信产物、连续 watch、持久缓存和各平台宿主行为以正式验收为准。 [Rspack 插件兼容表](https://www.rspack.rs/plugins/webpack-built-in-plugin-support)
- **验收产物与运行。** 使用微信 fixture、`examples/mpx-subpackage`、`ut-otter` 和 `mp-apphome` 覆盖不同规模。实际校验产物目录、路径、包归属、无残留及目标端加载。现有 `require.async` 集成测试覆盖 RN/Web，可复用测试组织，微信要单独验证实际加载。同步运行涉及模块的 ESLint 和 Jest。 [现有异步分包测试](../packages/webpack-plugin/test/integration/require-async.spec.js)
- **性能对照。** 同机器、同 Node、同源码、同依赖、同压缩和 source map 设置，记录冷启动、持久缓存启动、首次出包、模板/样式/脚本/JSON 编辑到落盘的 P50/P95、峰值 RSS 和分包体积。控制中心开关分别跑，记录模块数及主要编译环节耗时。用这些数据决定是否有必要继续优化 JS/原生边界或引入独立 Rust 模块。

## 7. 本地实现与验收记录

| 工作包 | 已验证的结果 |
| --- | --- |
| 编译与入口图 | Rsbuild 复用现有 SFC、模板、样式和 JSONJS 编译逻辑。验证了条件文件、显式 `.js` 请求、递归 `packages`、入口新增和删除、独立分包运行时及 `?resolve`。 |
| 小程序 | 微信、支付宝、百度、QQ、抖音、滴滴、快手、快应用及京东的最小生产构建通过。微信用例执行了静态共享 chunk、独立分包、原生 `require.async`、WXS 和国际化。小程序普通 `import()` 保留 Promise 语义，模块随调用方打包。 |
| Web/SSR | Vue 2.7 的客户端与服务端构建、SSR manifest、服务端渲染、DOM 水合及异步路由导航通过。`mp-apphome web:webapp` 入口图发现 81 个页面，完整构建仍有多根模板、重复导入、私有模块解析和未声明的 `?resolve` 路由错误。 |
| RN/DRN | iOS、Android、Harmony 的异步 chunk 通过模拟宿主加载验证。`ut-otter` 真实入口用临时配置复刻私有 DRN 依赖及 API proxy 规则后生成三端 JS。iOS 和 Android 完成本地 Metro/Hermes 打包。Harmony 打包卡在现有 Harmony fork 与 React Native 的 `Animated` 和 `Utilities/Platform` 解析。 |
| CLI 与生态 | `mpx-cli-service` 识别 Rsbuild 配置并保留旧工程回退。实测 `wx:didi,ali` 多目标、落盘 watch、失败恢复、`--no-clean`、SSR 环境启动，以及 UnoCSS 与 size-report 产物。迁移工具自动转换静态配置和可识别的旧目标参数，动态 Vue CLI 钩子生成待迁移草案。小程序用例核对了 Rspack 跨进程缓存下的产物一致性与配置变化后的输出。 |
| 真实微信宿主 | `ut-otter` 控制中心开关分别出包，关闭时在微信开发者工具打开首页并进入搜索页，调试器显示 0 个错误，仍有组件属性类型等告警。`mp-apphome --mini=home --fast` 的隔离副本迁入旧 Webx 别名并移除重复的 `mpAuthorize` 导入后构建通过，逐一核对了 486 个路由和 2,173 个本地组件引用。 |

新包提供 TypeScript 配置声明，适配器与入口图实现仍为 JavaScript。复用 Rspack 的 Rust 核心，本次没有新增 Mpx Rust 模块。旧 Express SSR middleware、size-report 的页面归因与冗余分析、`mp-apphome` H5/DRN 宿主、Harmony 原生打包、真机验收和完整新旧性能对照仍待核验。发布验证目前完成本地打包检查。

### `mp-apphome watch:otter` 部分编译复测

同机串行执行微信生产模式 watch，启用 source map 和控制中心。Rsbuild 按规则保留匹配页面，仅在没有匹配页面的主包或分包生成一个兜底入口，同次入口发现复用文件系统解析结果。路由数从 489 降到 191。Webpack 的 201 条路由含 10 条由业务插件额外注入的 Skills 页面。`passenger` 分包在两边均保留一个兜底页。

Rsbuild 首次落盘从 58.8 秒降到 33.1 秒。对宿主开屏页模板做三次相同类型的编辑，落盘中位数从 69.9 秒降到 43.4 秒。每次均核对了输出 WXML。Webpack 首次落盘为 242.2 秒，增量构建遇到 WXS 产物冲突，缺少成功样本。
