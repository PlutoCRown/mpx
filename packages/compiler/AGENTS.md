# @mpxjs/compiler

与 webpack / Rspack 无关的 MPX 编译核心。当前只实现 `mode: 'web'`，产物是 Vue SFC 字符串。

## 入口

- [src/index.ts](src/index.ts)：导出 `compileMpxFile`
- [src/compile.ts](src/compile.ts)：模式校验、区块挑选、SFC 组装
- [src/parse-sfc.ts](src/parse-sfc.ts) / [src/html.ts](src/html.ts)：`.mpx` 区块扫描（script/style 为 raw text）
- [src/json.ts](src/json.ts)：`application/json` 用 `JSON.parse`；`script name="json"` 按 CommonJS 求值
- [src/template.ts](src/template.ts)：微信模板指令到 Vue 模板
- [src/script.ts](src/script.ts)：`createPage` / `createComponent` 对象字面量到 Vue `export default`，并保留 `lang="ts"`

## 调用链

`compileMpxFile` → `parseSfc` → `transformTemplate` + `buildScript` → Vue SFC 字符串。

适配器在 `@mpxjs/unplugin`。本包禁止引用 `webpack`、`@rspack/core`、`webpack/lib/*`。

## 测试

`fixtures/page.mpx`、`child.mpx`、`json-module.mpx`、`json-literal.mpx`、`json-pure.mpx`、`script-ts.mpx`，用例在 `__tests__/compile-web-sfc.test.ts`。
