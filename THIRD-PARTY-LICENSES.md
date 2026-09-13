# 第三方组件与开源许可证清单

> **文档版本**：v1.0
> **对应软件版本**：花生苗 Markdown 编辑器 1.0.0
> **整理日期**：2025-01-01
> **作者**：何飞　**联系方式**：微信 6731663
> **本项目许可证**：[MIT License](./LICENSE)，Copyright (c) 2025 何飞 (He Fei)

---

## 合规声明

花生苗 Markdown 编辑器（英文标识 `huashengmiao-markdown`）本体以 **MIT License** 开源发布，允许任何个人或组织免费使用、修改、分发，包括商业用途。

本软件在实现过程中使用了若干第三方开源组件。我们在此向所有开源作者与社区致以诚挚感谢，并作出如下合规声明：

1. **许可证兼容性**：本软件所使用与再分发的全部第三方组件，其许可证均为宽松型许可证（MIT、ISC、BSD-2-Clause、BSD-3-Clause、Apache-2.0、0BSD、Unlicense、BlueOak-1.0.0、Python-2.0 及 MPL-2.0/Apache-2.0 双许可），**不包含任何 GPL、AGPL、LGPL 等强传染性（copyleft）许可证**，因此可以与 MIT 许可的本项目共存并再分发。
2. **许可证原文随附**：各组件在其自身的发行包中均已附带许可证原文（`LICENSE`、`LICENSE.md`、`LICENSE-MPL` 等文件）。本清单用于集中披露名称、版本、许可证、主页与用途，便于用户与下游分发者审阅。安装包（Windows NSIS / Linux AppImage、deb、tar.gz）中一并分发本文件与本项目 `LICENSE`，构建脚本 `scripts/build.mjs` 会自动把 `LICENSE`、`THIRD-PARTY-LICENSES.md`、`README.md` 复制进产物目录。
3. **无原生模块、无运行时下载**：本项目**不使用任何需要本地编译的原生扩展模块**（native addon）。本地存储使用 Node.js 内置的 `node:sqlite` 模块，因此用户安装时无需 Python、Rust、Visual Studio 编译器等任何构建环境；软件运行期也不会下载或执行任何第三方代码。
4. **许可证保留义务**：分发本软件时，请完整保留本文件、项目根目录的 `LICENSE`，以及各第三方组件发行包内的许可证声明。Apache-2.0 组件（TypeScript、jake、ejs 等）还需注意其 `NOTICE` 文件（如有）的保留要求。
5. **版本来源**：下表版本号读取自本项目 `node_modules` 中各组件 `package.json` 的 `version` 字段，与实际安装、构建、打包时使用的版本完全一致，非按 `package.json` 中的 caret/tilde 范围推测。
6. **双许可组件的选择**：`dompurify` 采用 `MPL-2.0 OR Apache-2.0` 双许可。本项目按其 **Apache-2.0** 分支使用与再分发（Apache-2.0 为宽松许可，与 MIT 完全兼容），从而避免 MPL-2.0 的文件级 copyleft 义务。

> 若您发现本清单有遗漏或版本不符，欢迎提交 Issue 与 PR 指正。

---

## 一、运行时直接依赖

以下组件是本项目 `package.json` 中 `dependencies` 声明的直接依赖，会被 `scripts/build.mjs`（esbuild）打包进最终产物。

