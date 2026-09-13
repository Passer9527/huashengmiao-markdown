/**
 * 花生苗 Markdown 编辑器 —— 主题定义
 * ------------------------------------------------------------------
 * 主题以纯文本形式定义在 TypeScript 中（而非独立 .css 文件），原因：
 *   1. 渲染进程需要把主题注入编辑器，主进程导出 HTML/PDF 时也需要同一份 CSS；
 *   2. 打包后无需再关心主题文件的路径与拷贝问题。
 *
 * 主题分为两部分：
 *   · 结构样式（BASE_DOC_CSS）：标题层级、间距、列表、表格等骨架，所有主题共用；
 *   · 配色主题（DOC_THEMES）：只定义 CSS 变量与少量特化规则。
 * 这样新增主题只需给出一组颜色变量，扩展成本极低。
 *
 * 作者：何飞    联系方式：微信 6731663
 * 开源协议：MIT
 */

/** 文档内容根容器的类名，主题样式均作用于它 */
export const DOC_ROOT_CLASS = 'hsm-preview';

/* ==================================================================
 * 一、结构样式（所有主题共用）
 * ================================================================== */

/**
 * 文档结构样式
 * 所有颜色与字号均取自 CSS 变量，便于主题覆盖。
 */
export const BASE_DOC_CSS = `
.${DOC_ROOT_CLASS} {
  font-family: var(--doc-font);
  font-size: var(--doc-font-size);
  line-height: var(--doc-line-height);
  color: var(--doc-text);
  background: var(--doc-bg);
  word-wrap: break-word;
  overflow-wrap: break-word;
  -webkit-font-smoothing: antialiased;
}

/* ---------------------------- 标题 ---------------------------- */
.${DOC_ROOT_CLASS} h1,
.${DOC_ROOT_CLASS} h2,
.${DOC_ROOT_CLASS} h3,
.${DOC_ROOT_CLASS} h4,
.${DOC_ROOT_CLASS} h5,
.${DOC_ROOT_CLASS} h6 {
  font-weight: 700;
  line-height: 1.35;
  margin: calc(var(--doc-para-gap) * 1.4) 0 calc(var(--doc-para-gap) * 0.6);
  color: var(--doc-heading);
  position: relative;
}
.${DOC_ROOT_CLASS} h1 { font-size: 2em;    padding-bottom: .3em; border-bottom: 1px solid var(--doc-border); }
.${DOC_ROOT_CLASS} h2 { font-size: 1.6em;  padding-bottom: .3em; border-bottom: 1px solid var(--doc-border); }
.${DOC_ROOT_CLASS} h3 { font-size: 1.3em; }
.${DOC_ROOT_CLASS} h4 { font-size: 1.1em; }
.${DOC_ROOT_CLASS} h5 { font-size: 1em; }
.${DOC_ROOT_CLASS} h6 { font-size: .9em; color: var(--doc-muted); }
.${DOC_ROOT_CLASS} > :first-child { margin-top: 0; }

/* ---------------------------- 段落与行内 ---------------------------- */
.${DOC_ROOT_CLASS} p { margin: 0 0 var(--doc-para-gap); }
.${DOC_ROOT_CLASS} strong { font-weight: 700; color: var(--doc-strong); }
.${DOC_ROOT_CLASS} em { font-style: italic; }
.${DOC_ROOT_CLASS} del { text-decoration: line-through; color: var(--doc-muted); }
.${DOC_ROOT_CLASS} mark {
  background: var(--doc-mark-bg);
  color: inherit;
  padding: .1em .25em;
  border-radius: 3px;
}
.${DOC_ROOT_CLASS} a {
  color: var(--doc-link);
  text-decoration: none;
  border-bottom: 1px solid transparent;
  cursor: pointer;
}
.${DOC_ROOT_CLASS} a:hover { border-bottom-color: var(--doc-link); }
.${DOC_ROOT_CLASS} sup, .${DOC_ROOT_CLASS} sub { font-size: .75em; line-height: 0; }
.${DOC_ROOT_CLASS} hr {
  border: none;
  border-top: 2px solid var(--doc-border);
  margin: calc(var(--doc-para-gap) * 1.6) 0;
}
.${DOC_ROOT_CLASS} img {
  max-width: var(--doc-image-max-width, 100%);
  height: auto;
  border-radius: var(--doc-radius);
  vertical-align: middle;
}
.${DOC_ROOT_CLASS} img[data-align="center"] { display: block; margin-left: auto; margin-right: auto; }
.${DOC_ROOT_CLASS} img[data-align="right"]  { display: block; margin-left: auto; margin-right: 0; }
.${DOC_ROOT_CLASS} img[data-align="left"]   { display: block; margin-left: 0; margin-right: auto; }

/* ---------------------------- 列表 ---------------------------- */
.${DOC_ROOT_CLASS} ul, .${DOC_ROOT_CLASS} ol { margin: 0 0 var(--doc-para-gap); padding-left: 1.8em; }
.${DOC_ROOT_CLASS} li { margin: .25em 0; }
.${DOC_ROOT_CLASS} li > ul, .${DOC_ROOT_CLASS} li > ol { margin: .25em 0; }
.${DOC_ROOT_CLASS} li.task-list-item { list-style: none; margin-left: -1.4em; padding-left: 1.4em; }
.${DOC_ROOT_CLASS} li.task-list-item input[type="checkbox"] {
  margin-right: .5em;
  vertical-align: middle;
  accent-color: var(--doc-accent);
  cursor: pointer;
}
.${DOC_ROOT_CLASS} dl dt { font-weight: 700; margin-top: .6em; }
.${DOC_ROOT_CLASS} dl dd { margin: .2em 0 .6em 1.6em; color: var(--doc-muted); }

/* ---------------------------- 引用 ---------------------------- */
.${DOC_ROOT_CLASS} blockquote {
  margin: 0 0 var(--doc-para-gap);
  padding: .2em 1em;
  color: var(--doc-quote-text);
  border-left: 4px solid var(--doc-quote-border);
  background: var(--doc-quote-bg);
  border-radius: 0 var(--doc-radius) var(--doc-radius) 0;
}
.${DOC_ROOT_CLASS} blockquote > :last-child { margin-bottom: 0; }

/* ---------------------------- 代码 ---------------------------- */
.${DOC_ROOT_CLASS} code {
  font-family: var(--doc-code-font);
  font-size: .88em;
  padding: .18em .38em;
  border-radius: 4px;
  background: var(--doc-code-inline-bg);
  color: var(--doc-code-inline-text);
}
.${DOC_ROOT_CLASS} pre {
  font-family: var(--doc-code-font);
  font-size: .875em;
  line-height: 1.6;
  margin: 0 0 var(--doc-para-gap);
  padding: 1em 1.15em;
  overflow-x: auto;
  border-radius: var(--doc-radius);
  background: var(--doc-code-bg);
  border: 1px solid var(--doc-code-border);
}
.${DOC_ROOT_CLASS} pre code {
  padding: 0;
  background: none;
  color: var(--doc-code-text);
  font-size: 1em;
  border-radius: 0;
}
/* 代码块右上角展示语言名 */
.${DOC_ROOT_CLASS} pre[data-lang]::before {
  content: attr(data-lang);
  position: absolute;
  top: 6px;
  right: 10px;
  font-size: 11px;
  letter-spacing: .05em;
  text-transform: uppercase;
  color: var(--doc-muted);
  opacity: .7;
  pointer-events: none;
}
.${DOC_ROOT_CLASS} pre[data-lang] { position: relative; }

/* ---------------------------- 表格 ---------------------------- */
.${DOC_ROOT_CLASS} .hsm-table-wrap { overflow-x: auto; margin: 0 0 var(--doc-para-gap); }
.${DOC_ROOT_CLASS} table {
  border-collapse: collapse;
  width: 100%;
  font-size: .95em;
  border: 1px solid var(--doc-border);
  border-radius: var(--doc-radius);
  overflow: hidden;
}
.${DOC_ROOT_CLASS} th, .${DOC_ROOT_CLASS} td {
  border: 1px solid var(--doc-border);
  padding: .5em .75em;
  text-align: left;
  vertical-align: top;
}
.${DOC_ROOT_CLASS} th { background: var(--doc-table-head-bg); font-weight: 700; }
.${DOC_ROOT_CLASS} tbody tr:nth-child(2n) { background: var(--doc-table-stripe); }
.${DOC_ROOT_CLASS} table[data-align="center"] { margin-left: auto; margin-right: auto; width: auto; min-width: 60%; }

/* ---------------------------- 数学公式 ---------------------------- */
.${DOC_ROOT_CLASS} .katex { font-size: 1.05em; }
.${DOC_ROOT_CLASS} .hsm-math-block {
  display: block;
  text-align: center;
  margin: var(--doc-para-gap) 0;
  padding: .6em 0;
  overflow-x: auto;
  position: relative;
}
.${DOC_ROOT_CLASS} .hsm-math-block .hsm-math-number {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  color: var(--doc-muted);
  font-size: .85em;
}
.${DOC_ROOT_CLASS} .hsm-math-error {
  color: #d1242f;
  background: rgba(209, 36, 47, .08);
  border-radius: 4px;
  padding: .1em .3em;
  font-family: var(--doc-code-font);
  font-size: .9em;
}

/* ---------------------------- 图表与容器 ---------------------------- */
.${DOC_ROOT_CLASS} .hsm-mermaid {
  display: flex;
  justify-content: center;
  margin: var(--doc-para-gap) 0;
  overflow-x: auto;
}
.${DOC_ROOT_CLASS} .hsm-mermaid svg { max-width: 100%; height: auto; }
.${DOC_ROOT_CLASS} .hsm-container {
  margin: 0 0 var(--doc-para-gap);
  padding: .8em 1em;
  border-radius: var(--doc-radius);
  border-left: 4px solid var(--doc-accent);
  background: var(--doc-quote-bg);
}
.${DOC_ROOT_CLASS} .hsm-container-title { font-weight: 700; margin-bottom: .3em; }
.${DOC_ROOT_CLASS} .hsm-container.warning { border-left-color: #d29922; background: rgba(210, 153, 34, .1); }
.${DOC_ROOT_CLASS} .hsm-container.tip     { border-left-color: #22a06b; background: rgba(34, 160, 107, .1); }
.${DOC_ROOT_CLASS} .hsm-container.danger  { border-left-color: #d1242f; background: rgba(209, 36, 47, .1); }

/* ---------------------------- 脚注 / 目录 ---------------------------- */
.${DOC_ROOT_CLASS} .footnotes {
  margin-top: calc(var(--doc-para-gap) * 2);
  padding-top: var(--doc-para-gap);
  border-top: 1px solid var(--doc-border);
  font-size: .9em;
  color: var(--doc-muted);
}
.${DOC_ROOT_CLASS} .footnotes ol { padding-left: 1.4em; }
.${DOC_ROOT_CLASS} .hsm-toc {
  margin: 0 0 var(--doc-para-gap);
  padding: .8em 1.2em;
  border: 1px dashed var(--doc-border);
  border-radius: var(--doc-radius);
}
.${DOC_ROOT_CLASS} .hsm-toc-title { font-weight: 700; margin-bottom: .4em; }
.${DOC_ROOT_CLASS} .hsm-toc ul { list-style: none; padding-left: 0; margin: 0; }
.${DOC_ROOT_CLASS} .hsm-toc li { margin: .15em 0; }
.${DOC_ROOT_CLASS} .hsm-toc a { color: var(--doc-link); }
.${DOC_ROOT_CLASS} .hsm-toc-level-2 { padding-left: 1em; }
.${DOC_ROOT_CLASS} .hsm-toc-level-3 { padding-left: 2em; }
.${DOC_ROOT_CLASS} .hsm-toc-level-4 { padding-left: 3em; }
.${DOC_ROOT_CLASS} .hsm-toc-level-5 { padding-left: 4em; }
.${DOC_ROOT_CLASS} .hsm-toc-level-6 { padding-left: 5em; }

/* ---------------------------- Front Matter ---------------------------- */
.${DOC_ROOT_CLASS} .hsm-front-matter {
  margin: 0 0 var(--doc-para-gap);
  border: 1px solid var(--doc-border);
  border-radius: var(--doc-radius);
  overflow: hidden;
  font-family: var(--doc-code-font);
  font-size: .85em;
}
.${DOC_ROOT_CLASS} .hsm-front-matter-title {
  padding: .4em .8em;
  background: var(--doc-table-head-bg);
  font-family: var(--doc-font);
  font-size: .95em;
  cursor: pointer;
  user-select: none;
}
.${DOC_ROOT_CLASS} .hsm-front-matter pre { margin: 0; border: none; border-radius: 0; }
.${DOC_ROOT_CLASS} .hsm-front-matter.collapsed pre { display: none; }

/* ---------------------------- 其它 ---------------------------- */
.${DOC_ROOT_CLASS} kbd {
  font-family: var(--doc-code-font);
  font-size: .82em;
  padding: .15em .45em;
  border: 1px solid var(--doc-border);
  border-bottom-width: 2px;
  border-radius: 4px;
  background: var(--doc-table-head-bg);
}
.${DOC_ROOT_CLASS} .hsm-anchor {
  position: absolute;
  left: -1em;
  opacity: 0;
  color: var(--doc-muted);
  text-decoration: none;
  font-weight: 400;
  cursor: pointer;
}
.${DOC_ROOT_CLASS} h1:hover .hsm-anchor,
.${DOC_ROOT_CLASS} h2:hover .hsm-anchor,
.${DOC_ROOT_CLASS} h3:hover .hsm-anchor,
.${DOC_ROOT_CLASS} h4:hover .hsm-anchor,
.${DOC_ROOT_CLASS} h5:hover .hsm-anchor,
.${DOC_ROOT_CLASS} h6:hover .hsm-anchor { opacity: 1; }
`;

