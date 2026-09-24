# @mpxjs/compiler

把 `.mpx` 编译成与打包器无关的结果。

- `mode: 'web'`：页面 / 组件的产物是 **Vue SFC 字符串**（`result.code`）。
- 小程序 `mode`：产物是四份离散资产（`result.files`：`js`、模板、样式、`json`）。模板和样式的字段名是该平台文件后缀，不带点，与 `@mpxjs/webpack-plugin` 的 `typeExtMap` 一致。
- `mode: 'ios' | 'android' | 'harmony'`：产物是 **React Native JS 模块**（`result.code`）。

三条路径都不直接生成最终 bundle，也不依赖 webpack / Rspack。

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

没有 `typeExtMap` 的 `tenon` 会抛错。Web 走 Vue SFC；`ios` / `android` / `harmony` 走 RN 路径，都不进这张表。

## React Native

```ts
import { compileMpxFile, compileToReact } from '@mpxjs/compiler'

const result = compileToReact(source, {
  mode: 'ios', // 'android' | 'harmony'
  srcMode: 'wx',
  resourcePath: '/abs/path/page.mpx',
  ctorType: 'page', // 可省略，从 createApp / createPage / createComponent 推断
  rnConfig: {
    projectName: 'demo',
    supportSubpackage: true
  }
})

result.code // RN JS 模块
result.watchFiles
result.errors // 模板 / 样式 / JSON 诊断；适配器会据此中断 transform
```

产物与 `@mpxjs/webpack-plugin` 的 react 模式同一类：

- `global.currentInject.render = function (createElement, getComponent) { ... }`
- 样式收成 `__getClassStyle` / `__getAppClassStyle`，rpx 变成 `_f(n, 'rpx')`
- `usingComponents` / `pages` / `subPackages` 收成普通 `require()` 或 `import(/* webpackChunkName */)`
- 用户脚本内联在 `currentInject` 赋值之后，最后 `export default global.__mpxOptionsMap[moduleId]`
- `createApp` 文件默认先输出 `AppRegistry` 外壳；`isApp: true`（或请求带 `mpxRnApp`）才编译 app 本体

JSON 直接调用本包的 `getRulesRunner` / `applyPlatformRules` 共享规则表，不在 `src/react` 再抄一份。`compileReactTemplate` 对应 webpack-plugin 的 `react/template-loader`，给 `<import src>` 的模板文件用。

这个切片没有做、也不通过改 `Compilation` 补上的部分：

- `LoadAsyncChunkRuntimeModule`、`RetryRuntimeModule`、`@refresh reset`、`__mpxPageConfigsMap` 注入、异步 chunk 缓存清理
- presentational dependency、动态 entry、`importModule` 样式子请求
- wxs loader、i18n.wxs、`<script setup>`、非 js 的 script lang、外链 template
- UnoCSS class map 的占位符替换（`hasUnoCSS: true` 只输出同样的占位函数）
- 真机 / Metro 整包构建

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

写出模板、样式、json 之前会调用 `applyPlatformRules(input, { type, mode, srcMode })`。`type` 是 `'template' | 'style' | 'json'`，`mode` 是目标平台，`srcMode` 是源码方言。规则表在 `src/platform`；页面 `<script>` 不经过它。

## JSON 区块

- `<script type="application/json">`：`JSON.parse`
- `<script name="json">`：当作 JS 执行，读取 `module.exports`，再按 JSON 收成普通对象。可以写注释、`const`、`if`，以及 `require('./relative')`（被引用文件同样按 json JS 执行，并进入 `watchFiles`）
- 执行时能读到 `__mpx_mode__`（当前 `mode`）、`__mpx_src_mode__`（当前 `srcMode`）、`__mpx_env__`（`env` 选项，省略则是 `undefined`）。`defs` 里的其它标识符也会注入；与这三项同名时以这三项为准
- `#/` 开头的 `require` 会直接报错。自定义别名不在这个切片里解析

Web 和小程序共用这套结果：Web 把 `usingComponents` 收成组件 import，其余字段放进 `__mpxPageConfig`；小程序把整个对象写进 `files.json`。RN 则走 `getRulesRunner({ type: 'json' })` 后再生成依赖 require。

## 这个切片不做的事

- json 脚本里的 TypeScript，以及 `#/` 等路径别名
- 样式预处理（`lang` 原样进入样式资产）、wxs、`src` 外链 template
- `tenon`
- 把小程序离散资产接进 unplugin 的模块图（`@mpxjs/unplugin` 服务 Web Vue SFC 与 RN JS 模块）

## 测试

```sh
npm test -w @mpxjs/compiler
```