| 名称 | 版本 | 许可证 | 主页 | 用途 |
| --- | --- | --- | --- | --- |
| Electron | 38.8.6 | MIT | <https://github.com/electron/electron> | 跨平台桌面运行时：提供 Chromium 渲染引擎、Node.js 运行时、原生窗口、原生对话框、`printToPDF` 与页面截图能力，是实现「用户免配置安装」与「独立原生窗口」的关键 |
| markdown-it | 14.3.2 | MIT | <https://github.com/markdown-it/markdown-it> | CommonMark 规范的 Markdown 解析器内核，负责把 Markdown 源码解析为 HTML 与 token 流 |
| markdown-it-footnote | 4.0.0 | MIT | <https://github.com/markdown-it/markdown-it-footnote> | 脚注语法插件：支持 `[^1]` 引用与文末脚注区 |
| markdown-it-task-lists | 2.1.1 | ISC | <https://github.com/revin/markdown-it-task-lists> | 任务列表插件：支持 `- [ ]` / `- [x]`，渲染出可点击的复选框 |
| markdown-it-mark | 4.0.0 | MIT | <https://github.com/markdown-it/markdown-it-mark> | 高亮语法插件：`==text==` 渲染为 `<mark>` |
| markdown-it-sub | 2.0.0 | MIT | <https://github.com/markdown-it/markdown-it-sub> | 下标语法插件：`H~2~O` 渲染为 `<sub>` |
| markdown-it-sup | 2.0.0 | MIT | <https://github.com/markdown-it/markdown-it-sup> | 上标语法插件：`x^2^` 渲染为 `<sup>` |
| markdown-it-emoji | 3.1.0 | MIT | <https://github.com/markdown-it/markdown-it-emoji> | Emoji 短代码插件：`:smile:` 映射为 😄 |
| markdown-it-deflist | 3.0.1 | MIT | <https://github.com/markdown-it/markdown-it-deflist> | 定义列表插件：`术语` + `: 定义` 渲染为 `<dl>` |
| KaTeX | 0.16.47 | MIT | <https://katex.org> | 数学公式排版引擎：渲染行内公式 `$...$` 与块级公式 `$$...$$`，速度快、体积小；导出 HTML 时其字体以 base64 内联，保证单文件离线可用 |
| highlight.js | 11.12.0 | BSD-3-Clause | <https://highlightjs.org/> | 代码块语法高亮引擎，支持按语言自动识别与指定语言高亮 |
| Mermaid | 11.17.2 | MIT | <https://github.com/mermaid-js/mermaid> | 图表渲染引擎：流程图、时序图、甘特图、类图等，由 ` ```mermaid ` 代码块触发 |
| @codemirror/view | 6.43.11 | MIT | <https://codemirror.net/> | CodeMirror 6 视图层：编辑器 DOM、视口渲染、`Decoration` 装饰器 API（实时渲染的核心） |
| @codemirror/state | 6.7.4 | MIT | <https://codemirror.net/> | CodeMirror 6 状态层：文档模型、事务、选区、扩展（Extension）系统 |
| @codemirror/language | 6.12.4 | MIT | <https://codemirror.net/> | 语法树与语言支持基础设施：`syntaxTree`、`Language`、折叠与代码块高亮桥接 |
| @codemirror/lang-markdown | 6.5.2 | MIT | <https://codemirror.net/> | Markdown 语言包：基于 `@lezer/markdown` 提供 Markdown 语法树，供实时渲染装饰器遍历定位语法标记 |
| @codemirror/commands | 6.11.0 | MIT | <https://codemirror.net/> | 编辑器命令集：撤销重做、行移动、缩进、历史记录等 |
| @codemirror/search | 6.7.2 | MIT | <https://codemirror.net/> | 查找替换能力：支持正则、区分大小写、全字匹配 |
| @codemirror/autocomplete | 6.20.3 | MIT | <https://codemirror.net/> | 输入自动补全框架：支撑成对符号配对与语言提示 |
| @lezer/highlight | 1.2.3 | MIT | <https://github.com/lezer-parser/highlight> | 语法高亮的标签体系（HighlightTag）与高亮样式映射 |

---

## 二、编辑器内核的底层依赖（CodeMirror 6 生态，随上方包一同打包）

| 名称 | 版本 | 许可证 | 主页 | 用途 |
| --- | --- | --- | --- | --- |
| @lezer/common | 1.5.2 | MIT | <https://github.com/lezer-parser/common> | Lezer 增量解析器的公共基础类型 |
| @lezer/lr | 1.4.10 | MIT | <https://github.com/lezer-parser/lr> | Lezer LR 增量解析器运行时 |
| @lezer/markdown | 1.7.2 | MIT | <https://github.com/lezer-parser/markdown> | Markdown 增量语法解析器，生成供装饰器遍历的语法树节点 |
| @lezer/highlight | 1.2.3 | MIT | <https://github.com/lezer-parser/highlight> | 高亮标签定义（与直接依赖同版本） |
| @lezer/css | 1.3.6 | MIT | <https://github.com/lezer-parser/css> | CSS 语法解析器（供 Markdown 内嵌 HTML/CSS 代码块高亮） |
| @lezer/html | 1.3.13 | MIT | <https://github.com/lezer-parser/html> | HTML 语法解析器（`@codemirror/lang-html` 依赖） |
| @lezer/javascript | 1.5.4 | MIT | <https://github.com/lezer-parser/javascript> | JavaScript/TypeScript 语法解析器 |
| @codemirror/lang-html | 6.4.12 | MIT | <https://codemirror.net/> | HTML 语言包（Markdown 内嵌 HTML 与自动补全所需） |
| @codemirror/lang-css | 6.3.1 | MIT | <https://codemirror.net/> | CSS 语言包 |
| @codemirror/lang-javascript | 6.2.5 | MIT | <https://codemirror.net/> | JavaScript 语言包 |
| @codemirror/lint | 6.9.7 | MIT | <https://codemirror.net/> | 诊断信息（Lint）框架 |
| style-mod | 4.1.3 | MIT | <https://github.com/marijnh/style-mod> | 运行期注入样式表的轻量工具 |
| crelt | 1.0.7 | MIT | <https://github.com/marijnh/crelt> | 极简 DOM 元素构造工具 |
| w3c-keyname | 2.2.8 | MIT | <https://github.com/marijnh/w3c-keyname> | 把浏览器键盘事件归一化为规范键名（快捷键匹配所需） |
| @marijn/find-cluster-break | 1.0.4 | MIT | <https://github.com/marijn/find-cluster-break> | 文本字素簇边界计算（正确处理 Emoji 与组合字符的光标移动） |