/* ==================================================================
 * 二、配色主题
 * ================================================================== */

/** 主题定义结构 */
export interface ThemeDef {
  /** 主题标识 */
  id: string;
  /** 中文显示名 */
  label: string;
  /** 是否为深色主题（用于自动切换编辑器外层配色） */
  dark: boolean;
  /** 主题 CSS（CSS 变量 + 特化规则） */
  css: string;
}

/** 生成一组 CSS 变量声明块 */
function vars(map: Record<string, string>): string {
  return Object.entries(map)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
}

/** GitHub 主题（浅色，默认） */
const GITHUB_CSS = `
.${DOC_ROOT_CLASS} {
${vars({
  '--doc-bg': '#ffffff',
  '--doc-text': '#1f2328',
  '--doc-heading': '#1f2328',
  '--doc-strong': '#1f2328',
  '--doc-muted': '#656d76',
  '--doc-border': '#d1d9e0',
  '--doc-accent': '#1f883d',
  '--doc-link': '#0969da',
  '--doc-mark-bg': '#fff8c5',
  '--doc-radius': '6px',
  '--doc-quote-bg': 'rgba(31,35,40,.03)',
  '--doc-quote-border': '#d1d9e0',
  '--doc-quote-text': '#59636e',
  '--doc-code-bg': '#f6f8fa',
  '--doc-code-border': '#d1d9e0',
  '--doc-code-text': '#1f2328',
  '--doc-code-inline-bg': 'rgba(129,139,152,.12)',
  '--doc-code-inline-text': '#1f2328',
  '--doc-table-head-bg': '#f6f8fa',
  '--doc-table-stripe': '#f6f8fa',
  '--doc-image-max-width': '100%',
})}
}
`;

