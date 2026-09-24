# @mpxjs/compiler

把 `.mpx` 编译成与打包器无关的结果。

- `mode: 'web'`：页面 / 组件的产物是 **Vue SFC 字符串**（`result.code`）。
- 小程序 `mode`：产物是四份离散资产（`result.files`：`js`、模板、样式、`json`）。模板和样式的字段名是该平台文件后缀，不带点，与 `@mpxjs/webpack-plugin` 的 `typeExtMap` 一致。

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
  context: '/project'
})

wx.files.js
wx.files.wxml
wx.files.wxss
wx.files.json
wx.watchFiles

const ali = compileMpxFile(source, {
  mode: 'ali',
  srcMode: 'wx',
  resourcePath: '/abs/path/page.mpx'
})

ali.files.js
ali.files.axml
ali.files.acss
ali.files.json
```

`srcMode` 省略时按 `'wx'`。其它 `srcMode` 会直接抛错。`miniProgramAssets` 列出当前支持的小程序 mode 和资产名：

| mode | 模板 | 样式 |
| --- | --- | --- |
| `wx` | `wxml` | `wxss` |
| `ali` | `axml` | `acss` |
| `swan` | `swan` | `css` |
| `qq` | `qml` | `qss` |
| `tt` | `ttml` | `ttss` |
| `qa` | `qxml` | `css` |
| `jd` | `jxml` | `jxss` |
| `dd` | `ddml` | `ddss` |
| `ks` | `ksml` | `css` |

`ios` / `android` / `harmony`（RN）以及没有 `typeExtMap` 的 `tenon` 会抛错。Web 仍走 Vue SFC，不进这张表。

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

## 小程序会产出什么

同一组 fixture。区块按当前 `mode` 优先、无 mode 次之；其它 mode 的 template / script / json 丢弃，style 只保留无 mode 与当前 `mode`。`page.mpx` 里 `mode="wx"` 的模板因此只进入 `mode: 'wx'`，`ali` 等目标拿到的是无 mode 的那一份原文。

- `files.js`：选中的 `<script>` 原文，不改写成 Vue，也不注入运行时包装
- `files.<template>`：选中的 `<template>` 原文。微信是 `wxml`，支付宝是 `axml`，其余见上表
- `files.<style>`：命中的 `<style>` 原文按出现顺序拼接。微信是 `wxss`，百度 / 快应用 / 快手是 `css`
- `files.json`：见下方 JSON 区块。没有 json 区块时是 `{}`
- `watchFiles`：源文件，json 脚本里解析到的相对 `require`，以及 `usingComponents` 里的相对路径（无后缀时补 `.mpx`）

写出模板、样式、json 之前会调用 `applyPlatformRules(input, { type, mode, srcMode })`。`type` 是 `'template' | 'style' | 'json'`，`mode` 是目标平台，`srcMode` 是源码方言。当前 `getRulesRunner` 为空，输入原样返回，所以 `wx:if` 出现在 `axml` 里也不会被改成 `a:if`。规则表只替换这个 runner。页面 `<script>` 不经过它。

## JSON 区块

- `<script type="application/json">`：`JSON.parse`
- `<script name="json">`：当作 JS 执行，读取 `module.exports`，再按 JSON 收成普通对象。可以写注释、`const`、`if`，以及 `require('./relative')`（被引用文件同样按 json JS 执行，并进入 `watchFiles`）
- 执行时能读到 `__mpx_mode__`（当前 `mode`）、`__mpx_src_mode__`（当前 `srcMode`）、`__mpx_env__`（`env` 选项，省略则是 `undefined`）。`defs` 里的其它标识符也会注入；与这三项同名时以这三项为准
- `#/` 开头的 `require` 会直接报错。自定义别名不在这个切片里解析

Web 和小程序共用这套结果：Web 把 `usingComponents` 收成组件 import，其余字段放进 `__mpxPageConfig`；小程序把整个对象写进 `files.json`。

## 这个切片不做的事

- 模板 AST、`wx:if` 静态折叠、`@mode` 属性筛选、组件属性/事件的跨端规则表（`applyPlatformRules` 的 runner 仍是空的）
- json 脚本里的 TypeScript，以及 `#/` 等路径别名
- 样式预处理（`lang` 原样进入样式资产）、wxs、`src` 外链 template
- `tenon`，以及 ios / android / harmony
- 把小程序离散资产接进 unplugin 的模块图（`@mpxjs/unplugin` 仍只服务 Web Vue SFC）

## 测试

```sh
npm test -w @mpxjs/compiler
```