---

## 三、Markdown 解析器与图表引擎的底层依赖

### 3.1 markdown-it 依赖链

| 名称 | 版本 | 许可证 | 主页 | 用途 |
| --- | --- | --- | --- | --- |
| linkify-it | 5.0.2 | MIT | <https://github.com/markdown-it/linkify-it> | 自动链接识别（把裸 URL 转为链接） |
| mdurl | 2.1.0 | MIT | <https://github.com/markdown-it/mdurl> | URL 解析与编码/解码 |
| uc.micro | 2.1.0 | MIT | <https://github.com/markdown-it/uc.micro> | Unicode 类别正则集合 |
| entities | 4.5.0 | BSD-2-Clause | <https://github.com/fb55/entities> | HTML 实体编解码 |
| argparse | 2.0.1 | Python-2.0 | <https://github.com/nodeca/argparse> | markdown-it 命令行入口的参数解析（构建期/CLI 使用） |
| punycode.js | 2.3.1 | MIT | <https://github.com/mathiasbynens/punycode.js> | 国际化域名的 Punycode 编解码（配合 mdurl） |

### 3.2 Mermaid 运行时依赖（随 `dist/renderer/mermaid.js` 打包，按需加载）

| 名称 | 版本 | 许可证 | 主页 | 用途 |
| --- | --- | --- | --- | --- |
| d3 | 7.9.0 | ISC | <https://d3js.org> | 数据驱动可视化基础库，Mermaid 图形布局与绘制的底层依赖 |
| d3-array | 3.2.4 | ISC | <https://github.com/d3/d3-array> | 数组统计与分组 |
| d3-axis | 3.0.0 | ISC | <https://github.com/d3/d3-axis> | 坐标轴绘制（甘特图等） |
| d3-brush | 3.0.0 | ISC | <https://github.com/d3/d3-brush> | 框选交互 |
| d3-chord | 3.0.1 | ISC | <https://github.com/d3/d3-chord> | 弦图布局 |
| d3-color | 3.1.0 | ISC | <https://github.com/d3/d3-color> | 颜色空间与色彩运算 |
| d3-contour | 4.0.2 | ISC | <https://github.com/d3/d3-contour> | 等值线计算 |
| d3-delaunay | 6.0.4 | ISC | <https://github.com/d3/d3-delaunay> | Delaunay 三角剖分 |
| d3-dispatch | 3.0.1 | ISC | <https://github.com/d3/d3-dispatch> | 事件分发 |
| d3-drag | 3.0.0 | ISC | <https://github.com/d3/d3-drag> | 拖拽交互 |
| d3-dsv | 3.0.1 | ISC | <https://github.com/d3/d3-dsv> | 分隔符数据解析 |
| d3-ease | 3.0.1 | BSD-3-Clause | <https://github.com/d3/d3-ease> | 缓动函数 |
| d3-fetch | 3.0.1 | ISC | <https://github.com/d3/d3-fetch> | 数据获取封装 |
| d3-force | 3.0.0 | ISC | <https://github.com/d3/d3-force> | 力导向布局 |
| d3-format | 3.1.2 | ISC | <https://github.com/d3/d3-format> | 数值格式化 |
| d3-geo | 3.1.1 | ISC | <https://github.com/d3/d3-geo> | 地理投影 |
| d3-hierarchy | 3.1.2 | ISC | <https://github.com/d3/d3-hierarchy> | 层级布局（树图、打包图） |
| d3-interpolate | 3.0.1 | ISC | <https://github.com/d3/d3-interpolate> | 插值 |
| d3-path | 3.1.0 | ISC | <https://github.com/d3/d3-path> | SVG 路径生成 |
| d3-polygon | 3.0.1 | ISC | <https://github.com/d3/d3-polygon> | 多边形几何运算 |
| d3-quadtree | 3.0.6 | ISC | <https://github.com/d3/d3-quadtree> | 四叉树空间索引 |
| d3-random | 3.0.1 | ISC | <https://github.com/d3/d3-random> | 随机数生成器 |
| d3-sankey | 0.12.3 | BSD-3-Clause | <https://github.com/d3/d3-sankey> | 桑基图布局 |
| d3-scale | 4.0.2 | ISC | <https://github.com/d3/d3-scale> | 比例尺 |
| d3-scale-chromatic | 3.1.0 | ISC | <https://github.com/d3/d3-scale-chromatic> | 配色方案 |
| d3-selection | 3.0.0 | ISC | <https://github.com/d3/d3-selection> | DOM 选择与数据绑定 |
| d3-shape | 3.2.0 | ISC | <https://github.com/d3/d3-shape> | 图形生成器 |
| d3-time | 3.1.0 | ISC | <https://github.com/d3/d3-time> | 时间刻度计算 |
| d3-time-format | 4.1.0 | ISC | <https://github.com/d3/d3-time-format> | 时间格式化 |
| d3-timer | 3.0.1 | ISC | <https://github.com/d3/d3-timer> | 动画计时器 |
| d3-transition | 3.0.1 | ISC | <https://github.com/d3/d3-transition> | 过渡动画 |
| d3-zoom | 3.0.0 | ISC | <https://github.com/d3/d3-zoom> | 缩放与平移交互 |
| delaunator | 5.1.0 | ISC | <https://github.com/mapbox/delaunator> | 快速三角剖分实现 |
| internmap | 2.0.3 | ISC | <https://github.com/mbostock/internmap> | 支持对象键的 Map/Set |
| robust-predicates | 3.0.3 | Unlicense | <https://github.com/mourner/robust-predicates> | 鲁棒几何谓词计算 |
| rw | 1.3.3 | BSD-3-Clause | <https://github.com/mbostock/rw> | 文件读写工具（CLI 场景） |
| dagre-d3-es | 7.0.14 | MIT | <https://github.com/tbo47/dagre-es> | 有向图布局（流程图核心布局算法） |
| cytoscape | 3.34.3 | MIT | <http://js.cytoscape.org> | 图论网络渲染与布局引擎 |
| cytoscape-cose-bilkent | 4.1.0 | MIT | <https://github.com/cytoscape/cytoscape.js-cose-bilkent> | CoSE-Bilkent 力导向布局扩展 |
| cytoscape-fcose | 2.2.0 | MIT | <https://github.com/iVis-at-Bilkent/cytoscape.js-fcose> | fCoSE 快速力导向布局扩展 |
| cose-base | 1.0.3 | MIT | <https://github.com/iVis-at-Bilkent/cose-base> | CoSE 布局基础实现 |
| layout-base | 1.0.2 | MIT | <https://github.com/iVis-at-Bilkent/layout-base> | 图布局通用数据结构 |
| @mermaid-js/parser | 1.2.1 | MIT | <https://github.com/mermaid-js/mermaid> | Mermaid 新版图表语法解析器 |
| @chevrotain/types | 11.1.2 | Apache-2.0 | <https://github.com/Chevrotain/chevrotain> | Chevrotain 解析器框架的类型定义（`@mermaid-js/parser` 依赖） |
| @braintree/sanitize-url | 7.1.2 | MIT | <https://github.com/braintree/sanitize-url> | URL 安全清洗，防止 `javascript:` 等危险协议（Mermaid 安全渲染环节） |
| dompurify | 3.4.15 | MPL-2.0 OR Apache-2.0 | <https://github.com/cure53/DOMPurify> | HTML/SVG 消毒库，Mermaid 渲染结果经其过滤后才注入页面（本项目按其 **Apache-2.0** 分支使用） |
| khroma | 2.1.0 | MIT | <https://github.com/fabiospampinato/khroma> | 颜色解析与转换（Mermaid 主题配色） |
| roughjs | 4.6.6 | MIT | <https://roughjs.com> | 手绘风格图形绘制 |
| es-toolkit | 1.52.0 | MIT | <https://es-toolkit.dev> | 现代化高性能工具函数库 |
| dayjs | 1.11.23 | MIT | <https://day.js.org> | 轻量日期时间库（甘特图与时间轴） |
| marked | 16.4.2 | MIT | <https://marked.js.org> | Markdown 渲染（Mermaid 内部标签文本处理） |
| stylis | 4.4.0 | MIT | <https://github.com/thysultan/stylis.js> | CSS 预处理器（Mermaid 样式注入） |
| fastdom | 1.0.12 | MIT | <https://github.com/wilsonpage/fastdom> | 批量读写 DOM，消除布局抖动 |
| ts-dedent | 2.3.0 | MIT | <https://github.com/tamino-martinius/node-ts-dedent> | 多行字符串缩进清理（Mermaid 语法模板） |
| uuid | 14.0.2 | MIT | <https://github.com/uuidjs/uuid> | 生成图表元素唯一 ID |
| @iconify/types | 2.0.0 | MIT | <https://github.com/iconify/iconify> | 图标数据类型定义 |
| @iconify/utils | 3.1.7 | MIT | <https://github.com/iconify/iconify> | 图标数据工具（Mermaid 架构图图标） |
| @upsetjs/venn.js | 2.0.0 | MIT | <https://github.com/upsetjs/venn.js> | 韦恩图绘制 |
| hachure-fill | 0.5.2 | MIT | <https://github.com/pshihn/hachure-fill> | 手绘填充算法（rough.js 依赖） |
| path-data-parser | 0.1.0 | MIT | <https://github.com/pshihn/path-data-parser> | SVG 路径数据解析 |
| points-on-curve | 0.2.0 | MIT | <https://github.com/pshihn/points-on-curve> | 曲线上的点计算 |
| points-on-path | 0.2.1 | MIT | <https://github.com/pshihn/points-on-path> | 路径上的点计算 |