/** Newsprint 主题（报刊风，衬线字体、暖白底） */
const NEWSPRINT_CSS = `
.${DOC_ROOT_CLASS} {
${vars({
  '--doc-bg': '#fbfaf7',
  '--doc-text': '#2b2b2b',
  '--doc-heading': '#111111',
  '--doc-strong': '#000000',
  '--doc-muted': '#77705f',
  '--doc-border': '#ded8c8',
  '--doc-accent': '#8b5e34',
  '--doc-link': '#8b5e34',
  '--doc-mark-bg': '#ffe9a8',
  '--doc-radius': '2px',
  '--doc-quote-bg': 'transparent',
  '--doc-quote-border': '#c9c1ad',
  '--doc-quote-text': '#5c5647',
  '--doc-code-bg': '#f1eee6',
  '--doc-code-border': '#ded8c8',
  '--doc-code-text': '#3a3a3a',
  '--doc-code-inline-bg': '#efeadd',
  '--doc-code-inline-text': '#7a4a1d',
  '--doc-table-head-bg': '#f1eee6',
  '--doc-table-stripe': '#f7f4ec',
  '--doc-font': 'Georgia, "Songti SC", "SimSun", "Noto Serif SC", serif',
  '--doc-image-max-width': '100%',
})}
}
.${DOC_ROOT_CLASS} h1 { letter-spacing: -.01em; border-bottom: none; }
.${DOC_ROOT_CLASS} h2 { border-bottom: none; }
.${DOC_ROOT_CLASS} blockquote { font-style: italic; }
`;

