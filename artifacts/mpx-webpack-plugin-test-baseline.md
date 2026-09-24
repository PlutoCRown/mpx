# `@mpxjs/webpack-plugin` 测试基线

记录当前默认分支 `master` 上、按仓库已有脚本跑出来的 `@mpxjs/webpack-plugin` 测试结果。本次只采集基线，没有改产品代码，也没有改测试断言。

## 结论

在与 CI 相同的前置构建之后，包内 Jest 套件为全绿。

| 项 | 通过 | 失败 | 跳过 / pending | todo | 合计 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Test suites | 54 | 0 | 0 | — | 54 |
| Tests | 553 | 0 | 0 | 0 | 553 |
| Snapshots | — | — | — | — | 0 |

失败文件：无。

同一套命令在 `build:tsc` 之后又跑了两次（一次普通复跑，一次 `--no-cache`），结果都是 `54 passed` / `553 passed`。

仓库没有单独的 unit / integration 脚本。集成测试是同一 Jest 项目里的一个文件，下面按路径拆开，数字来自同一次官方 JSON 结果：

| 分组 | 文件 | 通过 | 失败 | pending | todo |
| --- | ---: | ---: | ---: | ---: | ---: |
| unit（`packages/webpack-plugin/test`，不含 `test/integration`） | 53 | 545 | 0 | 0 | 0 |
| integration（`test/integration/require-async.spec.js`） | 1 | 8 | 0 | 0 | 0 |

## 环境

| 项 | 值 |
| --- | --- |
| 默认分支 | `master`（`git remote show origin` 的 HEAD branch） |
| Commit | `3ef1ee7d861711aaa0d603387276b07a32dae273` |
| Commit 说明 | `Merge branch 'master' of https://github.com/didi/mpx`（2026-09-23 19:56:40 +0800） |
| 采集日期 | 2026-09-24 |
| OS | Linux |
| Node | `v22.14.0` |
| npm | `10.9.7` |
| Jest | `29.7.0`（`@mpxjs/webpack-plugin` 通过根 devDependency 使用） |
| 包管理 | npm workspaces（根 `package.json` 的 `workspaces`）。仓库没有 `package-lock.json` / `yarn.lock` / `pnpm-lock.yaml` |

## 命令

安装与测试都使用仓库里已有的 npm scripts。Jest 额外参数只用于关掉颜色、写出 JSON，不改变用例或断言。

```bash
npm install --no-audit --no-fund
npm run build:tsc
npm test -- --colors=false --json --outputFile=/tmp/mpx-baseline/webpack-plugin-jest.json
```

第三条在 `packages/webpack-plugin` 目录执行，对应包脚本：

```json
"test": "jest --passWithNoTests"
```

等价写法是仓库根目录的 `npm test -w @mpxjs/webpack-plugin`。

`npm run build:tsc` 是根脚本，展开为：

```bash
npm run build -w @mpxjs/perf && npm run build -w @mpxjs/webpack-plugin
```

这与 `.github/workflows/test.yml` 的 `unit` job 在 `npm t` 之前执行的 `build-tsc` 步骤一致。`@mpxjs/perf` 的 `main` 指向 `dist/index.js`，该目录在 `.gitignore` 中，安装后不会出现。不先构建时，引用 `@mpxjs/perf` 的 RN 用例会在收集阶段失败。构建产物没有提交。

确认复跑（结果与上表相同，日志未另存）：

```bash
npm test -- --colors=false
npm test -- --colors=false --no-cache
```

## 范围

- 已跑：`packages/webpack-plugin` 的 Jest 配置所覆盖的 `packages/webpack-plugin/test`（含 `test/integration`）。
- 未跑：根目录 `npm test` 会连带其他 workspace 包；本次没有跑那些包。
- 未跑：`test/e2e/miniprogram-project` 与 `test/e2e/plugin-project`。它们有各自的 `npm test`，CI 的 `unit` job 会在 `copyPlugin` 和构建之后执行，但根 `package.json` 与 `@mpxjs/webpack-plugin` 的 scripts 都没有暴露这两套 e2e。本次没有新写 harness，也没有跑它们。

## 原始日志

