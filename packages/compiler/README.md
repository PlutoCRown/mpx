# @mpxjs/compiler

把 `.mpx` 编译成与打包器无关的结果。

- `mode: 'web'`：页面 / 组件的产物是 **Vue SFC 字符串**（`result.code`）。
- `mode: 'wx'`：产物是微信小程序的四份离散资产（`result.files`：`js` / `wxml` / `wxss` / `json`）。

两条路径都不直接生成最终 bundle，也不依赖 webpack / Rspack。

## API

```ts
import { compileMpxFile } from '@mpxjs/compiler'

const web = compileMpxFile(source, {
  mode: 'web',
  srcMode: 'wx',
  resourcePath: '/abs/path/page.mpx',
  ctorType: 'page', // 可省略，从 createPage / createComponent / Page / Component 推断
  context: '/project' // resourcePath 为相对路径时使用
})

web.code // Vue SFC
web.watchFiles

const wx = compileMpxFile(source, {
  mode: 'wx',
  srcMode: 'wx',
  resourcePath: '/abs/path/page.mpx',
  context: '/project',
  platform: {
    // 可选。默认恒等。跨端模板/样式/json 规则从这里接入，不在本切片里实现。
    template: (wxml, ctx) => wxml,
    style: (wxss, ctx) => wxss,
    json: (json, ctx) => json
  }
})

wx.files.js
wx.files.wxml
wx.files.wxss
wx.files.json
wx.watchFiles
```

`srcMode` 省略时按 `'wx'`。其它 `srcMode`、以及 `wx` / `web` 以外的 `mode`，当前会直接抛错。

## Web 会改写什么

fixture：`fixtures/page.mpx`、`fixtures/child.mpx`。

- 顶层 `<template>` / `<script>` / `<style>` / `<script type="application/json">`
- `mode="web"` 的区块优先；`mode="wx"` 的 template / style 丢弃
- `view`→`div`，`text`→`span`，`image`→`img`，`block`→`template`
- `wx:if` / `wx:elif` / `wx:else` / `wx:for` / `wx:key`
- `bindtap`→`@click`，`catchtap`→`@click.stop`
- 整段 `{{ }}` 属性绑定
- `createPage` / `createComponent` 的对象字面量（含对象形式的 `data`）收成 `export default`
- `usingComponents` 收成对 `.mpx` 的 import 和 `components`

## wx 会产出什么

同一组 fixture。区块按 `mode="wx"` 优先、无 mode 次之；其它 mode 的 template / script / json 丢弃，style 只保留无 mode 与 `mode="wx"`。

- `files.js`：选中的 `<script>` 原文，不改写成 Vue，也不注入运行时包装
- `files.wxml`：选中的 `<template>` 原文
- `files.wxss`：命中的 `<style>` 原文按出现顺序拼接
- `files.json`：`<script type="application/json">` 解析后再 `JSON.stringify`。没有 json 区块时是 `{}`
- `watchFiles`：源文件，加上 `usingComponents` 里相对路径（无后缀时补 `.mpx`）

`platform` 在写出 wxml / wxss / json 之前调用，默认什么都不改。脚本不经过这个 hook。

## 这个切片不做的事

- 模板 AST、`wx:if` 静态折叠、`@mode` 属性筛选、组件属性/事件的跨端规则表
- `<script name="json">` 里的 JS / `module.exports`（会在 JSON.parse 失败时说明这一点）
- 样式预处理（`lang` 原样进入 wxss）、wxs、`src` 外链 template
- ali / swan / qq / tt / jd / web 以外目标的小程序产物，以及 ios / android / harmony
- 把四份 wx 资产接进 unplugin 的模块图（`@mpxjs/unplugin` 仍只服务 Web Vue SFC）

## 测试

```sh
npm test -w @mpxjs/compiler
```