---

## 四、本地存储与平台内置组件

| 名称 | 版本 | 许可证 | 主页 | 用途 |
| --- | --- | --- | --- | --- |
| Node.js（内置 `node:sqlite` 模块） | 随 Electron 38 内置（Node.js 22.x） | MIT | <https://nodejs.org> | 本地数据库访问接口 `DatabaseSync`。**使用 Node.js 内置模块而非第三方原生模块，是本项目「零原生模块、用户免编译环境」的基石** |
| SQLite（由 Node.js 内置） | 随 Node.js 内置 | Public Domain（SQLite 官方声明） | <https://www.sqlite.org> | 嵌入式关系数据库引擎，提供 FTS5 全文检索虚拟表与 WAL 日志模式 |
| Chromium | 随 Electron 38 内置 | BSD-3-Clause 及多项第三方许可 | <https://www.chromium.org> | 渲染引擎与打印引擎（`printToPDF`）、页面截图能力。完整许可清单见安装目录下 Electron 发行包中的 `LICENSES.chromium.html` |
| Node.js 运行时 | 随 Electron 38 内置 | MIT | <https://nodejs.org> | 主进程 JavaScript 运行时、文件系统与子进程能力 |
| V8 | 随 Electron 38 内置 | BSD-3-Clause | <https://v8.dev> | JavaScript / WebAssembly 执行引擎 |