| 文件 | 内容 |
| --- | --- |
| [artifacts/logs/webpack-plugin-test.txt](logs/webpack-plugin-test.txt) | 官方基线：`build:tsc` 之后的完整 Jest 文本输出 |
| [artifacts/logs/webpack-plugin-jest.json](logs/webpack-plugin-jest.json) | 同一次运行的 Jest JSON |
| [artifacts/logs/webpack-plugin-test-prebuild.txt](logs/webpack-plugin-test-prebuild.txt) | 未执行 `build:tsc` 时的探测日志，不是上表基线 |

文本日志使用 `.txt`，因为根目录 `.gitignore` 忽略了 `*.log`。内容与 Jest 标准输出一致，没有改写。

## 逐文件结果

路径相对于 `packages/webpack-plugin/`。状态与计数来自官方 JSON 的 `assertionResults`。

| 文件 | 套件 | 用例 | 通过 | 失败 | pending | todo |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `test/ali-compat-style.spec.js` | passed | 7 | 7 | 0 | 0 | 0 |
| `test/block-mode-src-mode.spec.js` | passed | 4 | 4 | 0 | 0 | 0 |
| `test/global-object.spec.js` | passed | 6 | 6 | 0 | 0 | 0 |
| `test/helpers.spec.js` | passed | 8 | 8 | 0 | 0 | 0 |
| `test/integration/require-async.spec.js` | passed | 8 | 8 | 0 | 0 | 0 |
| `test/platform/common/bind-this.spec.js` | passed | 8 | 8 | 0 | 0 | 0 |
| `test/platform/common/cross-platform-warning.spec.js` | passed | 18 | 18 | 0 | 0 | 0 |
| `test/platform/common/mode.spec.js` | passed | 15 | 15 | 0 | 0 | 0 |
| `test/platform/common/platform-diagnostic.spec.js` | passed | 6 | 6 | 0 | 0 | 0 |
| `test/platform/common/style-strip-condition.spec.js` | passed | 32 | 32 | 0 | 0 | 0 |
| `test/platform/common/wx-if.spec.js` | passed | 34 | 34 | 0 | 0 | 0 |
| `test/platform/wx/json/app.spec.js` | passed | 12 | 12 | 0 | 0 | 0 |
| `test/platform/wx/json/component.spec.js` | passed | 2 | 2 | 0 | 0 | 0 |
| `test/platform/wx/json/page.spec.js` | passed | 16 | 16 | 0 | 0 | 0 |
| `test/platform/wx/style/process-styles-rn.spec.js` | passed | 1 | 1 | 0 | 0 | 0 |
| `test/platform/wx/style/style-rn.spec.js` | passed | 75 | 75 | 0 | 0 | 0 |
| `test/platform/wx/template/ad.spec.js` | passed | 2 | 2 | 0 | 0 | 0 |
| `test/platform/wx/template/button.spec.js` | passed | 4 | 4 | 0 | 0 | 0 |
| `test/platform/wx/template/common.spec.js` | passed | 3 | 3 | 0 | 0 | 0 |
| `test/platform/wx/template/event-rn.spec.js` | passed | 8 | 8 | 0 | 0 | 0 |
| `test/platform/wx/template/page-container.spec.js` | passed | 1 | 1 | 0 | 0 | 0 |
| `test/platform/wx/template/picker.spec.js` | passed | 1 | 1 | 0 | 0 | 0 |
| `test/platform/wx/template/scroll-view.spec.js` | passed | 16 | 16 | 0 | 0 | 0 |
| `test/platform/wx/template/wxs.spec.js` | passed | 2 | 2 | 0 | 0 | 0 |
| `test/react-process-styles-src-mode.spec.js` | passed | 1 | 1 | 0 | 0 | 0 |
| `test/resolver-add-mode.spec.js` | passed | 5 | 5 | 0 | 0 | 0 |
| `test/runtime/create-template-component.spec.js` | passed | 4 | 4 | 0 | 0 | 0 |
| `test/runtime/i18n.spec.js` | passed | 5 | 5 | 0 | 0 | 0 |
| `test/runtime/react-native/hover.spec.ts` | passed | 1 | 1 | 0 | 0 | 0 |
| `test/runtime/react-native/mpx-image-size.spec.ts` | passed | 21 | 21 | 0 | 0 | 0 |
| `test/runtime/react-native/mpx-keyboard-avoiding-view.spec.ts` | passed | 3 | 3 | 0 | 0 | 0 |
| `test/runtime/react-native/mpx-picker.spec.ts` | passed | 11 | 11 | 0 | 0 | 0 |
| `test/runtime/react-native/mpx-view-background-image.spec.ts` | passed | 21 | 21 | 0 | 0 | 0 |
| `test/runtime/react-native/mpx-view-gradient.spec.ts` | passed | 8 | 8 | 0 | 0 | 0 |
| `test/runtime/react-native/split-style-props.spec.ts` | passed | 5 | 5 | 0 | 0 | 0 |
| `test/runtime/react-native/text-percent-pass-through.spec.ts` | passed | 14 | 14 | 0 | 0 | 0 |
| `test/runtime/react-native/transform-font.spec.ts` | passed | 13 | 13 | 0 | 0 | 0 |
| `test/runtime/react-native/transform-shorthand.spec.ts` | passed | 43 | 43 | 0 | 0 | 0 |
| `test/runtime/react-native/use-transform-style-default.spec.ts` | passed | 15 | 15 | 0 | 0 | 0 |
| `test/runtime/react-native/use-transform-style-gap-percent.spec.ts` | passed | 5 | 5 | 0 | 0 | 0 |
| `test/runtime/react-native/use-transform-style-outline-none.spec.ts` | passed | 13 | 13 | 0 | 0 | 0 |
| `test/runtime/react-native/use-transform-style-transform.spec.ts` | passed | 1 | 1 | 0 | 0 | 0 |
| `test/runtime/web/util.spec.js` | passed | 1 | 1 | 0 | 0 | 0 |
| `test/template-compiler/compile-wx-template-fragment.spec.js` | passed | 3 | 3 | 0 | 0 | 0 |
| `test/template-compiler/custom-built-in-components.spec.js` | passed | 3 | 3 | 0 | 0 | 0 |
| `test/template-compiler/rn-process-template.spec.js` | passed | 8 | 8 | 0 | 0 | 0 |
| `test/template-compiler/rn-template.spec.js` | passed | 21 | 21 | 0 | 0 | 0 |
| `test/template-compiler/trans-dynamic-class-expr.spec.js` | passed | 4 | 4 | 0 | 0 | 0 |
| `test/template-compiler/unocss-scan.spec.js` | passed | 4 | 4 | 0 | 0 | 0 |
| `test/template-compiler/web-template.spec.js` | passed | 11 | 11 | 0 | 0 | 0 |
| `test/util/index.spec.js` | passed | 4 | 4 | 0 | 0 | 0 |
| `test/util/visitor-merge.spec.js` | passed | 14 | 14 | 0 | 0 | 0 |
| `test/web-compat-style.spec.js` | passed | 1 | 1 | 0 | 0 | 0 |
| `test/wxml-loader.spec.js` | passed | 1 | 1 | 0 | 0 | 0 |

