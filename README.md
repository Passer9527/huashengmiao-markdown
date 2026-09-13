# 🌱 花生苗 Markdown 编辑器

> **开源免费 · 所见即所得（Typora 类）· 跨平台 · 轻量高性能的 Markdown 编辑器**

[![License](https://img.shields.io/badge/License-MIT-22a06b?style=flat-square)](./LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-0078d4?style=flat-square)](#-安装说明)
[![Electron](https://img.shields.io/badge/Electron-38-47848f?style=flat-square)](https://www.electronjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square)](https://www.typescriptlang.org/)
[![CodeMirror](https://img.shields.io/badge/CodeMirror-6-d30707?style=flat-square)](https://codemirror.net/)
[![markdown--it](https://img.shields.io/badge/markdown--it-14-1f883d?style=flat-square)](https://github.com/markdown-it/markdown-it)
[![node:sqlite](https://img.shields.io/badge/Storage-node%3Asqlite%20FTS5-003b57?style=flat-square)](https://nodejs.org/)
[![Version](https://img.shields.io/badge/Version-1.0.0-f0a020?style=flat-square)](./CHANGELOG.md)
[![No Native Modules](https://img.shields.io/badge/Native%20Modules-0-success?style=flat-square)](#-常见问题-faq)

**花生苗 Markdown 编辑器**（英文标识 `huashengmiao-markdown`）是一款**完全开源免费**的桌面 Markdown 写作工具。
它像 Typora 一样「边写边排版」——光标所在行显示 Markdown 源码，其余行直接呈现最终排版效果；
同时内置代码高亮、LaTeX 公式、Mermaid 图表、全文检索、版本历史与多格式导出，
并且**下载安装包双击即用，无需安装 Node.js、Python 或任何编译环境**。

---

## 👤 作者与联系方式

| 项目 | 信息 |
| --- | --- |
| **作者** | **何飞** |
| **联系方式** | **微信：6731663** |
| 开源协议 | MIT License |
| 版权声明 | Copyright (c) 2025 何飞 (He Fei) |
| 项目主页 | <https://github.com/Passer9527/huashengmiao-markdown> |
| 软件版本 | 1.0.0 |

> 📮 使用中遇到问题、有功能建议，或希望参与共建，欢迎通过**微信 6731663**联系作者，也可直接提交 Issue 与 Pull Request。
> 我们尤其欢迎中文文档改进、快捷键方案分享与主题 CSS 投稿。

---

## 📖 开源信息

| 项目 | 说明 |
| --- | --- |
| 开源协议 | **MIT License**（宽松许可，允许自由使用、修改、分发，含商业用途） |
| 是否收费 | **完全免费**，无内购、无订阅、无功能阉割、无账号体系 |
| 是否需要联网 | **不需要**。所有编辑、检索、导出功能完全离线可用 |
| 是否上传数据 | **不会**。本地优先，默认不上传任何用户数据（详见[数据与隐私](./docs/用户手册.md)） |
| 源码开放 | 全部源码开源，**中文注释**，文件头标注作者与联系方式 |
| 第三方组件 | 全部为宽松型开源协议（MIT / ISC / BSD / Apache-2.0），见 [`THIRD-PARTY-LICENSES.md`](./THIRD-PARTY-LICENSES.md) |

**欢迎参与共建**：

- 🐛 发现 Bug？请提交 Issue，并附上 `日志目录` 中的日志文件（菜单「帮助 → 打开日志目录」）
- 💡 有新想法？欢迎在 Issue 中描述使用场景
- 🔧 想写代码？请先阅读[贡献指南](#-贡献指南)，再提交 Pull Request
- 🎨 做了好看的主题？欢迎把 CSS 文件分享给社区

---

## ✨ 功能特性

### 一、编辑与实时渲染

| 特性 | 说明 |
| --- | --- |
| 🖋 **Typora 式实时渲染** | 光标所在行显示 Markdown 源码，其余行直接显示排版结果，写作即排版 |
| ⌨️ **一键源码模式** | `Ctrl/Cmd + /` 在「实时渲染」与「纯 Markdown 源码」之间瞬时切换 |
| 🎯 **专注模式** | `F8` 隐藏侧边栏与状态栏，非当前段落按可调强度淡化，只留下你和文字 |
| 🖨 **打字机模式** | `F9` 当前编辑行始终垂直居中，视线不必上下移动 |
| ⛶ **全屏** | `F11` 进入全屏无干扰写作 |
| 🔍 **查找替换** | 支持**正则表达式**、**区分大小写**、**全字匹配**，逐个替换与全部替换，实时显示匹配计数 |
| ↩️ **撤销重做** | 完整撤销重做栈，按输入批次合并，长文档亦可放心编辑 |
| 🧠 **智能续写** | 列表回车自动续接、空项回车退出列表、表格 Tab 跳格并自动补行 |
| ✍️ **输入自动补全** | 成对符号自动配对；选中文字后输入符号可自动包裹 |
| 💾 **自动保存** | 定时（可配置 1–600 秒）+ 失焦 + 关闭前自动保存，标题栏未保存标记实时提示 |
| 🗂 **多标签页** | 同时打开多个文档，标签切换、关闭、拖拽排序、未保存标记 |
| 📊 **状态栏统计** | 字数、词数、行数、阅读时长、光标行列、选中字符数实时显示 |

### 二、Markdown 语法支持

| 分类 | 支持内容 |
| --- | --- |
| **基础语法** | 标题 H1–H6（含 Setext 形式）、粗体、斜体、粗斜体、删除线、行内代码、有序/无序列表、任务列表（复选框可点击）、引用块（可嵌套）、代码块（围栏式与缩进式）、水平分割线、链接（含自动链接与引用式链接）、图片、GFM 表格（支持对齐）、转义字符 |
| **代码高亮** | 代码块基于 highlight.js 自动高亮，右上角显示语言名 |
| **数学公式** | 行内公式 `$E=mc^2$` 与块级公式 `$$ ... $$`，基于 **KaTeX** 渲染，支持居中与编号 |
| **图表** | Mermaid：流程图、时序图、甘特图、类图，使用 ` ```mermaid ` 代码块 |
| **脚注** | `[^1]` 语法，自动生成文末脚注区 |
| **目录** | `[TOC]` 根据标题层级自动生成可点击目录 |
| **上标 / 下标** | `x^2^` 与 `H~2~O` |
| **高亮** | `==文字==` 渲染为高亮底色 |
| **Emoji** | `:smile:` 等短代码自动映射为 😄 |
| **Front Matter** | YAML 元数据（`---` 包裹）折叠展示，不干扰正文 |
| **定义列表** | `术语` + `: 定义`，渲染为 `<dl>` 结构 |

> 完整的语法速查表（含每一种语法的写法与渲染效果）见 [`docs/用户手册.md` 第 4 章](./docs/用户手册.md)。

### 三、文件与工作区

| 特性 | 说明 |
| --- | --- |
| 📁 **文件树工作区** | 打开文件夹作为工作区，目录树展开/折叠，自动忽略 `node_modules`、`.git` 等无关目录 |
| 🧭 **文档大纲** | 侧边栏实时显示 H1–H6 层级结构，滚动位置高亮，点击即跳转 |
| 🔎 **全局搜索** | 跨文件全文检索，基于 SQLite **FTS5** 全文索引 + LIKE 中文兜底双通道，命中片段高亮 |
| ⚡ **快速打开** | `Ctrl/Cmd + P` 模糊搜索工作区内文件名 |
| 🕘 **最近文件** | 持久化记录最近打开的文件（含打开次数），支持一键清空，失效记录自动清理 |
| 🚚 **拖拽导入** | 把文件或文件夹拖进窗口即可打开；也支持拖到应用图标上打开 |
| 🔄 **外部修改检测** | 文件被其他程序改动时主动提示，避免覆盖他人改动 |
| 🌐 **编码兼容** | UTF-8（含 BOM）优先；严格解码失败时自动回退 **GBK**，Windows 遗留中文文档可正常打开 |
| ↵ **换行符保持** | LF / CRLF 自动识别，保存时保持原文件风格，避免整文件差异 |
| ♻️ **会话恢复** | 启动时自动恢复上次关闭时的标签页与工作区 |

### 四、主题与外观

| 特性 | 说明 |
| --- | --- |
| 🎨 **6 款内置文档主题** | GitHub（默认）、Newsprint（报刊）、Night（夜色）、Pixyll（简约）、Whitey（纯白）、Vue（青绿） |
| 🌈 **5 款代码高亮主题** | GitHub、Dracula、Monokai、One Dark、Solarized Light |
| 🌗 **明暗模式** | 浅色 / 深色 / **跟随系统** 一键切换 |
| 🧩 **自定义 CSS 主题** | 导入任意 `.css` 文件即成为新主题，可自由覆盖 25 个 CSS 变量 |
| 🔠 **排版可调** | 正文字体、代码字体、字号（10–40 px）、行高、正文页宽、全宽模式、段落间距、行号、侧边栏宽度 |

### 五、图片处理

| 特性 | 说明 |
| --- | --- |
| 📋 **粘贴 / 拖拽自动保存** | 截图粘贴、拖拽图片进编辑器即自动落盘并插入引用 |
| 📂 **四种保存策略** | 文档同级 `assets` 目录（相对路径，默认）/ 文档同级目录 / 指定绝对目录 / 仅插入网络地址 |
| 🏷 **命名模板** | 支持 `{yyyy}` `{MM}` `{dd}` `{hhmmss}` `{rand}` `{name}` 六种占位符 |
| 🔐 **SHA-256 去重** | 内容相同的图片自动复用既有文件，不重复占用磁盘 |
| 📐 **尺寸自动解析** | 自动读取 PNG / JPEG / GIF / BMP / WebP 宽高，写入 Markdown 时可带上尺寸 |
| 🗃 **资源登记入库** | 图片路径、大小、哈希登记到数据库，便于后续统一管理 |

### 六、版本历史与数据

| 特性 | 说明 |
| --- | --- |
| 🕰 **自动快照** | 按可配置间隔（默认 5 分钟）为文档生成版本快照 |
| ⏪ **一键回滚** | 查看任意历史版本并恢复；恢复前会为当前内容再存一份快照，避免误操作丢数据 |
| 🧹 **智能裁剪** | 内容未变化则不生成快照；每篇文档默认最多保留 50 条，超出自动清理最旧记录 |
| 🗄 **本地 SQLite** | 基于 Node.js 内置 `node:sqlite`，**零原生模块**，安装无需任何编译环境 |
| 🔒 **本地优先** | 所有数据只存在本机用户数据目录，不上传、不联网 |

### 七、导入与导出

| 格式 | 说明 | 是否需要额外依赖 |
| --- | --- | --- |
| **HTML（单文件）** | 内联全部样式；正文含公式时把 KaTeX 字体以 base64 一并内联，**离线可直接打开分享** | 不需要 |
| **HTML（无样式）** | 输出纯净的语义化 HTML，便于嵌入到自己的网站 | 不需要 |
| **PDF** | 通过 Electron 内置 `printToPDF` 生成，支持 A4/A3/A5/Letter/Legal/Tabloid 纸张、自定义页边距、可选页眉页脚 | 不需要 |
| **PNG 长图** | 整篇文档导出为一张长图，倍率 1–4 可调；超长文档自动降采样以防渲染失败 | 不需要 |
| **Word（.docx）** | 学术与办公场景 | 需系统安装 **Pandoc** |
| **LaTeX（.tex）** | 论文排版场景 | 需系统安装 **Pandoc** |
| **ePub** | 电子书 | 需系统安装 **Pandoc** |
| **RTF** | 通用富文本 | 需系统安装 **Pandoc** |

> 检测到系统已安装 Pandoc 时，软件会自动启用 Word / LaTeX / ePub / RTF 导出；
> 未安装时选择这些格式会给出明确提示，**HTML / PDF / PNG 导出任何情况下都无需 Pandoc**。

### 八、快捷键与分发

| 特性 | 说明 |
| --- | --- |
| ⌨️ **全量快捷键** | 覆盖文件操作、编辑操作、格式排版、视图与模式、表格操作、帮助六大分类 |
| 🛠 **全部可自定义** | 设置面板列表化展示所有命令与当前绑定，点击即进入「按下新快捷键」捕获状态 |
| ⚠️ **冲突检测** | 与既有绑定冲突时给出冲突详情并**阻止保存**；快捷键需含 Ctrl/Cmd、Alt 或为功能键 F1–F12 |
| 📤 **方案导入导出** | 快捷键方案可导出为 JSON 备份，也可导入他人分享的方案 |
| 📦 **免配置安装** | 安装包内置运行时，**用户无需安装 Node.js / npm / Python / Rust / 编译器** |
| 🪟 **独立原生窗口** | 自绘标题栏、菜单栏、工具栏与状态栏，**运行期不启动浏览器、不依赖 Chrome/Edge** |
| 🔗 **文件关联** | 安装时可勾选关联 `.md` 文件，双击 Markdown 文件直接用本软件打开 |
| 🖥 **窗口状态记忆** | 自动记忆窗口位置与尺寸，拔掉外接显示器后自动回到可见屏幕 |

---

## ⌨️ 界面与快捷键查询

### 界面分区

| 区域 | 作用 |
| --- | --- |
| **标题栏** | 自绘标题栏：左侧 🌱 品牌标识与菜单栏，中间当前文件名与未保存标记（●），右侧侧边栏开关、源码模式开关与最小化/最大化/关闭按钮 |
| **菜单栏** | 应用内菜单（文件 / 编辑 / 格式 / 视图 / 帮助），Windows 与 Linux 不显示系统菜单栏，全部功能由自绘菜单栏承接 |
| **工具栏** | 常用格式按钮：加粗、斜体、下划线、删除线、高亮、行内代码、标题、段落、引用、列表、链接、图片、表格、代码块、公式块、分割线、查找、导出、设置 |
| **侧边栏** | 三个面板切换：**文件树**（工作区目录树 + 最近打开）、**大纲**（H1–H6 层级）、**全局搜索**（FTS5 全文检索）；可拖拽调整宽度 |
| **编辑区** | 多标签页 + 编辑器主体 + 查找替换条；无文档时显示欢迎页 |
| **状态栏** | 字数 / 词数 / 行数 / 阅读时长、光标行列、选中统计、模式、明暗模式、编码、换行符、语言、保存状态 |

### 常用快捷键

> macOS 上 `Ctrl` 自动映射为 `Cmd`（⌘）。以下为**默认绑定**，全部可在「设置 → 快捷键」中修改。
> 完整的六大类快捷键全表见 [`docs/用户手册.md` 第 9 章](./docs/用户手册.md)。

| 功能 | Windows / Linux | macOS |
| --- | --- | --- |
| 新建文件 | `Ctrl + N` | `⌘ + N` |
| 打开文件 | `Ctrl + O` | `⌘ + O` |
| 打开文件夹 | `Ctrl + Shift + O` | `⌘ + ⇧ + O` |
| 保存 | `Ctrl + S` | `⌘ + S` |
| 另存为 | `Ctrl + Shift + S` | `⌘ + ⇧ + S` |
| 快速打开文件 | `Ctrl + P` | `⌘ + P` |
| 关闭当前标签 | `Ctrl + W` | `⌘ + W` |
| 打开设置 | `Ctrl + ,` | `⌘ + ,` |
| 撤销 / 重做 | `Ctrl + Z` / `Ctrl + Shift + Z` | `⌘ + Z` / `⌘ + ⇧ + Z` |
| 查找 / 替换 | `Ctrl + F` / `Ctrl + H` | `⌘ + F` / `⌘ + H` |
| 加粗 / 斜体 | `Ctrl + B` / `Ctrl + I` | `⌘ + B` / `⌘ + I` |
| 行内代码 | `Ctrl + Shift + `` ` `` | `⌘ + ⇧ + `` ` `` |
| 插入链接 / 图片 | `Ctrl + K` / `Ctrl + Shift + I` | `⌘ + K` / `⌘ + ⇧ + I` |
| 代码块 / 公式块 | `Ctrl + Shift + K` / `Ctrl + Shift + M` | `⌘ + ⇧ + K` / `⌘ + ⇧ + M` |
| 插入表格 | `Ctrl + T` | `⌘ + T` |
| 一级~六级标题 | `Ctrl + 1` ~ `Ctrl + 6` | `⌘ + 1` ~ `⌘ + 6` |
| 普通段落 | `Ctrl + 0` | `⌘ + 0` |
| 无序 / 有序列表 | `Ctrl + Shift + [` / `Ctrl + Shift + ]` | `⌘ + ⇧ + [` / `⌘ + ⇧ + ]` |
| 任务列表 / 引用 | `Ctrl + Shift + C` / `Ctrl + Shift + Q` | `⌘ + ⇧ + C` / `⌘ + ⇧ + Q` |
| **切换源码 / 实时预览** | `Ctrl + /` | `⌘ + /` |
| 专注模式 / 打字机模式 | `F8` / `F9` | `F8` / `F9` |
| 全屏 | `F11` | `F11` |
| 显示 / 隐藏侧边栏 | `Ctrl + Shift + L` | `⌘ + ⇧ + L` |
| 显示大纲 / 文件树 / 全局搜索 | `Ctrl + Shift + 1` / `2` / `3` | `⌘ + ⇧ + 1` / `2` / `3` |
| 放大 / 缩小字号 | `Ctrl + =` / `Ctrl + -` | `⌘ + =` / `⌘ + -` |
| 恢复默认字号 | `Ctrl + Shift + 0` | `⌘ + ⇧ + 0` |
| **快捷键查询** | `F1` | `F1` |

> ⚠️ **关于 `Ctrl + 0` 的绑定说明**：需求文档中 `Ctrl + 0` 同时被「普通段落」与「恢复默认字号」占用。
> 本软件按 Typora 的使用习惯，把 `Ctrl/Cmd + 0` 分配给**普通段落**，**「恢复默认字号」改为 `Ctrl/Cmd + Shift + 0`**。

---

## 📦 安装说明

### Windows（推荐）

1. 下载 Windows 安装包 **`花生苗Markdown编辑器-1.0.0-x64-*.exe`**（也可使用免安装便携版，解压即用、可放 U 盘）。
2. **双击安装包**，进入中文图形化 NSIS 安装向导。
3. 在向导中按需选择：
   - 📂 **自定义安装路径**：点击「浏览」按钮可自由选择安装目录（提示文案：「请选择安装位置，点击"浏览"可更换目录。」）；
   - 🖥 **创建桌面快捷方式**：复选框「创建桌面快捷方式」，可勾选 / 取消；
   - 📋 **创建开始菜单快捷方式**：复选框「创建开始菜单快捷方式」，可勾选 / 取消；
   - 📄 **关联 Markdown 文件**：安装后 `.md` / `.markdown` / `.mdx` 文件可双击用本软件打开。
4. 点击「安装」，完成后（`runAfterFinish` 默认勾选即自动启动）从桌面或开始菜单的「**花生苗 Markdown 编辑器**」快捷方式启动。

> ✅ **无需安装任何运行环境**：安装包内已包含 Chromium 与 Node.js 运行时，
> 您的电脑上**不需要**安装 Node.js、npm、Python、Rust、Visual Studio 编译器或任何依赖。
> 默认按当前用户安装，**免管理员权限优先**（也可选择「为所有用户安装」）；支持覆盖安装升级并保留用户配置。
> 卸载入口位于开始菜单与「设置 → 应用」，卸载时**默认保留**用户配置与版本历史（`deleteAppDataOnUninstall: false`）。

**系统要求**：Windows 10 / 11（x64）。

### Linux

| 发行形式 | 使用方式 | 适用场景 |
| --- | --- | --- |
| **`huashengmiao-markdown-1.0.0-x64.AppImage`** | `chmod +x` 后**双击运行**（或命令行执行） | 免安装，兼容所有主流发行版 |
| **`huashengmiao-markdown_1.0.0_amd64.deb`** | **双击安装**（或用 `sudo dpkg -i` 安装），自动创建应用菜单项 | Debian / Ubuntu 系 |
| **`huashengmiao-markdown-1.0.0-x64.tar.gz`** | 解压到任意目录后直接运行目录内的可执行文件 | 绿色解压版，无需 root 权限 |

```bash
# AppImage 方式
chmod +x huashengmiao-markdown-1.0.0-x64.AppImage
./huashengmiao-markdown-1.0.0-x64.AppImage

# deb 方式
sudo dpkg -i huashengmiao-markdown_1.0.0_amd64.deb
sudo apt-get install -f     # 如提示缺少依赖则执行此步修复

# tar.gz 方式
tar -xzf huashengmiao-markdown-1.0.0-x64.tar.gz
cd huashengmiao-markdown-1.0.0-x64 && ./huashengmiao-markdown
```

> ℹ️ Linux 产物名中的版本与架构段由 `electron-builder.yml` 的 `artifactName: ${name}-${version}-${arch}.${ext}`
> 决定（`name` 即包名 `huashengmiao-markdown`）。deb 包已声明 `libgtk-3-0`、`libnss3`、`libxss1`、
> `libxtst6`、`libatspi2.0-0`、`libsecret-1-0`、`xdg-utils`、`libnotify4` 等基础依赖。
> AppImage 需要系统提供 FUSE（`libfuse2`）；若缺少 FUSE，可改用 `--appimage-extract` 解压运行，或直接使用 tar.gz 版本。

**系统要求**：Ubuntu / Debian / Fedora / Arch 等主流发行版（x64）。

### macOS

当前版本源码已包含 macOS 平台适配（原生中文菜单、`hiddenInset` 保留红黄绿交通灯、
Dock 图标激活、`open-file` 文件关联事件），`electron-builder.yml` 中也已预留 macOS 的 `dmg`
打包目标（x64 与 arm64 双架构，未签名，`category: public.app-category.productivity`）。
但 **macOS 安装包必须在 macOS 机器上构建**，因此 **v1.0.0 未随版本提供 macOS 官方安装包**。

macOS 用户如需使用，有两种方式：

1. **从源码运行**（推荐先这样体验）：参考下方[开发环境搭建](#-开发环境搭建)，执行 `npm install && npm start`；
2. **自行构建安装包**：在 macOS 机器上执行 `npx electron-builder --mac`（依赖 `electron-builder.yml` 中的 `mac` 段），
   产物为 `release/花生苗Markdown编辑器-1.0.0-<arch>.dmg`。由于未做代码签名与公证，
   首次打开需在「系统设置 → 隐私与安全性」中允许运行。

后续版本将提供经过签名的 macOS 正式安装包（详见[路线图](#-路线图)）。

**系统要求**：macOS 11 及以上（Intel 与 Apple Silicon）。

---

## 🚀 快速上手（5 步）

1. **启动软件** — 双击桌面快捷方式，首次启动会看到欢迎页，上面有「新建文件 / 打开文件 / 打开文件夹 / 快捷键查询」四张卡片。
2. **新建或打开文档** — 按 `Ctrl/Cmd + N` 新建，或按 `Ctrl/Cmd + O` 打开已有 Markdown 文件，也可以按 `Ctrl/Cmd + Shift + O` 打开一个文件夹作为工作区。
3. **直接开始写作** — 输入 `# 我的第一篇文档` 后按回车，标题会立即变成排版后的样式；继续输入正文、列表、表格即可看到**边写边排版**的效果。若想看源码，把光标移到该行，或按 `Ctrl/Cmd + /` 切换到纯源码模式。
4. **插入公式、图表与图片** — 按 `Ctrl/Cmd + Shift + M` 插入公式块并输入 `\frac{a}{b}`；输入 ` ```mermaid ` 画流程图；直接**粘贴截图**或把图片文件拖进编辑器，图片会自动保存到 `assets` 目录并插入引用。
5. **导出与分享** — 按 `Ctrl/Cmd + Shift + E` 导出带样式的单文件 HTML，或从菜单选择导出 PDF / PNG 长图；需要 Word 时先安装 Pandoc 再导出。

> 💡 按 `F1` 可随时打开「**快捷键查询**」面板，查看全部命令的当前绑定。

---

## 🛠 开发环境搭建

### 环境要求

| 依赖 | 版本要求 | 说明 |
| --- | --- | --- |
| Node.js | 18 及以上（推荐 20 LTS / 22 LTS） | 仅**开发与构建**需要；最终用户无需安装 |
| npm | 随 Node.js 附带 | 包管理 |
| 操作系统 | Windows / Linux / macOS | 交叉打包 Windows 与 Linux 产物 |

### 拉取与安装

```bash
# 1. 获取源码
git clone https://github.com/Passer9527/huashengmiao-markdown.git
cd huashengmiao-markdown

# 2. 安装依赖（项目已通过 .npmrc 配置国内镜像，可加速 Electron 下载）
npm install

# 3. 构建并启动
npm start
```

### 构建命令

本项目使用 **esbuild** 构建（构建脚本：`scripts/build.mjs`），构建产物统一输出到 **`dist/`** 目录：

```text
dist/
├── main/main.js          主进程（CommonJS，目标 Node 20）
├── preload/preload.js    预加载脚本（CommonJS）
├── renderer/
│   ├── index.html        界面骨架（从 src/renderer 拷贝）
│   ├── renderer.js       渲染进程脚本（IIFE，目标 Chrome 120）
│   ├── renderer.css      样式表
│   ├── mermaid.js        Mermaid 按需包（体积较大，单独成包按需注入）
│   └── fonts/            字体资源（KaTeX 等）
├── resources/            应用图标等静态资源
├── LICENSE / THIRD-PARTY-LICENSES.md / README.md   开源合规文件
```

> 渲染进程使用 **IIFE** 而非 ESM：页面通过 `file://` 协议加载，Chromium 会以 CORS 策略拦截 `file://` 下的模块化 `import`。

| npm 脚本 | 命令 | 作用 |
| --- | --- | --- |
| 命令 | 实际执行 | 作用 |
| --- | --- | --- |
| `npm run build` | `node scripts/build.mjs` | 一次性构建全部产物到 `dist/`（含压缩与体积速览输出） |
| `npm run watch` | `node scripts/build.mjs --watch` | 监听源码变更并自动重建（内联 sourcemap） |
| `npm start` | `npm run build && electron .` | 构建完成后立即启动应用 |
| `npm run typecheck` | `npx tsc --noEmit` | TypeScript 严格模式类型检查，不产出文件 |
| `npm run icon` | `node scripts/make-icon.mjs` | 重新生成应用图标（`build/icon.png` 与 `resources/icon.png`） |
| `npm run test:unit` | `node --test test/unit.test.mjs` | 纯函数单元测试（快捷键解析、路径工具、Markdown 解析、主题） |
| `npm run test:e2e` | `node test/e2e.mjs` | 启动真实应用执行端到端测试，并采集界面截图与生成测试报告 |
| `npm test` | 单元测试 + 端到端测试 | 一条命令跑完全部测试 |
| `npm run pack:dir` | `node scripts/release.mjs dir` | 只生成未打包的应用目录，便于快速验证打包结果 |
| `npm run dist:win` | `node scripts/release.mjs win` | 打包 Windows 产物（NSIS 安装向导 + 便携版） |
| `npm run dist:linux` | `node scripts/release.mjs linux` | 打包 Linux 产物（AppImage / deb / tar.gz） |
| `npm run dist:all` | `node scripts/release.mjs win linux` | 一次性打包 Windows 与 Linux 全部产物 |

> **打包脚本说明**：`scripts/release.mjs` 会自动设置国内镜像
> （`ELECTRON_MIRROR` / `ELECTRON_BUILDER_BINARIES_MIRROR` 指向 npmmirror），
> 先构建源码再调用 electron-builder 的 Node API 产出安装包，
> 最后打印 `release/` 目录下所有产物的体积清单。
>
> **在没有图形界面的服务器上跑端到端测试**：脚本会自动以离屏渲染方式启动应用
> （设置 `HSM_OFFSCREEN=1`），并通过应用自身的窗口截图接口采集画面，
> 因此 CI 环境同样可以生成界面截图与测试报告。

### 调试技巧

- 开发期可通过设置项 `advanced.showDevTools`（高级 → 显示开发者工具）开启开发者工具，或使用主进程提供的 `app:toggle-devtools` 接口。
- 主进程日志会同时输出到控制台并写入用户数据目录下的 `logs/huashengmiao-<日期>.log`，排查问题优先看日志。
- 数据库文件位于用户数据目录下的 `huashengmiao.db`，可用任意 SQLite 客户端（如 `sqlite3` 命令行）打开查看索引、设置与版本快照。

---

## 📁 项目结构

```text
huashengmiao-markdown-editor/
├── src/
│   ├── main/                        主进程：窗口、菜单、IPC 与全部业务服务
│   │   ├── main.ts                  应用入口：生命周期、单实例控制、命令行/文件关联、异常捕获、退出清理
│   │   ├── window.ts                窗口创建与管理：自绘标题栏方案、窗口状态记忆、新窗口与导航安全策略
│   │   ├── menu.ts                  应用菜单：macOS 完整原生中文菜单；Windows/Linux 置空（功能由自绘菜单栏承接）
│   │   ├── ipc.ts                   全部 IPC 接口注册，渲染进程唯一的系统能力入口
│   │   └── services/                业务服务层
│   │       ├── database.ts          node:sqlite 初始化、建表、预编译语句、查询封装与降级策略
│   │       ├── settings.ts          设置读写、类型转换、数值范围钳制、重置为默认
│   │       ├── shortcuts.ts         快捷键持久化、冲突检测、单条/全部重置、方案导入导出
│   │       ├── recent.ts            最近文件记录、限额裁剪与失效记录清理
│   │       ├── history.ts           版本快照生成、数量裁剪与回滚
│   │       ├── search.ts            FTS5 + LIKE 双通道全文检索、索引维护与工作区重建
│   │       ├── files.ts             文件读写、目录树、编码与换行识别、外部修改监视
│   │       ├── images.ts            图片落盘、命名模板渲染、SHA-256 去重、宽高解析、资源登记
│   │       ├── exporter.ts          HTML / PDF / PNG 导出与 Pandoc 转换
│   │       └── logger.ts            日志落盘、按天切分、过期清理与全局异常捕获
│   ├── preload/
│   │   └── preload.ts               contextBridge 白名单 IPC 桥接，向页面暴露 window.hsm
│   ├── renderer/                    渲染进程：全部界面与编辑器逻辑
│   │   ├── index.html               界面骨架（CSP 策略、标题栏、工具栏、侧边栏、编辑区、状态栏）
│   │   ├── main.ts                  渲染进程入口：启动引导、标签页、命令注册与分发、导出编排
│   │   ├── core/                    应用壳
│   │   │   ├── store.ts             全局状态、事件总线、设置应用、命令索引与执行
│   │   │   └── ui-kit.ts            自绘 UI 组件库（模态框、菜单、Toast、输入控件等）
│   │   ├── editor/                  CodeMirror 6 编辑器与渲染引擎
│   │   │   ├── editor.ts            编辑器扩展装配、格式化命令、查找替换、表格与智能输入
│   │   │   ├── live-preview.ts      实时渲染装饰器（ViewPlugin + Decoration + Widget）
│   │   │   ├── markdown.ts          markdown-it 配置、KaTeX 规则、容器规则、文档统计
│   │   │   ├── mermaid.ts           Mermaid 按需加载、渲染调度与缓存
│   │   │   └── mermaid-entry.ts     Mermaid 独立打包入口（产出 dist/renderer/mermaid.js）
│   │   ├── ui/                      自绘界面组件
│   │   │   ├── sidebar.ts           侧边栏：文件树、大纲、全局搜索、最近文件
│   │   │   └── overlays.ts          模态框、设置面板、快捷键查询面板、快速打开、右键菜单、导出对话框
│   │   ├── styles/                  界面样式表（构建入口为 styles/index.css）
│   │   │   ├── index.css            样式总入口（声明层叠顺序并 @import 其余样式与 KaTeX）
│   │   │   ├── base.css             变量、重置、滚动条、工具类
│   │   │   ├── layout.css           标题栏、菜单栏、工具栏、侧边栏、主体、状态栏
│   │   │   ├── editor.css           编辑区与 CodeMirror 6 装饰器 / Widget 样式
│   │   │   ├── ui.css               标签页、文件树、大纲、搜索结果、按钮、输入框、Toast
│   │   │   ├── overlays.css         模态框、设置、快捷键面板、快速打开、右键菜单
│   │   │   └── responsive.css       窄窗口适配（必须最后加载）
│   │   └── themes/                  渲染侧主题资源目录（主题以 TS 常量形式定义在 shared/themes.ts）
│   └── shared/                      主进程与渲染进程共享契约（两端引用同一份定义）
│       ├── types.ts                 IPC 契约、数据结构与设置项类型
│       ├── commands.ts              命令表（82 条）、默认快捷键、按键解析 / 匹配 / 格式化工具
│       ├── settings-defs.ts         全部设置项定义（49 项）、内置主题清单与默认值
│       ├── themes.ts                文档结构样式、6 款配色主题、5 款代码高亮主题
│       ├── path-utils.ts            渲染进程内的跨平台路径工具（渲染进程无法使用 node:path）
│       └── build-info.ts            构建期注入的版本号、软件名、作者与联系方式
├── scripts/
│   ├── build.mjs                    esbuild 构建脚本（主进程 / 预加载 / 渲染 / Mermaid / 样式表 + 静态资源拷贝）
│   └── make-icon.mjs                生成应用图标（build/ 与 resources/ 下的各尺寸 PNG）
├── build/                           electron-builder 打包资源
│   ├── icon.png / icon-256 / icon-128 / icon-64   应用图标
│   └── installer.nsh                NSIS 安装向导自定义脚本（安装信息登记、卸载清理、品牌文案）
├── resources/                       应用图标等随包分发的静态资源
├── test/                            测试（使用 Node.js 内置 node:test 运行器）
│   ├── unit.test.mjs                单元测试
│   └── e2e.mjs                      端到端脚本
├── docs/                            项目文档
│   ├── 需求规格说明书.md             需求基线
│   ├── 详细设计说明书.md             面向开发者的详细设计
│   ├── 用户手册.md                  面向最终用户的使用手册
│   └── 测试用例清单.md               测试用例与测试环境矩阵
├── dist/                            构建产物（npm run build 生成，已被忽略）
├── release/                         安装包产物（npm run dist:* 生成，已被忽略）
├── LICENSE                          MIT License
├── README.md                        本文件
├── CHANGELOG.md                     更新日志
├── THIRD-PARTY-LICENSES.md          第三方组件与许可证清单
├── electron-builder.yml             安装包配置（Windows NSIS / Linux AppImage·deb·tar.gz / macOS dmg）
├── package.json                     依赖与 npm 脚本定义
├── tsconfig.json                    TypeScript 严格模式配置
└── .npmrc                           npm 镜像与 Electron 下载镜像配置
```

> ℹ️ **仓库实现状态**：主进程（`src/main/`，含 10 个业务服务）、预加载（`src/preload/`）、
> 共享契约（`src/shared/`，含 82 条命令表与 49 项设置定义）、渲染进程（`src/renderer/`：界面骨架、
> 编辑器内核、实时渲染装饰器、markdown-it 渲染引擎、Mermaid 调度、侧边栏与浮层组件、7 个样式表）、
> 构建脚本（`scripts/build.mjs`）、安装包配置（`electron-builder.yml` + `build/installer.nsh` 与图标）
> 与测试（`test/`）均已落地，`npm run typecheck` 无类型错误。
> 已知的实现细节差异与后续改进项（如窗口几何记忆、装饰器视口化、`db:vacuum` 语义）集中记录在
> [`docs/详细设计说明书.md` 附录 C](./docs/详细设计说明书.md#附录-c代码核对结论与待办项)。
> 构建与打包命令的行为、产物路径与目录职责以本节说明与 `scripts/build.mjs`、`electron-builder.yml` 为准。

### 各目录职责速查

| 目录 | 职责 | 是否参与打包 |
| --- | --- | --- |
| `src/main/` | 主进程：窗口、菜单、IPC 注册与全部业务服务（文件、数据库、导出、搜索、历史、图片、设置、快捷键、日志） | ✅ 打包为 `dist/main/main.js` |
| `src/preload/` | 预加载桥接：通过 `contextBridge` 暴露白名单化、类型化的 `window.hsm` API | ✅ 打包为 `dist/preload/preload.js` |
| `src/renderer/` | 渲染进程：界面骨架、样式、编辑器内核接入与实时渲染 | ✅ 打包为 `dist/renderer/*` |
| `src/shared/` | 主进程与渲染进程共享的类型契约、命令表、设置定义与主题定义 | ✅ 分别打包进两端产物 |
| `scripts/` | 构建脚本（esbuild 配置、静态资源拷贝、产物体积统计） | ❌ 仅开发期使用 |
| `build/` | electron-builder 打包资源：应用图标、NSIS 安装向导选项（自定义安装路径、快捷方式复选框、`.md` 关联） | ✅ 打包时被 electron-builder 读取 |
| `resources/` | 应用图标等随包分发的静态资源 | ✅ 拷贝到 `dist/resources/` |
| `test/` | 测试：`unit.test.mjs`（单元测试）与 `e2e.mjs`（端到端脚本），由 Node.js 内置 `node:test` 运行 | ❌ 不进入产物 |
| `docs/` | 项目文档（需求、设计、用户手册、测试用例） | ❌ 不进入产物 |
| `dist/` | 构建产物 | 打包输入 |
| `release/` | 安装包产物 | 打包输出 |

---

## 📤 打包发布说明

```bash
# 打包 Windows 产物（NSIS 安装向导 + 免安装便携版）
npm run dist:win

# 打包 Linux 产物（AppImage + deb + tar.gz）
npm run dist:linux

# 一次性打包 Windows 与 Linux
npm run dist:all

# 只生成未压缩的应用目录，用于快速验证打包结果
npm run pack:dir
```

### 跨平台构建的前提

| 构建机 → 目标 | Windows 安装包 | Linux 安装包 |
| --- | --- | --- |
| **Windows** | ✅ 直接构建，无需额外工具 | 需 WSL2 或 Linux 机器 |
| **Linux** | ✅ 可以构建，但需先安装 **wine**（见下） | ✅ 直接构建 |
| **macOS** | ✅ 可以构建，需 `brew install --cask wine-stable` | 需虚拟机或 Docker |

> **为什么 Linux 上构建 Windows 安装包需要 wine？**
> NSIS 打包流程需要运行一次安装程序以生成卸载程序。这一步由 wine 完成
> （安装包本身在 Windows 上运行，与 wine 无关）。
>
> ```bash
> # Debian / Ubuntu
> sudo apt install wine64
> # Fedora
> sudo dnf install wine
> # 若 wine 不在默认位置，可用环境变量指定
> USE_SYSTEM_WINE=true PATH="/your/wine/bin:$PATH" npm run dist:win
> ```
>
> 若构建机无法安装 wine，也可以只运行 `npm run pack:dir` 得到 `release/win-unpacked/`，
> 将其打包为 ZIP 即为**免安装便携版**，功能与安装版完全一致。

后端打包配置位于仓库根目录的 **`electron-builder.yml`**（Windows / Linux / macOS 三平台），
配合 **`build/`** 目录中的图标与 `installer.nsh`（NSIS 自定义脚本）。打包产物统一输出到 **`release/`** 目录：

| 平台 | 产物 | 实际文件示例 | 说明 |
| --- | --- | --- | --- |
| Windows | NSIS 中文安装向导 | `花生苗Markdown编辑器-Setup-1.0.0-x64.exe` | 带向导的安装程序，可自定义安装路径、勾选快捷方式 |
| Windows | 免安装便携版 | `花生苗Markdown编辑器-便携版-1.0.0-x64.exe` | 单文件，双击即用，可放 U 盘 |
| Linux | AppImage | `huashengmiao-markdown-1.0.0-x86_64.AppImage` | 免安装，`chmod +x` 后双击运行 |
| Linux | deb | `huashengmiao-markdown-1.0.0-amd64.deb` | Debian / Ubuntu 双击安装，自动创建应用菜单项 |
| Linux | tar.gz | `huashengmiao-markdown-1.0.0-x64.tar.gz` | 绿色解压版 |
| macOS | dmg | `花生苗Markdown编辑器-1.0.0-<arch>.dmg` | 配置已预留（x64 与 arm64），需在 macOS 机器上构建；未签名，首次打开需在「系统设置 → 隐私与安全性」中允许 |

> ℹ️ 产物文件名由 `electron-builder.yml` 中的 `artifactName` 决定（Windows 与 macOS 使用中文产品名，
> Linux 使用 `${name}` 即包名 `huashengmiao-markdown`）。实际生成的文件名请以 `release/` 目录中看到的为准。

**安装包内不含 `node_modules`**：主进程与渲染进程都已被 esbuild 完整打包，KaTeX 的公式样式与字体也在构建阶段
复制到 `dist/renderer/katex/`，因此运行时不需要任何第三方模块文件，安装包体积因此减少约 70 MB。

### Windows 安装向导的可选项

以下配置均由 `electron-builder.yml` 的 `nsis` 段提供，对应关系如实列出：

| 向导选项 | 配置项 | 取值 | 说明 |
| --- | --- | --- | --- |
| **安装路径** | `allowToChangeInstallationDirectory` | `true` | 向导中显示安装位置页，提供「浏览」按钮，**用户可自由选择安装目录** |
| **创建桌面快捷方式** | `createDesktopShortcut` | `true` | 向导中的复选框，**用户可勾选或取消** |
| **创建开始菜单快捷方式** | `createStartMenuShortcut` | `true` | 向导中的复选框，**用户可勾选或取消**；快捷方式名称为「花生苗 Markdown 编辑器」 |
| **关联 Markdown 文件** | `fileAssociations` | `.md` / `.markdown` / `.mdx` | 关联后双击文件用本软件打开（`role: Editor`） |
| 安装模式 | `oneClick: false` | — | 使用带向导的安装方式（而非一键静默安装），这是显示上述选项页的前提 |
| 安装权限 | `perMachine: false` + `allowElevation: true` | — | 默认按当前用户安装，免管理员权限；用户也可选择「为所有用户安装」 |
| 安装界面语言 | `installerLanguages` | `zh_CN`、`en_US` | 中文优先，同时提供英文 |
| 安装完成行为 | `runAfterFinish` | `true` | 安装完成后立即启动软件 |
| 安装信息登记 | `build/installer.nsh` 的 `customInstall` | — | 在注册表 `HKCU\Software\HuashengmiaoMarkdown` 写入 `InstallPath` / `Version` / `Author` / `License` |
| 卸载入口 | — | — | 开始菜单与「设置 → 应用」中均提供，显示名「花生苗 Markdown 编辑器 1.0.0」 |
| 卸载时的数据处理 | `deleteAppDataOnUninstall: false` | — | **保留**用户配置（设置、最近文件、版本历史），重装后数据不丢；需彻底清理请见 FAQ |
| 覆盖安装 | — | — | 支持升级安装并保留用户配置 |

### 打包前检查清单

- [ ] `package.json` 中 `version`、`productName`、`author`、`homepage` 已更新
- [ ] `CHANGELOG.md` 已补充本次版本的变更条目
- [ ] `THIRD-PARTY-LICENSES.md` 中的依赖版本与实际安装版本一致（可用 `npm ls --depth=0` 核对）
- [ ] `build/` 目录中已放置应用图标（`icon.png` 及 `icon-64/128/256.png`）与 `installer.nsh`
- [ ] `electron-builder.yml` 中的 `version`、图标路径、`fileAssociations` 与本次发布一致
- [ ] `npm run typecheck` 通过
- [ ] `npm test` 通过
- [ ] 在干净的 Windows / Linux 系统上验证「双击安装即用 + 无任何运行时报错」
- [ ] 验证安装向导可自定义安装路径，快捷方式复选框可勾选 / 取消
- [ ] 验证全程无浏览器窗口弹出，界面完全自包含

---

## 🧱 技术栈

| 层次 | 选型 | 版本 | 为什么选它 |
| --- | --- | --- | --- |
| 桌面框架 | **Electron** | 38 | 内置 Chromium + Node.js，是「用户免配置安装 + 独立原生窗口 + 开箱即用」的最直接方案；自带 `printToPDF` 与页面截图能力，导出无需 Puppeteer / wkhtmltopdf |
| 开发语言 | **TypeScript** | 5 | 类型安全，主进程与渲染进程共享一份契约；源码全中文注释 |
| 构建工具 | **esbuild** | 0.24 | 极速、单依赖、零复杂配置；一次构建主进程 / 预加载 / 渲染 / Mermaid / 样式表五类产物 |
| 编辑器内核 | **CodeMirror 6** | 6 | 轻量（约 200 KB）、模块化；`Decoration` 装饰器 API 可精确实现「源码与渲染混合」的实时渲染效果 |
| Markdown 解析 | **markdown-it** | 14 | CommonMark 规范实现，插件生态成熟（脚注、任务列表、上下标、高亮、Emoji、定义列表） |
| 数学公式 | **KaTeX** | 0.16 | 渲染速度快、体积小，字体可内联为 base64 实现单文件离线导出 |
| 代码高亮 | **highlight.js** | 11 | 语言覆盖广、体积可控、主题丰富 |
| 图表渲染 | **Mermaid** | 11 | 流程图 / 时序图 / 甘特图 / 类图一站式解决 |
| 本地存储 | **`node:sqlite`**（Node.js 内置） | 随 Electron 38 | **无需任何原生模块编译**，打包零风险；自带 FTS5 全文检索 |
| 全文检索 | **SQLite FTS5** + LIKE 兜底 | 随 Node.js | FTS5 `unicode61` 处理英文分词，LIKE 通道保证中文连写也能命中 |
| PDF 导出 | Electron **`printToPDF`** | 随 Electron 38 | 零外部依赖，支持纸张、页边距与页眉页脚 |
| 长图导出 | Electron **页面截图 API** | 随 Electron 38 | 零外部依赖，内置画布上限保护与自动降采样 |
| 打包分发 | **electron-builder** | 26 | NSIS 自定义安装路径与快捷方式复选框配置完备；一套配置产出 Windows 与 Linux 全部格式 |
| 测试 | Node.js 内置 **`node:test`** | 随 Node.js | 免额外测试框架依赖 |

---

## ❓ 常见问题 FAQ

### 1. 导出 Word / LaTeX / ePub / RTF 时提示「未检测到 Pandoc」怎么办？

这三种以外的格式无需 Pandoc。导出 Word / LaTeX / ePub / RTF 需要系统安装 **Pandoc**（免费开源，<https://pandoc.org>）：

1. 前往 <https://pandoc.org/installing.html> 下载对应平台的安装包并安装；
2. **重新启动本软件**（软件在启动后首次导出时检测 Pandoc，检测结果会被缓存）；
3. 再次执行导出即可。

软件提示原文为：「未检测到 Pandoc。导出 Word / LaTeX / ePub / RTF 需要安装 Pandoc（免费开源，https://pandoc.org）。安装后重新启动本软件即可自动识别；HTML 与 PDF 导出无需 Pandoc。」

### 2. 如何修改快捷键？

打开「设置 → 快捷键」（`Ctrl/Cmd + ,` 或按 `F1` 打开**快捷键查询**面板）：

1. 在列表中找到目标命令，点击该行进入「按下新快捷键」捕获状态；
2. 按下您想要的组合键（只按修饰键不会产生绑定；按键需包含 `Ctrl/Cmd`、`Alt` 之一，或为功能键 `F1`–`F12`）；
3. 若该组合已被其他命令占用，软件会给出**冲突详情并阻止保存**，请换一个组合；
4. 支持**单条重置**与**全部重置为默认**，也可把整套方案**导出为 JSON** 备份，或**导入**他人分享的方案。

### 3. 粘贴的图片存到哪里去了？

默认保存在**当前文档同级目录的 `assets/` 子目录**中，并在 Markdown 中写入以 `./` 开头的相对路径（如 `./assets/image-20250101-120000-a3f9c1.png`）。
可在「设置 → 图片 → 图片保存方式」中改为：文档同级目录、指定绝对目录，或「仅插入网络地址，不上传」。
命名规则由「图片命名模板」控制，支持 `{yyyy}` `{MM}` `{dd}` `{hhmmss}` `{rand}` `{name}` 六种占位符。
相同内容的图片会按 **SHA-256** 自动去重，不会重复占用磁盘。

### 4. 我的数据存在哪里？

全部数据都在本机用户数据目录（应用名为「花生苗Markdown编辑器」）：

| 平台 | 数据目录 |
| --- | --- |
| Windows | `%APPDATA%\花生苗Markdown编辑器\` |
| Linux | `~/.config/花生苗Markdown编辑器/` |
| macOS | `~/Library/Application Support/花生苗Markdown编辑器/` |

目录内包含：`huashengmiao.db`（SQLite 数据库：设置、快捷键、最近文件、版本快照、搜索索引、导出历史）、
`logs/`（按天切分的运行日志，最多保留 7 天）、`themes/`（自定义 CSS 主题）。
**所有数据完全本地保存，软件不上传任何内容，也不发起任何远程请求。**

### 5. 如何自定义主题？

1. 准备好一个 `.css` 文件，选择器写在文档根容器 `.hsm-preview` 下；
2. 在「设置 → 外观」中点击「导入自定义 CSS 主题」并选择该文件，文件会被复制到用户数据目录的 `themes/` 文件夹；
3. 把「文档主题」选为「自定义主题…」，并在「自定义主题名称」中填写主题名（即 CSS 文件名去掉 `.css`）。

最简单的做法是只覆盖配色变量，例如：

```css
.hsm-preview {
  --doc-bg: #f7f3e9;
  --doc-text: #3b3630;
  --doc-heading: #1f3d2b;
  --doc-link: #2f7d4f;
  --doc-border: #ddd5c4;
  --doc-code-bg: #efe9dc;
  --doc-mark-bg: #ffe9a8;
}
```

可覆盖的变量共 25 个（配色 21 个 + 排版 4 个），完整清单与可直接使用的完整示例见
[`docs/用户手册.md` 第 7 章](./docs/用户手册.md)。

### 6. 支持哪些 Markdown 扩展语法？

除 CommonMark / GFM 基础语法外，还支持：**KaTeX 行内与块级公式**、**Mermaid 流程图 / 时序图 / 甘特图 / 类图**、
**脚注** `[^1]`、**目录** `[TOC]`、**上标** `x^2^`、**下标** `H~2~O`、**高亮** `==文字==`、
**Emoji 短代码** `:smile:`、**YAML Front Matter**、**定义列表**（`术语` + `: 定义`）。
完整速查表见 [`docs/用户手册.md` 第 4 章](./docs/用户手册.md)。

### 7. 打开旧文档时中文乱码怎么办？

软件会优先按 UTF-8（含 BOM）解码；若检测到非法 UTF-8 序列，会**自动回退为 GBK 解码**，
因此 Windows 上遗留的中文文档通常能正常打开（状态栏会显示实际识别到的编码）。
若仍显示异常，说明原文件使用了其他编码（如 GB18030 全角字符、BIG5 等），
建议先用编辑器或命令行工具把文件转换为 UTF-8，再重新打开并保存。

### 8. 导出 PDF 排版不理想怎么调整？

在「设置 → 导出」中调整：**PDF 纸张尺寸**（A4 / A3 / A5 / Letter / Legal / Tabloid）、
**PDF 页边距**（默认 `20mm`，支持 `mm` / `cm` / `in` / `pt` / `px`，可写 1 个、2 个或 4 个值）、
**是否添加页眉页脚**（页眉显示文档标题与软件名，页脚显示「第 N 页 / 共 M 页」）。
软件内置打印分页控制，会让标题不落单、代码块 / 引用 / 表格 / 图片 / 公式块尽量不被跨页截断。
正文宽度可在「外观 → 正文页宽」中调整，过宽会导致表格被压缩，建议 800 px 左右。

### 9. 快捷键冲突了怎么办？

软件对快捷键做**严格冲突检测**：当您设置的组合已被其他命令占用时，会给出冲突详情并**阻止保存**。
请改用其他组合，或先修改占用该组合的命令。
另外请注意一处刻意的调整：需求文档中 `Ctrl + 0` 同时被「普通段落」与「恢复默认字号」占用，
本软件把 `Ctrl/Cmd + 0` 分配给**普通段落**，**「恢复默认字号」改为 `Ctrl/Cmd + Shift + 0`**。

### 10. 软件崩溃或异常了，日志在哪？

日志位于用户数据目录的 `logs/` 文件夹中，文件名为 `huashengmiao-<YYYY-MM-DD>.log`，按天切分，**最多保留 7 天**。
可通过菜单「帮助 → 打开日志目录」直接打开该文件夹（macOS 原生菜单；其他平台可从设置面板中的「打开日志目录」入口进入），
把当天的日志文件附在 Issue 中，能极大加速问题定位。软件已安装全局异常捕获，
主进程未捕获异常与未处理的 Promise 拒绝都会写入日志。

### 11. 如何重置设置？

在「设置」面板底部点击「恢复默认设置（重置）」，会清空 `settings` 表并写回全部默认值。
若设置面板已无法正常打开，可关闭软件后删除（或改名备份）用户数据目录下的 `huashengmiao.db`，重新启动即会重建为出厂状态。
快捷键可单独在「设置 → 快捷键」中「全部重置为默认」，无需动数据库。

### 12. 如何彻底卸载干净？

1. 从开始菜单或「设置 → 应用」执行卸载程序（Windows），或卸载 deb 包（Linux）；AppImage 与 tar.gz 直接删除文件即可；
2. 手工删除用户数据目录（见问题 4 的路径表），即可清除设置、快捷键、搜索结果、版本快照与自定义主题；
3. 若曾关联过 `.md` 文件，卸载后系统会自动解除关联；如未解除，可在系统「默认应用」设置中手动改回。

> 参与贡献前请先阅读[贡献指南](#-贡献指南)，更多问题排查步骤见 [`docs/用户手册.md` 第 14 章](./docs/用户手册.md)。

---

## 🗺 路线图

| 版本 | 主题 | 计划内容 |
| --- | --- | --- |
| **v1.1** | 云同步与体验打磨 | ☁️ **WebDAV / 坚果云云同步**（数据库已预留 `sync_log` 表）<br>📝 拼写检查增强（中英文词典、可自定义词库）<br>🖨 **ePub 与 LaTeX 导出完善**（不依赖 Pandoc 的内置导出路径）<br>📥 从 HTML / Word 导入并转换为 Markdown<br>🌍 界面多语言完善（简体中文 / English 全量文案）<br>🍎 macOS 正式安装包（dmg，Intel 与 Apple Silicon）<br>🎨 主题市场：一键导入社区分享的主题 CSS |
| **v1.2** | 插件系统与扩展能力 | 🧩 **插件系统与开放 API**（数据库已预留 `plugins` 表）<br>🪝 插件生命周期、权限模型与沙箱加载<br>🧮 数据图表（折线 / 柱状 / 饼图，基于 ECharts）<br>⚗️ 化学公式支持（KaTeX mhchem 扩展）<br>💬 自定义容器 `::: warning` / `::: tip` / `::: danger` 提示框<br>⌨️ 命令行工具 `huashengmiao <file>`（打开文件、批量转换）<br>☁️ 图床集成（PicGo / SM.MS / 阿里云 OSS / 七牛） |
| **v2.0** | 协作与生态 | 👥 **多人协作编辑**（CRDT 协同算法）<br>🔗 双向链接与知识图谱视图<br>📚 多工作区与全局标签体系（`tags` / `document_tags` 表已就绪）<br>🔌 插件市场与主题市场<br>📱 移动端伴侣应用（查看与轻量编辑）<br>🤖 AI 辅助写作（摘要、润色、翻译，可完全离线 / 可选在线） |

> 路线图会根据社区反馈动态调整。有迫切需要的功能，欢迎在 Issue 中告诉我们，或通过**微信 6731663**直接联系作者。

---

## 🤝 贡献指南

我们欢迎任何形式的贡献，无论是代码、文档、主题还是使用反馈。

### 贡献方式

| 方式 | 说明 |
| --- | --- |
| 🐛 **报告 Bug** | 提交 Issue，请附：软件版本、操作系统与版本、复现步骤、期望结果、实际结果、相关日志（`logs/` 目录下的当天日志） |
| 💡 **提出建议** | 提交 Issue 描述使用场景与期望效果，附上参考软件截图更佳 |
| 📖 **改进文档** | 修正错别字、补充说明、翻译文档，直接提 PR 即可 |
| 🎨 **分享主题** | 把自定义 CSS 主题作为 PR 提交到 `src/renderer/themes/`，或在 Issue 中分享 |
| ⌨️ **分享快捷键方案** | 在「设置 → 快捷键」中导出 JSON 并附在 Issue 中，方便其他用户一键导入 |
| 🔧 **提交代码** | 见下方流程 |

### 代码贡献流程

```bash
# 1. Fork 本仓库并克隆到本地
git clone https://github.com/<你的用户名>/huashengmiao-markdown.git
cd huashengmiao-markdown

# 2. 创建特性分支（分支名建议 feature/xxx 或 fix/xxx）
git checkout -b feature/your-feature

# 3. 安装依赖
npm install

# 4. 开发与自测
npm run typecheck     # 类型检查必须通过
npm test              # 测试必须通过
npm start             # 本地运行验证功能

# 5. 提交（提交信息请使用清晰的中文或英文描述）
git commit -m "feat: 新增 XXX 功能"
git push origin feature/your-feature
```

然后在 GitHub 上发起 Pull Request，并在描述中说明：改动目的、实现方式、测试情况、关联 Issue 编号。

### 代码规范

| 项目 | 约定 |
| --- | --- |
| 语言与注释 | 源码使用 **TypeScript**；注释使用**简体中文**，文件头标注作者与联系方式（新建文件请沿用现有风格） |
| 类型安全 | 必须通过 `npm run typecheck`（`strict`、`noImplicitAny`、`strictNullChecks` 均开启） |
| 进程边界 | 渲染进程**不得**直接访问文件系统与 Node 模块；新增系统能力必须在 `src/main/ipc.ts` 注册，并在 `src/preload/preload.ts` 白名单暴露 |
| 共享契约 | 新增数据结构、设置项、命令与主题，请统一添加到 `src/shared/` 下的对应文件，保证主进程与渲染进程共用一份定义 |
| 安全 | 不引入 `eval`、不关闭 `contextIsolation`、不放开页面 CSP；外部链接一律交给系统浏览器 |
| 依赖 | 优先使用 Node.js 与 Electron 内置能力；**不引入需要本地编译的原生模块**（这是本项目免配置安装的前提） |
| 数据库 | 建表语句统一写在 `src/main/services/database.ts` 的 `SCHEMA_STATEMENTS` 中；所有写操作使用预编译语句与参数绑定 |
| 许可证 | 新增第三方依赖必须是宽松型许可证（MIT / ISC / BSD / Apache-2.0），并同步更新 `THIRD-PARTY-LICENSES.md` 与 `package.json` |

### 提交信息约定

建议使用以下前缀，便于自动生成 CHANGELOG：

- `feat:` 新增功能
- `fix:` 修复缺陷
- `docs:` 文档变更
- `style:` 格式调整（不影响逻辑）
- `refactor:` 重构（不新增功能、不修缺陷）
- `perf:` 性能优化
- `test:` 测试相关
- `chore:` 构建流程或工具链变更

---

## 📄 许可证

本项目采用 **MIT License** 开源发布。

```text
MIT License

Copyright (c) 2025 何飞 (He Fei) <微信: 6731663>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

完整文本见 [`LICENSE`](./LICENSE)。第三方组件的许可证与合规声明见 [`THIRD-PARTY-LICENSES.md`](./THIRD-PARTY-LICENSES.md)。

---

## 🙏 致谢

花生苗 Markdown 编辑器站在众多优秀开源项目的肩上。衷心感谢以下项目及其维护者：

| 项目 | 在本软件中的角色 |
| --- | --- |
| [Electron](https://www.electronjs.org/) | 提供跨平台桌面运行时、原生窗口与 PDF / 截图导出能力 |
| [CodeMirror](https://codemirror.net/) | 提供轻量而强大的编辑器内核与装饰器 API |
| [markdown-it](https://github.com/markdown-it/markdown-it) | 提供符合 CommonMark 规范的 Markdown 解析引擎 |
| [KaTeX](https://katex.org/) | 提供快速优雅的数学公式排版 |
| [highlight.js](https://highlightjs.org/) | 提供代码块语法高亮 |
| [Mermaid](https://mermaid.js.org/) | 提供流程图、时序图、甘特图等图表渲染 |
| [SQLite](https://www.sqlite.org/) 与 [Node.js](https://nodejs.org/) | 提供嵌入式数据库与 FTS5 全文检索能力 |
| [esbuild](https://esbuild.github.io/) | 提供极速的构建体验 |
| [electron-builder](https://www.electron.build/) | 提供 Windows 与 Linux 安装包打包能力（含自定义安装路径与快捷方式选项） |
| 全部第三方依赖的作者与贡献者 | 详见 [`THIRD-PARTY-LICENSES.md`](./THIRD-PARTY-LICENSES.md) |

同时感谢 **Typora** 带来的「所见即所得」写作体验，它启发了本项目的产品设计方向。

特别感谢每一位提交 Issue、PR、分享主题与快捷键方案的用户 —— 是你们让这个项目变得更好。🌱

---

## 📚 相关文档

| 文档 | 面向 | 内容 |
| --- | --- | --- |
| [`docs/需求规格说明书.md`](./docs/需求规格说明书.md) | 所有人 | 需求基线：功能性需求、快捷键需求、非功能性需求、验收标准 |
| [`docs/详细设计说明书.md`](./docs/详细设计说明书.md) | 开发者 | 总体架构、IPC 接口清单、数据库 DDL、渲染引擎、实时渲染原理、打包设计、命令 ID 全表 |
| [`docs/用户手册.md`](./docs/用户手册.md) | 最终用户 | 安装、界面导览、语法速查、图片、主题、导出、快捷键大全、设置说明、故障排查 |
| [`docs/测试用例清单.md`](./docs/测试用例清单.md) | 测试人员 | 120+ 条测试用例与测试环境矩阵 |
| [`CHANGELOG.md`](./CHANGELOG.md) | 所有人 | 版本变更记录 |
| [`THIRD-PARTY-LICENSES.md`](./THIRD-PARTY-LICENSES.md) | 所有人 | 第三方组件、版本、许可证与合规声明 |

---

<div align="center">

**花生苗 Markdown 编辑器 · 作者 何飞 · 微信 6731663 · MIT License**

🌱 开源免费 · 所见即所得 · 轻量高性能

如果这个项目对你有帮助，欢迎点亮一个 ⭐ Star，也欢迎把它推荐给同样热爱写作的朋友。

</div>