---

## 五、构建与打包工具链（开发依赖，不进入用户运行路径）

以下组件仅在开发、构建与打包阶段使用，其代码**不会**出现在软件运行时的功能路径中（`electron-builder` 的打包产物仅包含 `dist/` 构建结果、`package.json` 与许可证文件）。

| 名称 | 版本 | 许可证 | 主页 | 用途 |
| --- | --- | --- | --- | --- |
| TypeScript | 5.9.3 | Apache-2.0 | <https://www.typescriptlang.org/> | 类型检查（`npm run typecheck`）与开发期类型安全 |
| esbuild | 0.24.2 | MIT | <https://github.com/evanw/esbuild> | 极速打包器：把 `src/main`、`src/preload`、`src/renderer` 分别构建为 CommonJS 与 IIFE 产物 |
| @esbuild/linux-x64 | 0.24.2 | MIT | <https://github.com/evanw/esbuild> | esbuild 的 Linux x64 原生二进制（按平台安装） |
| electron-builder | 26.15.3 | MIT | <https://github.com/electron-userland/electron-builder> | 生成 Windows NSIS 安装向导（支持自定义安装路径与快捷方式选项）与 Linux AppImage/deb/tar.gz |
| app-builder-lib | 26.15.3 | MIT | <https://github.com/electron-userland/electron-builder> | electron-builder 的核心打包库 |
| builder-util | 26.15.3 | MIT | <https://github.com/electron-userland/electron-builder> | 打包工具通用能力 |
| builder-util-runtime | 9.7.0 | MIT | <https://github.com/electron-userland/electron-builder> | 打包运行时工具 |
| dmg-builder | 26.15.3 | MIT | <https://github.com/electron-userland/electron-builder> | macOS dmg 目标支持 |
| electron-builder-squirrel-windows | 26.15.3 | MIT | <https://github.com/electron-userland/electron-builder> | Windows Squirrel 目标支持 |
| electron-publish | 26.15.3 | MIT | <https://github.com/electron-userland/electron-builder> | 发布上传支持 |
| @electron/asar | 3.4.1 | MIT | <https://github.com/electron/asar> | 生成 `app.asar` 归档 |
| @electron/fuses | 1.8.0 | MIT | <https://github.com/electron/fuses> | 配置 Electron 安全熔断开关 |
| @electron/get | 2.0.3 | MIT | <https://github.com/electron/get> | 下载 Electron 发行包（本项目通过 `.npmrc` 配置国内镜像加速） |
| @electron/notarize | 2.5.0 | MIT | <https://github.com/electron/notarize> | macOS 公证支持 |
| @electron/osx-sign | 1.3.3 | BSD-2-Clause | <https://github.com/electron/osx-sign> | macOS 代码签名 |
| @electron/universal | 2.0.3 | MIT | <https://github.com/electron/universal> | 生成 Universal 二进制 |
| @electron/windows-sign | 1.2.2 | BSD-2-Clause | <https://github.com/electron/windows-sign> | Windows 代码签名 |
| @electron/rebuild | 4.2.0 | MIT | <https://github.com/electron/rebuild> | 原生模块重编译（本项目无原生模块，实际未使用） |
| @malept/flatpak-bundler | 0.4.0 | MIT | <https://github.com/malept/flatpak-bundler> | Flatpak 打包支持（当前未启用） |
| resedit | 1.7.2 | MIT | <https://github.com/jet2jet/resedit-js> | 修改 Windows 可执行文件资源（图标、版本信息） |
| pe-library | 0.4.1 | MIT | <https://github.com/jet2jet/pe-library-js> | Windows PE 文件格式读写 |
| postject | 1.0.0-alpha.6 | MIT | <https://github.com/nodejs/postject> | 向可执行文件注入资源（Electron 相关） |
| pkijs | 3.4.0 | BSD-3-Clause | <https://github.com/PeculiarVentures/PKI.js> | 代码签名证书处理 |
| @peculiar/webcrypto | 1.7.1 | MIT | <https://github.com/PeculiarVentures/webcrypto> | WebCrypto 兼容实现（签名流程） |
| @peculiar/asn1-schema | 2.9.4 | MIT | <https://github.com/PeculiarVentures/ASN1.js> | ASN.1 结构编解码 |
| @peculiar/json-schema | 1.1.12 | MIT | <https://github.com/PeculiarVentures/json-schema> | JSON Schema 校验 |
| @peculiar/utils | 2.0.3 | MIT | <https://github.com/PeculiarVentures/peculiar-utils> | 通用工具函数 |
| asn1js | 3.0.10 | BSD-3-Clause | <https://github.com/PeculiarVentures/ASN1.js> | ASN.1 解析 |
| bytestreamjs | 2.0.1 | BSD-3-Clause | <https://github.com/PeculiarVentures/ByteStream.js> | 字节流读写 |
| webcrypto-core | 1.9.2 | MIT | <https://github.com/PeculiarVentures/webcrypto-core> | WebCrypto 核心接口定义 |
| pvtsutils | 1.3.6 | MIT | <https://github.com/PeculiarVentures/pvtsutils> | 类型与字节工具 |
| pvutils | 1.2.0 | MIT | <https://github.com/PeculiarVentures/pvutils> | 加密工具函数 |
| @xmldom/xmldom | 0.8.15 | MIT | <https://github.com/xmldom/xmldom> | XML DOM 实现（plist 处理） |
| plist | 3.1.0 | MIT | <https://github.com/TooTallNate/plist.js> | macOS plist 读写 |
| ejs | 3.1.10 | Apache-2.0 | <https://github.com/mde/ejs> | 模板渲染（NSIS 脚本与配置文件生成） |
| jake | 10.9.4 | Apache-2.0 | <https://github.com/jakejs/jake> | JavaScript 构建工具（filelist 依赖） |
| filelist | 1.0.6 | Apache-2.0 | <https://github.com/mde/filelist> | 文件列表匹配 |
| fs-extra | 8.1.0 | MIT | <https://github.com/jprichardson/node-fs-extra> | 文件系统增强 |
| glob | 7.2.3 | ISC | <https://github.com/isaacs/node-glob> | 文件通配匹配 |
| minimatch | 10.2.6 | BlueOak-1.0.0 | <https://github.com/isaacs/minimatch> | 通配符匹配实现 |
| minimist | 1.2.8 | MIT | <https://github.com/minimistjs/minimist> | 命令行参数解析 |
| semver | 6.3.1 | ISC | <https://github.com/npm/node-semver> | 语义化版本比较 |
| tar | 7.5.22 | BlueOak-1.0.0 | <https://github.com/isaacs/node-tar> | tar 归档读写（Linux tar.gz 产物） |
| minizlib | 3.1.0 | MIT | <https://github.com/isaacs/minizlib> | zlib 流封装 |
| minipass | 7.1.3 | BlueOak-1.0.0 | <https://github.com/isaacs/minipass> | 流实现 |
| chownr | 3.0.0 | BlueOak-1.0.0 | <https://github.com/isaacs/chownr> | chown 递归 |
| mkdirp | 0.5.6 | MIT | <https://github.com/isaacs/node-mkdirp> | 递归创建目录 |
| rimraf | 2.6.3 | ISC | <https://github.com/isaacs/rimraf> | 递归删除 |
| yallist | 4.0.0 | ISC | <https://github.com/isaacs/yallist> | 双向链表 |
| extract-zip | 2.0.1 | BSD-2-Clause | <https://github.com/maxogden/extract-zip> | zip 解压（下载 Electron 发行包时使用） |
| yauzl | 2.10.0 | MIT | <https://github.com/thejoshwolfe/yauzl> | zip 读取 |
| unzipper | 0.12.5 | MIT | <https://github.com/ZJONSSON/node-unzipper> | 流式 zip 解压 |
| bluebird | 3.7.2 | MIT | <https://github.com/petkaantonov/bluebird> | Promise 实现（部分打包依赖使用） |
| chalk | 4.1.2 | MIT | <https://github.com/chalk/chalk> | 终端彩色输出 |
| commander | 5.1.0 | MIT | <https://github.com/tj/commander.js> | 命令行参数框架 |
| debug | 4.4.3 | MIT | <https://github.com/debug-js/debug> | 调试日志 |
| env-paths | 2.2.1 | MIT | <https://github.com/sindresorhus/env-paths> | 平台标准目录解析 |
| fs.realpath | 1.0.0 | ISC | <https://github.com/isaacs/fs.realpath> | 路径规范化 |
| graceful-fs | 4.2.11 | ISC | <https://github.com/isaacs/node-graceful-fs> | fs 增强（错误重试） |
| http-proxy-agent | 7.0.2 | MIT | <https://github.com/TooTallNate/proxy-agents> | HTTP 代理支持 |
| https-proxy-agent | 7.0.6 | MIT | <https://github.com/TooTallNate/proxy-agents> | HTTPS 代理支持 |
| agent-base | 7.1.4 | MIT | <https://github.com/TooTallNate/proxy-agents> | Agent 基类 |
| iconv-lite | 0.6.3 | MIT | <https://github.com/ashtuchkin/iconv-lite> | 字符编码转换（打包期读取文本文件） |
| isbinaryfile | 5.0.7 | MIT | <https://github.com/gjtorikian/isBinaryFile> | 判断文件是否为二进制 |
| js-yaml | 4.3.2 | MIT | <https://github.com/nodeca/js-yaml> | YAML 解析（配置读取） |
| json5 | 2.2.3 | MIT | <https://github.com/json5/json5> | JSON5 解析 |
| lazy-val | 1.0.5 | MIT | <https://github.com/develar/lazy-val> | 惰性求值容器 |
| proper-lockfile | 4.1.2 | MIT | <https://github.com/moxystudio/node-proper-lockfile> | 文件锁 |
| read-binary-file-arch | 1.0.6 | MIT | <https://github.com/electron-userland/electron-builder> | 读取可执行文件架构 |
| sanitize-filename | 1.6.4 | WTFPL OR ISC | <https://github.com/parshap/node-sanitize-filename> | 文件名非法字符清理 |
| source-map-support | 0.5.21 | MIT | <https://github.com/evanw/node-source-map-support> | 堆栈映射 |
| sprintf-js | 1.1.3 | BSD-3-Clause | <https://github.com/alexei/sprintf.js> | 字符串格式化 |
| stat-mode | 1.0.0 | MIT | <https://github.com/TooTallNate/stat-mode> | 文件权限位转换 |
| temp / temp-file / tmp / tmp-promise | 0.9.4 / 3.4.0 / 0.2.7 / 3.0.3 | MIT | <https://github.com/bruce/node-temp> | 临时文件与目录管理 |
| tiny-async-pool | 1.3.0 | MIT | <https://github.com/rxaviers/async-pool> | 并发池 |
| truncate-utf8-bytes | 1.0.2 | WTFPL | <https://github.com/parshap/truncate-utf8-bytes> | 按字节截断 UTF-8 字符串 |
| type-fest | 0.13.1 | MIT OR CC0-1.0 | <https://github.com/sindresorhus/type-fest> | TypeScript 工具类型 |
| universalify | 0.1.2 | MIT | <https://github.com/RyanZim/universalify> | 回调/Promise 适配 |
| xmlbuilder | 15.1.1 | MIT | <https://github.com/oozcitak/xmlbuilder-js> | XML 构建 |
| yargs / yargs-parser | 17.7.3 / 21.1.1 | MIT / ISC | <https://github.com/yargs/yargs> | 命令行解析 |
| ajv | 8.20.0 | MIT | <https://github.com/ajv-validator/ajv> | JSON Schema 校验 |
| fast-deep-equal | 3.1.3 | MIT | <https://github.com/epoberezkin/fast-deep-equal> | 深比较 |
| fast-uri | 3.1.7 | BSD-3-Clause | <https://github.com/fastify/fast-uri> | URI 解析 |
| lodash | 4.18.1 | MIT | <https://lodash.com> | 工具函数库（打包依赖间接引入） |
| lodash-es | 4.18.1 | MIT | <https://lodash.com> | 工具函数库 ES 模块版（Mermaid 依赖） |
| picomatch | 4.0.7 | MIT | <https://github.com/micromatch/picomatch> | 通配符匹配 |
| tinyglobby | 0.2.17 | MIT | <https://github.com/SuperchupuDev/tinyglobby> | 快速文件匹配（打包期） |
| tinyexec | 1.3.1 | MIT | <https://github.com/tinylibs/tinyexec> | 子进程执行 |
| @antfu/install-pkg | 2.0.1 | MIT | <https://github.com/antfu/install-pkg> | 包安装辅助（Mermaid 依赖） |
| package-manager-detector | 1.8.0 | MIT | <https://github.com/antfu/package-manager-detector> | 包管理器探测 |
| jiti | 2.7.0 | MIT | <https://github.com/unjs/jiti> | 运行期 TypeScript/ESM 加载 |
| import-meta-resolve | 4.2.0 | MIT | <https://github.com/wooorm/import-meta-resolve> | ESM 解析 |
| dotenv / dotenv-expand | 16.6.1 / 11.0.7 | BSD-2-Clause | <https://github.com/motdotla/dotenv> | 环境变量加载 |
| global-agent / roarr | 3.0.0 / 2.15.4 | BSD-3-Clause | <https://github.com/gajus/global-agent> | 全局 HTTP 代理与日志 |
| undici | 6.28.1 | MIT | <https://github.com/nodejs/undici> | HTTP 客户端（@electron/get 使用） |
| got / cacheable-request 等 HTTP 依赖 | 11.8.6 / 7.0.4 | MIT | <https://github.com/sindresorhus/got> | 下载 Electron 发行包时的 HTTP 客户端 |
| node-gyp 及其依赖 | 12.4.0 | MIT | <https://github.com/nodejs/node-gyp> | 原生模块编译工具链（本项目**不涉及原生模块编译**，仅为打包依赖间接引入，实际不会执行） |
| @types/node | 22.20.2 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> | Node.js 类型定义 |
| @types/markdown-it | 14.2.0 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> | markdown-it 类型定义 |
| @types/linkify-it / @types/mdurl | 5.0.0 / 2.0.0 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> | markdown-it 依赖链的类型定义 |
| @types/d3 及其子包 | 7.4.3 等 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> | D3 类型定义（Mermaid 依赖） |
| @types/geojson | 7946.0.16 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> | GeoJSON 类型定义 |
| @types/trusted-types | 2.0.7 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> | Trusted Types 类型定义 |

