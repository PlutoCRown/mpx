# @mpxjs/compiler

Mpx 的独立编译器包。包含四部分能力：

1. **跨端平台规则**（template / style / JSON 转换规则），从 `@mpxjs/webpack-plugin` 提取为 strict TypeScript，不依赖 webpack Compilation patches 或 Dependency hacks。
2. **Web SFC 编译**（`mode: 'web'`），产物是 Vue SFC 字符串（`result.code`）。
3. **小程序资产编译**：离散资产 `result.files`（`js` / 模板后缀 / 样式后缀 / `json`）。后缀见 [src/modes.ts](src/modes.ts)，与 webpack-plugin `typeExtMap` 去掉点号后一致。覆盖 wx / ali / swan / qq / tt / qa / jd / dd / ks。
4. **React Native 编译**（`mode: 'ios' | 'android' | 'harmony'`），产物是 RN JS 模块（`result.code`）。

平台规则只有 `src/platform` 这一份。RN 路径禁止再复制规则表到 `src/react`。

## 入口

- [src/index.ts](src/index.ts)：导出平台规则 API、`applyPlatformRules` hook、`compileMpxFile`、`compileToReact`、`compileReactTemplate`、`miniProgramAssets`、`supportedModes`、`isReact` / `isReactMode`
- [src/compile.ts](src/compile.ts)：按 mode 分发（RN → 小程序 → Web）
- [src/compile-mini.ts](src/compile-mini.ts)：小程序四资产序列化
- [src/modes.ts](src/modes.ts)：目标 mode、模板/样式资产名、`ReactMode` / `isReactMode`
- [src/select.ts](src/select.ts)：按 mode 选 template / script / json，并筛 style
- [src/json-block.ts](src/json-block.ts) / [src/eval-json-js.ts](src/eval-json-js.ts)：`application/json` 走 `JSON.parse`。`<script name="json">` 按官方方式执行 `module.exports`
- [src/platform.ts](src/platform.ts)：冻结签名 `applyPlatformRules(input, { type, mode, srcMode })`，内部委托真实 `getRulesRunner`
- [src/parse-sfc.ts](src/parse-sfc.ts) / [src/html.ts](src/html.ts)：Web / 小程序 `.mpx` 区块扫描
- [src/template.ts](src/template.ts)：仅 Web。微信模板指令到 Vue 模板
- [src/script.ts](src/script.ts)：仅 Web。`createPage` / `createComponent` 到 Vue `export default`
- [src/react/](src/react/)：RN 路径。JSON 直接调用本包 `getRulesRunner`。模板 AST 与样式 class map 仍调用 webpack-plugin 的 template compiler / `getClassMap`；这两个函数内部的 `lib/platform` 是转到本包的薄封装

## 平台规则

- [src/platform/run-rules.ts](src/platform/run-rules.ts)：规则引擎
- [src/platform/create-diagnostic.ts](src/platform/create-diagnostic.ts)：诊断信息格式化
- [src/platform/compiler-bridge.ts](src/platform/compiler-bridge.ts)：CompilerBridge 依赖注入（未注入时提供默认 stub）
- [src/platform/types.ts](src/platform/types.ts)：TypeScript 类型定义
- [src/platform/template/wx/](src/platform/template/wx/)：模板转换规则 + 组件配置（strict TS）
- [src/platform/style/wx/](src/platform/style/wx/)：样式转换规则（strict TS）
- [src/platform/json/wx/](src/platform/json/wx/)：JSON 配置转换规则（strict TS）
- [src/utils/](src/utils/)：`hump-dash`、`dom-tag-config`、`string`、`env` 等

模板规则在 `getRulesRunner({ type: 'template' })` 时会读取 `CompilerBridge`。webpack-plugin 的 `lib/platform/index.js` 在第一次调用前注入。JSON 与直接 `runRules` 不依赖这个桥。

`src/react/host.ts` 不在模块顶层加载 template compiler / style-helper，避免 `@mpxjs/compiler` 与 webpack-plugin 的平台封装循环引用。

## 行为摘要

- JSON：`application/json` 用 `JSON.parse`；`<script name="json">` 走 `evalJsonJs`
- Web：`transformTemplate` + `buildScript` → Vue SFC
- 小程序：选中区块原文 → `applyPlatformRules` → `{ js, <template>, <style>, json }`
- RN：`compileMpxFile` / `compileToReact` → `parseComponent` → template render + style class map + JSON 依赖 + 脚本壳 → 单个 JS 模块。`ctorType: 'app'` 且未传 `isApp` 时先输出 `AppRegistry` 外壳，外壳 `require` 同一个文件的 `?mpxRnApp=1`

适配器在 `@mpxjs/unplugin`。本包禁止引用 `webpack`、`@rspack/core`、`webpack/lib/*`。

RN 模板编译器使用模块级状态，`compileToReact` 不是可重入的。

## 测试

- Web：`__tests__/compile-web-sfc.test.ts`
- RN：`__tests__/compile-react.test.ts`
- wx：`__tests__/compile-wx-assets.test.ts`
- 其它小程序 mode：`__tests__/compile-mini-assets.test.ts`
- `<script name="json">`：`__tests__/compile-json-js.test.ts`
- 规则入口：`__tests__/platform-rules.test.ts`（只检查 runner 是否接上，不断言规则表内容）

```bash
npm run build   # rm -rf dist && tsc → dist/
npm test        # jest --config jest.config.json
```
