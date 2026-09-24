# @mpxjs/unplugin

把 `@mpxjs/compiler` 接到打包器。

- Web：`.mpx` → Vue SFC 字符串 → `rspack-vue-loader`
- RN（`ios` | `android` | `harmony`）：`.mpx` → RN JS 模块。transform 就是最终脚本，不再挂 Vue loader
- 小程序离散资产不从这里发，走 `compileMpxFile().files`

## 入口

- [src/index.ts](src/index.ts)：`rspack` / `webpack`
- [src/rspack.ts](src/rspack.ts)：`createRspackPlugin`。Web 时追加 Vue 规则；RN 时不追加
- [src/webpack.ts](src/webpack.ts)：`createWebpackPlugin`。Web 只产出 SFC 字符串；RN 直接产出 JS 模块
- [src/factory.ts](src/factory.ts)：`transformInclude` 在 Web 只放行裸 `.mpx`，在 RN 额外放行 `mpxRnApp` / `isPage` / `isComponent` / `mpxRnTemplate` 查询
- [src/vue-pipeline.ts](src/vue-pipeline.ts)：Web 为 `/\.mpx$/` 追加 `rspack-vue-loader`，并应用 `VueLoaderPlugin`
- [src/filter.ts](src/filter.ts)：`isMpxTransformId` / `isRnMpxId`

## 约束

- 不修改 `Compilation`，不使用 presentational Dependency、假 asset、`webpack/lib/*`
- RN 的异步分包是普通 `import()` 加 `webpackChunkName` 注释，不注册 `LoadAsyncChunkRuntimeModule`
- Web 使用 `enforce: 'pre'`，让 Vue loader 收到的是 SFC 字符串
- demo：`examples/web`（`npm run demo:rspack`）、`examples/rn`（`npm run demo:rspack:rn`）

## 测试

- `__tests__/filter.test.ts`
- `__tests__/rspack-demo.test.ts`
- `__tests__/rspack-rn.test.ts`
- `__tests__/webpack-rn.test.ts`