> 说明：上表中标注「打包依赖间接引入」的条目来自 `electron-builder` 及其依赖树，仅在开发机执行 `npm install` / `npm run dist:*` 时存在，不会进入最终用户运行路径。完整依赖树可通过 `npm ls --all` 或 `node_modules` 目录逐项核对。

---

## 六、许可证条款要点速览

| 许可证 | 类型 | 主要义务 | 本项目中的代表组件 |
| --- | --- | --- | --- |
| MIT | 宽松 | 保留版权声明与许可证原文 | Electron、CodeMirror 6、markdown-it、KaTeX、Mermaid、esbuild |
| ISC | 宽松（等价 MIT） | 保留版权声明与许可证原文 | markdown-it-task-lists、d3 系列、glob、semver |
| BSD-2-Clause | 宽松 | 保留版权声明与免责声明 | entities、@electron/osx-sign、dotenv |
| BSD-3-Clause | 宽松 | 保留版权声明、免责声明，且不得用作者名义为衍生产品背书 | highlight.js、d3-ease、d3-sankey、pkijs、asn1js |
| Apache-2.0 | 宽松（含专利授权） | 保留版权与许可证、标注修改、保留 NOTICE（如有） | TypeScript、ejs、jake、@chevrotain/types |
| MPL-2.0 | 弱 copyleft（文件级） | 修改 MPL 文件需以 MPL 公开该文件源码 | dompurify（本项目改用其 Apache-2.0 分支） |
| 0BSD | 宽松（无署名义务） | 无实质义务 | tslib |
| Unlicense | 公共领域等效 | 无义务 | robust-predicates |
| BlueOak-1.0.0 | 宽松 | 保留许可证原文 | tar、minimatch、minipass、chownr |
| Python-2.0 | 宽松 | 保留版权声明与许可证原文 | argparse |
| WTFPL | 极宽松 | 无义务 | truncate-utf8-bytes、sanitize-filename（双许可，可取 ISC） |
| Public Domain | 公共领域 | 无义务 | SQLite |