## 未构建时的探测（不是基线）

只执行 `npm install`、不执行 `npm run build:tsc` 时，同一次 `npm test` 的 Jest 汇总是：

```text
Test Suites: 5 failed, 49 passed, 54 total
Tests:       2 failed, 487 passed, 489 total
Snapshots:   0 total
```

489 比基线少 64，是因为有 4 个套件在加载阶段失败，里面的用例没有计入 `Tests`。

加载失败（`Cannot find module '@mpxjs/perf'`）：

- `test/runtime/react-native/mpx-image-size.spec.ts`（从 `lib/runtime/components/react/mpx-image.tsx` 解析失败）
- `test/runtime/react-native/mpx-view-background-image.spec.ts`
- `test/runtime/react-native/mpx-view-gradient.spec.ts`
- `test/runtime/react-native/text-percent-pass-through.spec.ts`

断言失败（`expect(stats.hasErrors()).toBe(false)`，received `true`）：

- `test/ali-compat-style.spec.js` › `should prepend compatibility styles before generated, external and inline styles`（约第 162 行）
- `test/ali-compat-style.spec.js` › `should generate the app style without an app style module`（约第 175 行）

这两条断言失败没有在随后三次 `build:tsc` 之后的运行里复现（含 `--no-cache`）。基线数字以上面的全绿结果为准。没有为了让探测变绿而改测试或改产品代码。