/** Night 主题（深色，护眼） */
const NIGHT_CSS = `
.${DOC_ROOT_CLASS} {
${vars({
  '--doc-bg': '#1e1e1e',
  '--doc-text': '#d4d4d4',
  '--doc-heading': '#ffffff',
  '--doc-strong': '#ffffff',
  '--doc-muted': '#8a8a8a',
  '--doc-border': '#3a3a3a',
  '--doc-accent': '#4ec9b0',
  '--doc-link': '#4fc1ff',
  '--doc-mark-bg': '#5c4d00',
  '--doc-radius': '6px',
  '--doc-quote-bg': 'rgba(255,255,255,.04)',
  '--doc-quote-border': '#4a4a4a',
  '--doc-quote-text': '#a8a8a8',
  '--doc-code-bg': '#141414',
  '--doc-code-border': '#333333',
  '--doc-code-text': '#d4d4d4',
  '--doc-code-inline-bg': 'rgba(255,255,255,.1)',
  '--doc-code-inline-text': '#ce9178',
  '--doc-table-head-bg': '#2a2a2a',
  '--doc-table-stripe': '#252525',
  '--doc-image-max-width': '100%',
})}
}
.${DOC_ROOT_CLASS} mark { color: #ffe9a8; }
`;

/** Pixyll 主题（极简，无边框、宽行距） */
const PIXYLL_CSS = `
.${DOC_ROOT_CLASS} {
${vars({
  '--doc-bg': '#ffffff',
  '--doc-text': '#313131',
  '--doc-heading': '#1a1a1a',
  '--doc-strong': '#000000',
  '--doc-muted': '#9a9a9a',
  '--doc-border': '#eeeeee',
  '--doc-accent': '#e64a19',
  '--doc-link': '#e64a19',
  '--doc-mark-bg': '#fff3c4',
  '--doc-radius': '4px',
  '--doc-quote-bg': 'transparent',
  '--doc-quote-border': '#e0e0e0',
  '--doc-quote-text': '#6b6b6b',
  '--doc-code-bg': '#f8f8f8',
  '--doc-code-border': '#f0f0f0',
  '--doc-code-text': '#333333',
  '--doc-code-inline-bg': '#f4f4f4',
  '--doc-code-inline-text': '#c7254e',
  '--doc-table-head-bg': '#fafafa',
  '--doc-table-stripe': '#fcfcfc',
  '--doc-line-height': '1.85',
  '--doc-image-max-width': '100%',
})}
}
.${DOC_ROOT_CLASS} h1, .${DOC_ROOT_CLASS} h2 { border-bottom: none; }
.${DOC_ROOT_CLASS} h1 { font-size: 2.2em; letter-spacing: -.02em; }
.${DOC_ROOT_CLASS} h2 { font-size: 1.55em; }
.${DOC_ROOT_CLASS} a { border-bottom: 1px solid currentColor; }
`;