---

## 七、分发与再分发注意事项

1. **Windows 安装包 / 便携版**：请勿删除安装目录下的 `LICENSE`、`THIRD-PARTY-LICENSES.md`、`README.md`。Electron 发行包内的 `LICENSE`、`LICENSES.chromium.html` 由 electron-builder 自动包含，不得删除。
2. **Linux 发行包**：deb 包会把上述文件安装到 `/opt/花生苗Markdown编辑器/`（或应用安装目录）；AppImage 与 tar.gz 中的许可证文件位于应用根目录，可直接查看。
3. **二次开发**：如果您基于本项目开发衍生作品，MIT 协议允许闭源再分发，但您仍需遵守上述各第三方组件的许可证（尤其是 Apache-2.0 的保留声明义务与 BSD-3-Clause 的不得背书条款）。
4. **不使用本项目名称与作者信息为您的衍生作品背书**：MIT 协议本身不授予商标权；BSD-3-Clause 组件亦明确禁止以作者名义背书。
5. **合规核对方式**：重新生成本清单只需在项目根目录执行：

   ```bash
   # 查看直接依赖的实际安装版本
   npm ls --depth=0

   # 查看某个组件 package.json 中的许可证字段
   node -e "console.log(require('./node_modules/markdown-it/package.json').license)"
   ```

---

*本文件由「花生苗 Markdown 编辑器」项目维护。作者：何飞　微信：6731663　开源协议：MIT*

---

## Shiki（代码语法高亮）

| 项目 | 内容 |
| --- | --- |
| 名称 | Shiki |
| 版本 | 4.x |
| 许可证 | MIT |
| 主页 | https://shiki.style |
| 用途 | 代码块语法高亮。使用与 VS Code 相同的 TextMate 语法，能精确区分关键字、函数名、变量、运算符、标点等语法成分。单独打包并按需加载。 |

Shiki 内含的 TextMate 语法定义来自各语言的官方仓库（多为 MIT / BSD 许可），
主题配色由本项目自行定义，未直接使用其内置主题。
