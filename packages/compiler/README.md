# @mpxjs/compiler

把 `.mpx` 编译成与打包器无关的结果。当前切片只实现 **Web**：页面 / 组件的产物是 **Vue SFC 字符串**（`<template>` / `<script>` / `<style>`），不直接生成最终 Web JS，也不依赖 webpack / Rspack。

## API

```ts
import { compileMpxFile } from '@mpxjs/compiler'

const result = compileMpxFile(source, {
  mode: 'web',
  srcMode: 'wx',
  resourcePath: '/abs/path/page.mpx',
  ctorType: 'page', // 可省略，从 createPage / createComponent / Page / Component 推断
  context: '/project' // resourcePath 为相对路径时使用
})

result.code // Vue SFC
result.watchFiles // 源文件 + JSON usingComponents 解析出的相对路径
```

`mode` 目前只能是 `'web'`。`srcMode` 省略或 `'wx'` 时，模板按微信指令（`wx:if`、`bindtap` 等）改写。

## 这个切片会改写什么

fixture：`fixtures/page.mpx`、`fixtures/child.mpx`。

- 顶层 `<template>` / `<script>` / `<style>` / `<script type="application/json">` / `<script name="json">`
- `mode="web"` 的区块优先；`mode="wx"` 的 template / style 丢弃
- `view`→`div`，`text`→`span`，`image`→`img`，`block`→`template`
- `wx:if` / `wx:elif` / `wx:else` / `wx:for` / `wx:key`
- `bindtap`→`@click`，`catchtap`→`@click.stop`
- 整段 `{{ }}` 属性绑定
- `createPage` / `createComponent`（含 `createComponent<Props>()`、参数上的 `as` / `satisfies`）的对象字面量收成 `export default`；对象形式的 `data` 收成函数
- `<script lang="ts">` / `lang=ts` / `lang="typescript"` 输出为 `<script lang="ts">`，`import type`、`PropType` 等类型语法原样保留给 Vue / Rspack
- `<script name="json">` 按 JS 求值（`module.exports = { ... }`、对象字面量、相对 `require`）。求值时 `__mpx_mode__` 为 `web`，`__mpx_src_mode__` 为 `srcMode`，`__mpx_env__` 为 `''`
- `<script type="application/json">` 仍走 `JSON.parse`，不会当脚本执行
- `usingComponents` 收成对 `.mpx` 的 import 和 `components`

不包含：小程序离散产物、RN、分包、wxs、`src` 外链 template、运行时重写。

## 测试

```sh
npm test -w @mpxjs/compiler
```