/** Whitey 主题（纯白极简，蓝色强调） */
const WHITEY_CSS = `
.${DOC_ROOT_CLASS} {
${vars({
  '--doc-bg': '#ffffff',
  '--doc-text': '#333333',
  '--doc-heading': '#111111',
  '--doc-strong': '#000000',
  '--doc-muted': '#999999',
  '--doc-border': '#e5e5e5',
  '--doc-accent': '#1e88e5',
  '--doc-link': '#1e88e5',
  '--doc-mark-bg': '#e3f2fd',
  '--doc-radius': '8px',
  '--doc-quote-bg': '#f7fbff',
  '--doc-quote-border': '#1e88e5',
  '--doc-quote-text': '#4a6b85',
  '--doc-code-bg': '#f7f9fb',
  '--doc-code-border': '#e3ebf2',
  '--doc-code-text': '#2c3e50',
  '--doc-code-inline-bg': '#eef4fa',
  '--doc-code-inline-text': '#1565c0',
  '--doc-table-head-bg': '#f7f9fb',
  '--doc-table-stripe': '#fbfdff',
  '--doc-image-max-width': '100%',
})}
}
.${DOC_ROOT_CLASS} h1 { border-bottom: none; font-weight: 800; }
.${DOC_ROOT_CLASS} h2 { border-bottom: none; }
`;

