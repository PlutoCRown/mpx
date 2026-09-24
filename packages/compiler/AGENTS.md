# @mpxjs/compiler

与 webpack / Rspack 无关的 MPX 编译核心。

- `mode: 'web'`：Vue SFC 字符串（`result.code`）
- 小程序 `mode`：离散资产 `result.files`（`js` / 模板后缀 / 样式后缀 / `json`）。后缀见 [src/modes.ts](src/modes.ts)，与 webpack-plugin `typeExtMap` 去掉点号后一致

## 入口

- [src/index.ts](src/index.ts)：导出 `compileMpxFile`、`miniProgramAssets`、`applyPlatformRules`
- [src/compile.ts](src/compile.ts)：模式校验；Web 区块挑选与 SFC 组装
- [src/compile-mini.ts](src/compile-mini.ts)：小程序四资产序列化（wx / ali / swan / qq / tt / qa / jd / dd / ks）
- [src/modes.ts](src/modes.ts)：目标 mode 与模板/样式资产名
- [src/select.ts](src/select.ts)：按 mode 选 template / script / json，并筛 style
- [src/json-block.ts](src/json-block.ts) / [src/eval-json-js.ts](src/eval-json-js.ts)：`application/json` 走 `JSON.parse`。`<script name="json">` 按官方方式执行 `module.exports`，注入 `__mpx_mode__` / `__mpx_src_mode__` / `__mpx_env__`，相对 `require` 再执行。`#/` 这类别名不解析
- [src/platform.ts](src/platform.ts)：`applyPlatformRules(input, { type, mode, srcMode })`。内部 `getRulesRunner` 目前返回空，输入原样返回。规则表只替换这个 runner，不要写进序列化函数
- [src/parse-sfc.ts](src/parse-sfc.ts) / [src/html.ts](src/html.ts)：`.mpx` 区块扫描（script/style 为 raw text）
- [src/template.ts](src/template.ts)：仅 Web。微信模板指令到 Vue 模板
- [src/script.ts](src/script.ts)：仅 Web。`createPage` / `createComponent` 对象字面量到 Vue `export default`

## 调用链

`compileMpxFile` → `parseSfc` →

- JSON：`application/json` 用 `JSON.parse`；`<script name="json">` 走 `evalJsonJs`
- Web：`transformTemplate` + `buildScript` → Vue SFC
- 小程序：选中区块原文 → `applyPlatformRules` → `{ js, <template>, <style>, json }`

适配器在 `@mpxjs/unplugin`，目前只消费 Web 的 `result.code`。本包禁止引用 `webpack`、`@rspack/core`、`webpack/lib/*`。

## 测试

`fixtures/page.mpx` 与 `fixtures/child.mpx`。

- Web：`__tests__/compile-web-sfc.test.ts`
- wx：`__tests__/compile-wx-assets.test.ts`
- 其它小程序 mode：`__tests__/compile-mini-assets.test.ts`
- `<script name="json">`：`__tests__/compile-json-js.test.ts`，夹具 `fixtures/json-part.js`
