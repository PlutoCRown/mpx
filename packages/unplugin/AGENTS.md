# @mpxjs/unplugin

把 `@mpxjs/compiler` 接到打包器。Web 切片：`.mpx` → Vue SFC 字符串 → `rspack-vue-loader`。小程序离散资产不从这里发，走 `compileMpxFile().files`。

## 入口

- [src/index.ts](src/index.ts)：`rspack` / `webpack`
- [src/rspack.ts](src/rspack.ts)：`createRspackPlugin`（unplugin 原生 rspack driver）+ Vue 规则
- [src/webpack.ts](src/webpack.ts)：`createWebpackPlugin` stub
- [src/factory.ts](src/factory.ts)：`transformInclude` 只放行裸 `.mpx`，`transform` 调用 `compileMpxFile`
- [src/vue-pipeline.ts](src/vue-pipeline.ts)：为 `/\.mpx$/` 追加 `rspack-vue-loader`，并应用 `VueLoaderPlugin`
- [src/filter.ts](src/filter.ts)：`isMpxTransformId`

## 约束

- 不修改 `Compilation`，不使用 presentational Dependency、假 asset、`webpack/lib/*`
- `enforce: 'pre'`，让 Vue loader 收到的是 SFC 字符串
- demo：`examples/web`，`npm run demo:rspack`

## 测试

- `__tests__/filter.test.ts`
- `__tests__/rspack-demo.test.ts`