/** Vue 主题（青绿强调） */
const VUE_CSS = `
.${DOC_ROOT_CLASS} {
${vars({
  '--doc-bg': '#ffffff',
  '--doc-text': '#2c3e50',
  '--doc-heading': '#273849',
  '--doc-strong': '#1b2b3a',
  '--doc-muted': '#8492a6',
  '--doc-border': '#eaecef',
  '--doc-accent': '#42b983',
  '--doc-link': '#42b983',
  '--doc-mark-bg': '#e8f8f1',
  '--doc-radius': '6px',
  '--doc-quote-bg': 'rgba(66,185,131,.06)',
  '--doc-quote-border': '#42b983',
  '--doc-quote-text': '#4a6b5c',
  '--doc-code-bg': '#f8f8f8',
  '--doc-code-border': '#eaecef',
  '--doc-code-text': '#2c3e50',
  '--doc-code-inline-bg': '#f0f6f2',
  '--doc-code-inline-text': '#e96900',
  '--doc-table-head-bg': '#f6f8fa',
  '--doc-table-stripe': '#fafcfb',
  '--doc-image-max-width': '100%',
})}
}
.${DOC_ROOT_CLASS} h1 { border-bottom: none; color: #273849; }
.${DOC_ROOT_CLASS} h2 { border-bottom: 1px solid #eaecef; }
.${DOC_ROOT_CLASS} h2::before { content: '❯ '; color: #42b983; }
`;

/** 全部内置文档主题 */
export const DOC_THEMES: ThemeDef[] = [
  { id: 'github', label: 'GitHub（默认）', dark: false, css: GITHUB_CSS },
  { id: 'newsprint', label: 'Newsprint（报刊）', dark: false, css: NEWSPRINT_CSS },
  { id: 'night', label: 'Night（夜色）', dark: true, css: NIGHT_CSS },
  { id: 'pixyll', label: 'Pixyll（简约）', dark: false, css: PIXYLL_CSS },
  { id: 'whitey', label: 'Whitey（纯白）', dark: false, css: WHITEY_CSS },
  { id: 'vue', label: 'Vue（青绿）', dark: false, css: VUE_CSS },
];

/** 主题 ID -> 定义 */
export const DOC_THEME_MAP = new Map(DOC_THEMES.map((t) => [t.id, t]));

/* ==================================================================
 * 三、代码高亮主题（highlight.js 的 token 类名）
 * ================================================================== */

/** 代码主题定义 */
/** 代码主题的配色表 */
export interface CodeThemeColors {
  bg: string;
  border: string;
  text: string;
  comment: string;
  keyword: string;
  string: string;
  number: string;
  title: string;
  builtin: string;
  literal: string;
  type: string;
  attr: string;
  meta: string;
  tag: string;
  deletion: string;
  addition: string;
}

export interface CodeThemeDef {
  id: string;
  label: string;
  dark: boolean;
  /** 导出用样式（作用域为 .hsm-preview） */
  css: string;
  /** 原始配色，供编辑器内的代码块样式复用 */
  colors: CodeThemeColors;
}

