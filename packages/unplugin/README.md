# @mpxjs/unplugin

`@mpxjs/compiler` 的 unplugin 适配器。`.mpx` 先被编译成 **Vue SFC 字符串**，再交给 Vue 工具链生成 Web JS。编译器本身不产出页面 / 组件的最终 JS。

小程序 mode 的 js / 模板 / 样式 / json 只从 `compileMpxFile().files` 读取。本包的 `mpx.rspack()` / `mpx.webpack()` 仍只服务 Web。

Rspack 走 unplugin 的 **`createRspackPlugin`（原生 rspack driver）**，不是把 webpack 适配器套到 Rspack 上。插件在 `apply` 里注册一条普通的 `rspack-vue-loader` 规则和 `VueLoaderPlugin`，不改 `Compilation`、不加 Dependency、不用假 asset 当消息总线，也不 `require('webpack/lib/*')`。

`transformInclude` 只匹配不带 query 的 `.mpx`。`page.mpx?vue&type=script` 这类 Vue 区块请求留给 `rspack-vue-loader`。

## 跑 Rspack demo

在仓库根目录：

```sh
npm install
npm run build -w @mpxjs/compiler
npm run build -w @mpxjs/unplugin
npm run demo:rspack -w @mpxjs/unplugin
```

产物在 `packages/unplugin/examples/web/dist/`（`index.html` + `main.js`）。用静态服务器打开该目录，页面应显示标题 **MPX Web**、列表项 **Alpha**、子组件 **child: nested**。

入口是 `examples/web/src/main.js`，它引入 `packages/compiler/fixtures/page.mpx`。完整配置在 `examples/web/rspack.config.js`：

```js
const mpx = require('@mpxjs/unplugin')

plugins: [
  mpx.rspack({ mode: 'web' })
]
```

本仓库根目录还装着给 `@mpxjs/webpack-plugin` 用的 Vue 2，示例因此把 `vue` alias 到 `@mpxjs/unplugin` 依赖的 Vue 3。只安装 Vue 3 的工程不需要这个 alias。

等价入口：`require('@mpxjs/unplugin/rspack').rspack(options)`。

`mpx.rspack()` 在 `mode: 'web'`（默认）时会自己挂上 `rspack-vue-loader`（`experimentalInlineMatchResource: true`），并在未设置时打开 `experiments.css`，让 SFC 的 `<style>` 走 Rspack 原生 CSS。不要再注册第二个 `VueLoaderPlugin`。示例配置里同样写了 `experiments.css: true`。

## React Native

`mode` 取 `ios`、`android` 或 `harmony` 时，transform 直接产出 RN JS 模块，**不会**注册 `rspack-vue-loader`。页面、组件和异步分包都是普通模块请求，不改 `Compilation`。

```js
plugins: [
  mpx.rspack({
    mode: 'ios',
    rnConfig: { projectName: 'demo', supportSubpackage: true }
  })
]
```

Rspack demo 不跑真机。它把 fixture 打成 Node bundle，并把 `react`、`react-native`、`@mpxjs/core` 和 RN 内建组件标成 external，用来确认产物里有 render 函数和页面数据。

```sh
npm run build -w @mpxjs/compiler
npm run build -w @mpxjs/unplugin
npm run demo:rspack:rn -w @mpxjs/unplugin
```

产物在 `packages/unplugin/examples/rn/dist/main.js`。配置是 `examples/rn/rspack.config.js`。`examples/rn/webpack.config.js` 是同一条链路的 webpack 版，测试会实际跑一遍。

宿主如果要接自定义异步 chunk 加载，需要自己提供运行时。官方插件里的 `LoadAsyncChunkRuntimeModule`（替换 webpack `loadScript`）没有移植。

## webpack

`mpx.webpack(options)` 使用 unplugin 的 webpack driver。

- `mode: 'web'`：只把 `.mpx` 变成 Vue SFC 字符串。宿主需要自行把 `vue-loader` 配到 `/\.mpx$/` 上。本切片没有 webpack Web demo。
- `mode: 'ios' | 'android' | 'harmony'`：直接把 `.mpx` 变成 RN JS 模块，不需要 `vue-loader`，也不需要改 `Compilation`。示例配置在 `examples/rn/webpack.config.js`。

## 测试

```sh
npm test -w @mpxjs/unplugin
```

包含 transform 过滤，以及用 Rspack 打出 web bundle、用 Rspack / webpack 打出 RN bundle 的用例。真机安装没有在这个环境里跑。
