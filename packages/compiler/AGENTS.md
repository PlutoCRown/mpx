# @mpxjs/compiler

Mpx 的独立编译器包。包含三部分能力：

1. **跨端平台规则**（template / style / JSON 转换规则），从 `@mpxjs/webpack-plugin` 提取为 strict TypeScript，不依赖 webpack Compilation patches 或 Dependency hacks。
2. **Web SFC 编译**（`mode: 'web'`），产物是 Vue SFC 字符串（`result.code`）。
3. **小程序资产编译**：离散资产 `result.files`（`js` / 模板后缀 / 样式后缀 / `json`）。后缀见 [src/modes.ts](src/modes.ts)，与 webpack-plugin `typeExtMap` 去掉点号后一致。覆盖 wx / ali / swan / qq / tt / qa / jd / dd / ks。

## 入口

- [src/index.ts](src/index.ts)：导出平台规则 API、`applyPlatformRules` hook、`compileMpxFile`、`miniProgramAssets`
- [src/compile.ts](src/compile.ts)：模式校验；Web 区块挑选与 SFC 组装
- [src/compile-mini.ts](src/compile-mini.ts)：小程序四资产序列化
- [src/modes.ts](src/modes.ts)：目标 mode 与模板/样式资产名
- [src/select.ts](src/select.ts)：按 mode 选 template / script / json，并筛 style
- [src/json-block.ts](src/json-block.ts) / [src/eval-json-js.ts](src/eval-json-js.ts)：`application/json` 走 `JSON.parse`。`<script name="json">` 按官方方式执行 `module.exports`
- [src/platform.ts](src/platform.ts)：冻结签名 `applyPlatformRules(input, { type, mode, srcMode })`，内部委托真实 `getRulesRunner`
- [src/parse-sfc.ts](src/parse-sfc.ts) / [src/html.ts](src/html.ts)：`.mpx` 区块扫描
- [src/template.ts](src/template.ts)：仅 Web。微信模板指令到 Vue 模板
- [src/script.ts](src/script.ts)：仅 Web。`createPage` / `createComponent` 到 Vue `export default`

## 平台规则

- [src/platform/run-rules.ts](src/platform/run-rules.ts)：规则引擎
- [src/platform/create-diagnostic.ts](src/platform/create-diagnostic.ts)：诊断信息格式化
- [src/platform/compiler-bridge.ts](src/platform/compiler-bridge.ts)：CompilerBridge 依赖注入（未注入时提供默认 stub）
- [src/platform/types.ts](src/platform/types.ts)：TypeScript 类型定义
- [src/platform/template/wx/](src/platform/template/wx/)：模板转换规则 + 组件配置（strict TS）
- [src/platform/style/wx/](src/platform/style/wx/)：样式转换规则（strict TS）
- [src/platform/json/wx/](src/platform/json/wx/)：JSON 配置转换规则（strict TS）

### 工具函数

- [src/utils/](src/utils/)：`hump-dash`、`dom-tag-config`、`string`、`env` 等

## 行为摘要

- JSON：`application/json` 用 `JSON.parse`；`<script name="json">` 走 `evalJsonJs`
- Web：`transformTemplate` + `buildScript` → Vue SFC
- 小程序：选中区块原文 → `applyPlatformRules` → `{ js, <template>, <style>, json }`

适配器在 `@mpxjs/unplugin`。本包禁止引用 `webpack`、`@rspack/core`、`webpack/lib/*`。

## 测试

- Web：`__tests__/compile-web-sfc.test.ts`
- wx：`__tests__/compile-wx-assets.test.ts`
- 其它小程序 mode：`__tests__/compile-mini-assets.test.ts`
- `<script name="json">`：`__tests__/compile-json-js.test.ts`

```bash
npm run build   # rm -rf dist && tsc → dist/
npm test        # jest --config jest.config.json
```