/** 生成代码主题 CSS：先给出代码块底色，再逐类定义 token 颜色 */
function codeTheme(
  id: string,
  label: string,
  dark: boolean,
  colors: CodeThemeColors,
): CodeThemeDef {
  return {
    id,
    label,
    dark,
    colors,
    css: `
.${DOC_ROOT_CLASS} {
  --doc-code-bg: ${colors.bg};
  --doc-code-border: ${colors.border};
  --doc-code-text: ${colors.text};
}
.${DOC_ROOT_CLASS} pre code.hljs { color: ${colors.text}; }
.${DOC_ROOT_CLASS} .hljs-comment, .${DOC_ROOT_CLASS} .hljs-quote { color: ${colors.comment}; font-style: italic; }
.${DOC_ROOT_CLASS} .hljs-keyword, .${DOC_ROOT_CLASS} .hljs-selector-tag, .${DOC_ROOT_CLASS} .hljs-doctag,
.${DOC_ROOT_CLASS} .hljs-section, .${DOC_ROOT_CLASS} .hljs-name { color: ${colors.keyword}; font-weight: 600; }
.${DOC_ROOT_CLASS} .hljs-string, .${DOC_ROOT_CLASS} .hljs-regexp, .${DOC_ROOT_CLASS} .hljs-addition,
.${DOC_ROOT_CLASS} .hljs-template-tag, .${DOC_ROOT_CLASS} .hljs-template-variable { color: ${colors.string}; }
.${DOC_ROOT_CLASS} .hljs-number, .${DOC_ROOT_CLASS} .hljs-symbol, .${DOC_ROOT_CLASS} .hljs-bullet { color: ${colors.number}; }
.${DOC_ROOT_CLASS} .hljs-title, .${DOC_ROOT_CLASS} .hljs-title.function_, .${DOC_ROOT_CLASS} .hljs-title.class_ { color: ${colors.title}; }
.${DOC_ROOT_CLASS} .hljs-built_in, .${DOC_ROOT_CLASS} .hljs-selector-class, .${DOC_ROOT_CLASS} .hljs-selector-id { color: ${colors.builtin}; }
.${DOC_ROOT_CLASS} .hljs-literal, .${DOC_ROOT_CLASS} .hljs-variable.constant_ { color: ${colors.literal}; }
.${DOC_ROOT_CLASS} .hljs-type, .${DOC_ROOT_CLASS} .hljs-class .hljs-title { color: ${colors.type}; }
.${DOC_ROOT_CLASS} .hljs-attr, .${DOC_ROOT_CLASS} .hljs-attribute, .${DOC_ROOT_CLASS} .hljs-property { color: ${colors.attr}; }
.${DOC_ROOT_CLASS} .hljs-meta, .${DOC_ROOT_CLASS} .hljs-meta .hljs-keyword { color: ${colors.meta}; }
.${DOC_ROOT_CLASS} .hljs-tag { color: ${colors.tag}; }
.${DOC_ROOT_CLASS} .hljs-deletion { color: ${colors.deletion}; }
.${DOC_ROOT_CLASS} .hljs-emphasis { font-style: italic; }
.${DOC_ROOT_CLASS} .hljs-strong { font-weight: 700; }
.${DOC_ROOT_CLASS} .hljs-link { text-decoration: underline; }
`,
  };
}

/** 内置代码主题清单 */
export const CODE_THEMES: CodeThemeDef[] = [
  codeTheme('github', 'GitHub', false, {
    bg: '#f6f8fa', border: '#d1d9e0', text: '#1f2328',
    comment: '#6e7781', keyword: '#cf222e', string: '#0a3069',
    number: '#0550ae', title: '#8250df', builtin: '#953800',
    literal: '#0550ae', type: '#953800', attr: '#116329',
    meta: '#0550ae', tag: '#116329', deletion: '#82071e', addition: '#116329',
  }),
  codeTheme('dracula', 'Dracula', true, {
    bg: '#282a36', border: '#3b3d4b', text: '#f8f8f2',
    comment: '#6272a4', keyword: '#ff79c6', string: '#f1fa8c',
    number: '#bd93f9', title: '#50fa7b', builtin: '#8be9fd',
    literal: '#bd93f9', type: '#8be9fd', attr: '#50fa7b',
    meta: '#f1fa8c', tag: '#ff79c6', deletion: '#ff5555', addition: '#50fa7b',
  }),
  codeTheme('monokai', 'Monokai', true, {
    bg: '#272822', border: '#3b3c35', text: '#f8f8f2',
    comment: '#75715e', keyword: '#f92672', string: '#e6db74',
    number: '#ae81ff', title: '#a6e22e', builtin: '#66d9ef',
    literal: '#ae81ff', type: '#66d9ef', attr: '#a6e22e',
    meta: '#e6db74', tag: '#f92672', deletion: '#f92672', addition: '#a6e22e',
  }),
  codeTheme('one-dark', 'One Dark', true, {
    bg: '#282c34', border: '#3a3f4b', text: '#abb2bf',
    comment: '#5c6370', keyword: '#c678dd', string: '#98c379',
    number: '#d19a66', title: '#61afef', builtin: '#e5c07b',
    literal: '#d19a66', type: '#e5c07b', attr: '#e06c75',
    meta: '#56b6c2', tag: '#e06c75', deletion: '#e06c75', addition: '#98c379',
  }),
  codeTheme('solarized-light', 'Solarized Light', false, {
    bg: '#fdf6e3', border: '#eee8d5', text: '#657b83',
    comment: '#93a1a1', keyword: '#859900', string: '#2aa198',
    number: '#d33682', title: '#268bd2', builtin: '#b58900',
    literal: '#d33682', type: '#b58900', attr: '#268bd2',
    meta: '#cb4b16', tag: '#268bd2', deletion: '#dc322f', addition: '#859900',
  }),
];

