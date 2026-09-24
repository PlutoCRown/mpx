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

- 顶层 `<template>` / `<script>` / `<style>` / `<script type="application/json">`
- `mode="web"` 的区块优先；`mode="wx"` 的 template / style 丢弃
- `view`→`div`，`text`→`span`，`image`→`img`，`block`→`template`
- `wx:if` / `wx:elif` / `wx:else` / `wx:for` / `wx:key`
- `bindtap`→`@click`，`catchtap`→`@click.stop`
- 整段 `{{ }}` 属性绑定
- `createPage` / `createComponent` 的对象字面量（含对象形式的 `data`）收成 `export default`
- `usingComponents` 收成对 `.mpx` 的 import 和 `components`

不包含：小程序离散产物、RN、分包、wxs、`src` 外链 template、运行时重写。

## 测试

```sh
npm test -w @mpxjs/compiler
```
