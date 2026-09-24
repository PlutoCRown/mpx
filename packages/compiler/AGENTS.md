# @mpxjs/compiler

与 webpack / Rspack 无关的 MPX 编译核心。

- `mode: 'web'`：Vue SFC 字符串（`result.code`）
- `mode: 'wx'`：离散资产 `result.files`（`js` / `wxml` / `wxss` / `json`）

## 入口

- [src/index.ts](src/index.ts)：导出 `compileMpxFile`
- [src/compile.ts](src/compile.ts)：模式校验；Web 区块挑选与 SFC 组装
- [src/compile-wx.ts](src/compile-wx.ts)：wx 四资产序列化
- [src/select.ts](src/select.ts)：按 mode 选 template / script / json，并筛 style
- [src/json-block.ts](src/json-block.ts)：只解析 JSON 文本。`<script name="json">` 的 JS / `module.exports` 不在这里做
- [src/platform.ts](src/platform.ts)：`platform` hook 的默认恒等实现。跨端模板 / 样式 / json 规则表从 `CompileMpxFileOptions.platform` 接入，不要写进序列化函数
- [src/parse-sfc.ts](src/parse-sfc.ts) / [src/html.ts](src/html.ts)：`.mpx` 区块扫描（script/style 为 raw text）
- [src/template.ts](src/template.ts)：仅 Web。微信模板指令到 Vue 模板
- [src/script.ts](src/script.ts)：仅 Web。`createPage` / `createComponent` 对象字面量到 Vue `export default`

## 调用链

`compileMpxFile` → `parseSfc` →

- Web：`transformTemplate` + `buildScript` → Vue SFC
- wx：选中区块原文 → `platform` hook → `{ js, wxml, wxss, json }`

适配器在 `@mpxjs/unplugin`，目前只消费 Web 的 `result.code`。本包禁止引用 `webpack`、`@rspack/core`、`webpack/lib/*`。

## 测试

`fixtures/page.mpx` 与 `fixtures/child.mpx`。

- Web：`__tests__/compile-web-sfc.test.ts`
- wx：`__tests__/compile-wx-assets.test.ts`