/** 代码主题 ID -> 定义 */
export const CODE_THEME_MAP = new Map(CODE_THEMES.map((t) => [t.id, t]));

/**
 * 生成"编辑器内代码块"使用的代码主题样式
 *
 * 背景：主题样式表原本只作用于 `.hsm-preview`（导出 HTML 的根容器），
 *       而编辑器里的代码块是 `.hsm-codeblock`，两者不在同一个作用域，
 *       导致用户在设置里切换"代码高亮主题"时，编辑器内的代码块毫无变化。
 *       这里用同一份配色再生成一份编辑器作用域的样式，两处保持完全一致。
 *
 * @param codeThemeId 代码主题 ID
 */
export function buildEditorCodeCss(codeThemeId: string): string {
  const t = CODE_THEME_MAP.get(codeThemeId) ?? CODE_THEMES[0];
  const c = t.colors;

  return `
/* ================= 编辑器内代码块（跟随"代码高亮主题"设置）================= */
.hsm-codeblock {
  background: ${c.bg};
  border-color: ${c.border};
}
.hsm-codeblock pre {
  background: transparent;
}
.hsm-codeblock code.hljs {
  color: ${c.text};
}
.hsm-codeblock .hljs-comment,
.hsm-codeblock .hljs-quote { color: ${c.comment}; font-style: italic; }
.hsm-codeblock .hljs-keyword,
.hsm-codeblock .hljs-selector-tag,
.hsm-codeblock .hljs-doctag,
.hsm-codeblock .hljs-section,
.hsm-codeblock .hljs-name { color: ${c.keyword}; font-weight: 600; }
.hsm-codeblock .hljs-string,
.hsm-codeblock .hljs-regexp,
.hsm-codeblock .hljs-addition,
.hsm-codeblock .hljs-template-tag,
.hsm-codeblock .hljs-template-variable { color: ${c.string}; }
.hsm-codeblock .hljs-number,
.hsm-codeblock .hljs-symbol,
.hsm-codeblock .hljs-bullet { color: ${c.number}; }
.hsm-codeblock .hljs-title,
.hsm-codeblock .hljs-title.function_,
.hsm-codeblock .hljs-title.class_ { color: ${c.title}; }
.hsm-codeblock .hljs-built_in,
.hsm-codeblock .hljs-selector-class,
.hsm-codeblock .hljs-selector-id { color: ${c.builtin}; }
.hsm-codeblock .hljs-literal,
.hsm-codeblock .hljs-variable.constant_ { color: ${c.literal}; }
.hsm-codeblock .hljs-type,
.hsm-codeblock .hljs-class .hljs-title { color: ${c.type}; }
.hsm-codeblock .hljs-attr,
.hsm-codeblock .hljs-attribute,
.hsm-codeblock .hljs-property { color: ${c.attr}; }
.hsm-codeblock .hljs-meta,
.hsm-codeblock .hljs-meta .hljs-keyword { color: ${c.meta}; }
.hsm-codeblock .hljs-tag { color: ${c.tag}; }
.hsm-codeblock .hljs-deletion { color: ${c.deletion}; }
.hsm-codeblock .hljs-emphasis { font-style: italic; }
.hsm-codeblock .hljs-strong { font-weight: 700; }
.hsm-codeblock .hljs-link { text-decoration: underline; }
/* 代码块右上角的语言标签与底色保持对比度 */
.hsm-codeblock::before { color: ${c.comment}; }
`;
}

/**
 * 组装完整的文档样式表
 * @param themeId 文档主题 ID（'custom' 时返回空的主题部分，由调用方注入自定义 CSS）
 * @param codeThemeId 代码高亮主题 ID
 * @returns 完整的 CSS 文本（结构样式 + 主题配色）
 */
export function buildDocumentCss(themeId: string, codeThemeId: string): string {
  const theme = DOC_THEME_MAP.get(themeId);
  const codeThemeDef = CODE_THEME_MAP.get(codeThemeId) ?? CODE_THEMES[0];
  return [BASE_DOC_CSS, theme ? theme.css : '', codeThemeDef.css].join('\n');
}

/** 判断某个文档主题是否为深色主题 */
export function isDarkTheme(themeId: string): boolean {
  return DOC_THEME_MAP.get(themeId)?.dark ?? false;
}
