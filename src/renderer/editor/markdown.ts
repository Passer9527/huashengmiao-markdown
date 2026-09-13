/**
 * 花生苗 Markdown 编辑器 —— Markdown 渲染引擎
 * ------------------------------------------------------------------
 * 基于 markdown-it 构建，集成以下能力：
 *   · 基础语法 + GFM（表格、任务列表、删除线、自动链接）
 *   · 扩展语法：脚注、下标、上标、高亮 ==text==、Emoji 短代码、定义列表
 *   · 数学公式：$...$ 行内、$$...$$ 块级（KaTeX 渲染）
 *   · 代码高亮：highlight.js
 *   · 图表：Mermaid（异步渲染，占位符由界面层填充）
 *   · 目录：[TOC] 占位符，按文档标题自动生成
 *   · YAML Front Matter：单独折叠展示
 *   · 自定义容器：::: warning / tip / danger
 *   · 图片路径解析：把 Markdown 中的相对路径解析为可直接显示的地址
 *
 * 安全说明：渲染结果中的原始 HTML 默认被 markdown-it 转义（html: false），
 *           避免用户文档中的脚本被执行。代码块内容另做一次 HTML 转义。
 *
 * 作者：何飞    联系方式：微信 6731663
 * 开源协议：MIT
 */

import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs';
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs';
import { full as emojiPlugin } from 'markdown-it-emoji';
import footnotePlugin from 'markdown-it-footnote';
import taskListsPlugin from 'markdown-it-task-lists';
import markPlugin from 'markdown-it-mark';
import subPlugin from 'markdown-it-sub';
import supPlugin from 'markdown-it-sup';
import deflistPlugin from 'markdown-it-deflist';
import hljs from 'highlight.js/lib/common';
import katex from 'katex';
import { resolveResourceUrl } from '../../shared/path-utils';
import { renderCodeBlockHtml, clearShikiCache } from './shiki';

/* ==================================================================
 * 一、工具函数
 * ================================================================== */

/** HTML 转义 */
export function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 生成标题锚点 ID
 * 中文标题也能生成可用的锚点：保留中日韩文字、字母、数字，其余转为连字符。
 *
 * @param text 标题文本
 * @param used 已使用的锚点集合，用于去重
 */
export function slugify(text: string, used?: Set<string>): string {
  const base =
    text
      .trim()
      .toLowerCase()
      // 去掉行内 Markdown 标记
      .replace(/[*_`~[\]]/g, '')
      // 空白与常见标点转连字符
      .replace(/[\s\u3000]+/g, '-')
      .replace(/[^\p{L}\p{N}\-_.]/gu, '')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '') || 'heading';

  if (!used) return base;
  let id = base;
  let i = 1;
  while (used.has(id)) {
    id = `${base}-${i}`;
    i += 1;
  }
  used.add(id);
  return id;
}

/* ==================================================================
 * 二、自定义插件：数学公式
 * ================================================================== */

/**
 * 渲染 LaTeX 公式
 * @param tex LaTeX 源码
 * @param display 是否为块级公式
 * @param throwOnError 出错时是否抛出异常（false 则渲染为红色错误文本）
 */
export function renderMath(tex: string, display: boolean, throwOnError = false): string {
  try {
    return katex.renderToString(tex, {
      displayMode: display,
      throwOnError,
      errorColor: '#d1242f',
      // 允许 \ce{} 等 mhchem 扩展（KaTeX 内置 mhchem 支持需显式引入，这里用宽松模式）
      strict: false,
      trust: false,
      macros: {
        '\\RR': '\\mathbb{R}',
        '\\NN': '\\mathbb{N}',
        '\\ZZ': '\\mathbb{Z}',
      },
    });
  } catch (e) {
    return `<span class="hsm-math-error" title="${escapeHtml((e as Error).message)}">${escapeHtml(tex)}</span>`;
  }
}

/** 行内公式规则：匹配 $...$（不跨行，且不与 $$ 冲突） */
function mathInlineRule(state: StateInline, silent: boolean): boolean {
  const start = state.pos;
  const max = state.posMax;

  // 起始必须是单个 $
  if (state.src.charCodeAt(start) !== 0x24 /* $ */) return false;
  if (start + 1 >= max) return false;

  // 后面紧跟 $ 说明这是块级定界符，交给块级规则处理
  if (state.src.charCodeAt(start + 1) === 0x24) return false;

  let pos = start + 1;
  while (pos < max) {
    const ch = state.src.charCodeAt(pos);
    if (ch === 0x0a /* \n */) return false; // 行内公式不跨行
    if (ch === 0x5c /* \ */) {
      pos += 2; // 跳过转义字符
      continue;
    }
    if (ch === 0x24) break;
    pos += 1;
  }
  if (pos >= max || pos === start + 1) return false;

  const content = state.src.slice(start + 1, pos);
  // 排除 "$5"、"$ 100" 这类金额写法：首尾不能是空格，且内容中必须有非数字字符
  if (/^\s|\s$/.test(content)) return false;
  if (/^[\d,.\s]+$/.test(content)) return false;

  if (!silent) {
    const token = state.push('math_inline', 'math', 0);
    token.content = content;
    token.markup = '$';
  }
  state.pos = pos + 1;
  return true;
}

/** 块级公式规则：匹配独占一行的 $$ ... $$ */
function mathBlockRule(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  const startPos = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];

  if (startPos + 2 > max) return false;
  if (state.src.slice(startPos, startPos + 2) !== '$$') return false;
  // 缩进超过 3 个空格不认为是块级公式
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;

  // 单行形式：$$ E = mc^2 $$
  const afterOpen = state.src.slice(startPos + 2, max);
  const singleLine = afterOpen.indexOf('$$');
  if (singleLine >= 0) {
    const content = afterOpen.slice(0, singleLine);
    if (!silent) {
      const token = state.push('math_block', 'math', 0);
      token.block = true;
      token.content = content.trim();
      token.map = [startLine, startLine + 1];
      token.markup = '$$';
    }
    state.line = startLine + 1;
    return true;
  }

  let nextLine = startLine + 1;
  let found = false;
  let contentStart = state.bMarks[startLine] + 2 + (state.tShift[startLine] - state.bMarks[startLine] > 0 ? 0 : 0);

  // 逐行查找结束标记（允许行内出现 $$）
  for (; nextLine < endLine; nextLine += 1) {
    const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
    const lineEnd = state.eMarks[nextLine];
    const lineText = state.src.slice(lineStart, lineEnd);
    const closeIdx = lineText.indexOf('$$');
    if (closeIdx >= 0) {
      found = true;
      break;
    }
  }
  if (!found) return false;

  if (!silent) {
    const endPos = state.bMarks[nextLine] + state.tShift[nextLine] + state.src.slice(state.bMarks[nextLine] + state.tShift[nextLine], state.eMarks[nextLine]).indexOf('$$');
    const token = state.push('math_block', 'math', 0);
    token.block = true;
    token.content = state.src.slice(contentStart, endPos).trim();
    token.map = [startLine, nextLine + 1];
    token.markup = '$$';
  }
  state.line = nextLine + 1;
  return true;
}

/** 注册数学公式插件 */
function mathPlugin(md: MarkdownIt): void {
  md.inline.ruler.before('escape', 'math_inline', mathInlineRule);
  md.block.ruler.before('fence', 'math_block', mathBlockRule, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });

  md.renderer.rules['math_inline'] = (tokens, idx) => {
    const tex = tokens[idx].content;
    return `<span class="hsm-math-inline">${renderMath(tex, false)}</span>`;
  };

  md.renderer.rules['math_block'] = (tokens, idx) => {
    const tex = tokens[idx].content;
    return `<div class="hsm-math-block">${renderMath(tex, true)}</div>\n`;
  };
}

/* ==================================================================
 * 三、自定义插件：自定义容器 ::: warning
 * ================================================================== */

/** 支持的容器类型 */
const CONTAINER_TYPES: Record<string, string> = {
  warning: '警告',
  warn: '警告',
  tip: '提示',
  info: '说明',
  note: '笔记',
  danger: '危险',
  error: '错误',
  success: '成功',
};

/** 块级规则：解析 ::: 容器 */
function containerRule(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  const startPos = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];
  const lineText = state.src.slice(startPos, max);

  const open = /^:::\s*([a-zA-Z]+)?\s*(.*)$/.exec(lineText);
  if (!open) return false;
  if (silent) return true;

  const type = (open[1] || 'note').toLowerCase();
  const title = open[2]?.trim() || CONTAINER_TYPES[type] || type;

  // 查找配对的结束标记 :::
  let nextLine = startLine + 1;
  let found = false;
  for (; nextLine < endLine; nextLine += 1) {
    const s = state.bMarks[nextLine] + state.tShift[nextLine];
    const e = state.eMarks[nextLine];
    if (/^:::\s*$/.test(state.src.slice(s, e))) {
      found = true;
      break;
    }
  }
  if (!found) return false;

  const oldParent = state.parentType;
  const oldLineMax = state.lineMax;
  state.parentType = 'container' as typeof state.parentType;

  const openToken = state.push('container_open', 'div', 1);
  openToken.block = true;
  openToken.info = type;
  openToken.map = [startLine, nextLine];
  openToken.attrSet('class', `hsm-container ${type}`);
  openToken.meta = { title };

  state.md.block.tokenize(state, startLine + 1, nextLine);

  const closeToken = state.push('container_close', 'div', -1);
  closeToken.block = true;

  state.parentType = oldParent;
  state.lineMax = oldLineMax;
  state.line = nextLine + 1;
  return true;
}

/** 注册自定义容器插件 */
function containerPlugin(md: MarkdownIt): void {
  md.block.ruler.before('fence', 'hsm_container', containerRule, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });

  md.renderer.rules['container_open'] = (tokens, idx) => {
    const token = tokens[idx];
    const title = escapeHtml(String((token.meta as { title?: string })?.title ?? ''));
    const cls = token.attrGet('class') ?? 'hsm-container';
    return `<div class="${cls}"><div class="hsm-container-title">${title}</div>\n`;
  };
}

/* ==================================================================
 * 四、自定义插件：Mermaid 与 [TOC]
 * ================================================================== */

/** 判断一个代码块是否为 Mermaid 图表 */
export function isMermaidLang(lang: string): boolean {
  const l = (lang || '').trim().toLowerCase();
  return l === 'mermaid' || l === 'mmd';
}

/* ==================================================================
 * 五、创建 markdown-it 实例
 * ================================================================== */

/** 渲染上下文 */
export interface RenderContext {
  /** 当前文档绝对路径，用于解析图片相对路径 */
  docPath: string;
  /** 是否输出带样式的完整 HTML（导出时用），否则输出片段 */
  forExport?: boolean;
}

/**
 * 创建并配置 markdown-it 实例
 * 注意：实例会缓存渲染时的文档路径，因此每次渲染前需调用 setDocPath。
 */
export function createMarkdownIt(): MarkdownIt {
  const md = new MarkdownIt({
    html: false, // 出于安全考虑，不解析原始 HTML
    xhtmlOut: false,
    breaks: false, // 单个换行不产生 <br>，与 Typora 行为一致
    langPrefix: 'language-',
    linkify: true, // 自动识别裸链接
    typographer: false,
    // 代码高亮
    highlight(code: string, lang: string): string {
      const language = (lang || '').trim().split(/\s+/)[0].toLowerCase();

      // Mermaid 图表交由界面层异步渲染
      if (isMermaidLang(language)) {
        return `<div class="hsm-mermaid" data-mermaid="${escapeHtml(encodeURIComponent(code))}"></div>`;
      }

      let body: string;
      if (language && hljs.getLanguage(language)) {
        try {
          body = hljs.highlight(code, { language, ignoreIllegals: true }).value;
        } catch {
          body = escapeHtml(code);
        }
      } else if (language) {
        // 语言标识存在但 highlight.js 不支持，仍然尝试自动识别
        try {
          body = hljs.highlightAuto(code).value;
        } catch {
          body = escapeHtml(code);
        }
      } else {
        body = escapeHtml(code);
      }

      const langLabel = language ? ` data-lang="${escapeHtml(language)}"` : '';
      return `<pre${langLabel}><code class="hljs${language ? ` language-${escapeHtml(language)}` : ''}">${body}</code></pre>`;
    },
  });

  // 注册语法扩展插件
  md.use(emojiPlugin);
  md.use(footnotePlugin);
  md.use(taskListsPlugin, { enabled: true, label: true, labelAfter: true });
  md.use(markPlugin);
  md.use(subPlugin);
  md.use(supPlugin);
  md.use(deflistPlugin);
  md.use(mathPlugin);
  md.use(containerPlugin);

  /* -------------------- 标题锚点 -------------------- */
  const usedSlugs = new Set<string>();
  let slugReset = true;
  const defaultHeadingOpen =
    md.renderer.rules['heading_open'] ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

  md.renderer.rules['heading_open'] = (tokens, idx, options, env, self) => {
    if (slugReset) {
      usedSlugs.clear();
      slugReset = false;
    }
    const token = tokens[idx];
    const inline = tokens[idx + 1];
    const text = inline?.content ?? '';
    const id = slugify(text, usedSlugs);
    token.attrSet('id', id);
    return defaultHeadingOpen(tokens, idx, options, env, self);
  };

  /* -------------------- 表格包一层滚动容器 -------------------- */
  const defaultTableOpen =
    md.renderer.rules['table_open'] ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules['table_open'] = (tokens, idx, options, env, self) => {
    return `<div class="hsm-table-wrap">${defaultTableOpen(tokens, idx, options, env, self)}`;
  };
  const defaultTableClose =
    md.renderer.rules['table_close'] ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules['table_close'] = (tokens, idx, options, env, self) => {
    return `${defaultTableClose(tokens, idx, options, env, self)}</div>`;
  };

  /* -------------------- 图片：解析路径并支持尺寸/对齐 -------------------- */
  md.renderer.rules['image'] = (tokens, idx) => {
    const token = tokens[idx];
    const rawSrc = token.attrGet('src') ?? '';
    const docPath = (currentDocPath ?? '') as string;
    const resolved = resolveResourceUrl(rawSrc, docPath);

    const alt = escapeHtml(token.content || '');
    const title = token.attrGet('title');
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';

    // 支持 ![alt](src){width=300 align=center} 形式的属性（markdown-it 默认不支持，这里解析标题中的参数）
    const params = parseImageParams(title ?? '');
    const styleAttr = params.width ? ` style="width:${params.width}px"` : '';
    const alignAttr = params.align ? ` data-align="${params.align}"` : '';

    return `<img src="${escapeHtml(resolved)}" alt="${alt}" data-raw-src="${escapeHtml(rawSrc)}"${titleAttr}${styleAttr}${alignAttr} loading="lazy">`;
  };

  return md;
}

/** 当前渲染使用的文档路径（markdown-it 的 render 无法携带上下文，故用模块级变量） */
let currentDocPath = '';

/**
 * 解析图片标题中的参数
 * 例如 `![a](b.png "说明"){width=300 align=center}` 中的标记
 */
export function parseImageParams(title: string): { width?: number; align?: 'left' | 'center' | 'right' } {
  const out: { width?: number; align?: 'left' | 'center' | 'right' } = {};
  if (!title) return out;

  const w = /width\s*[=:]\s*(\d+)/i.exec(title);
  if (w) out.width = Number(w[1]);

  const a = /align\s*[=:]\s*(left|center|right)/i.exec(title);
  if (a) out.align = a[1].toLowerCase() as 'left' | 'center' | 'right';

  return out;
}

/* ==================================================================
 * 六、对外渲染接口
 * ================================================================== */

/** 标题信息（用于大纲） */
export interface HeadingInfo {
  /** 层级 1-6 */
  level: number;
  /** 标题纯文本 */
  text: string;
  /** 源码中的行号（从 0 开始） */
  line: number;
  /** 锚点 ID */
  id: string;
}

/**
 * 从 Markdown 源码中提取标题（用于大纲面板与 [TOC]）
 * 会跳过代码块与 Front Matter 中的伪标题。
 *
 * @param src Markdown 源码
 * @param withIds 是否生成锚点 ID
 */
export function extractHeadings(src: string, withIds = true): HeadingInfo[] {
  const lines = src.split(/\r\n|\r|\n/);
  const out: HeadingInfo[] = [];
  const used = new Set<string>();

  let inFence = false;
  let fenceChar = '';
  let inFrontMatter = false;
  let inMathBlock = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    // Front Matter：文档开头三横线之间
    if (i === 0 && /^---\s*$/.test(line)) {
      inFrontMatter = true;
      continue;
    }
    if (inFrontMatter) {
      if (/^---\s*$/.test(line)) inFrontMatter = false;
      continue;
    }

    // 围栏代码块
    const fence = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceChar = fence[1][0];
      } else if (fence[1][0] === fenceChar) {
        inFence = false;
      }
      continue;
    }
    if (inFence) continue;

    // 块级公式
    if (/^\s*\$\$\s*$/.test(line) || /^\s*\$\$/.test(line)) {
      inMathBlock = !inMathBlock && !line.trim().endsWith('$$');
      continue;
    }
    if (inMathBlock) continue;

    // ATX 标题
    const atx = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (atx) {
      const text = stripInline(atx[2]);
      out.push({
        level: atx[1].length,
        text,
        line: i,
        id: withIds ? slugify(text, used) : '',
      });
      continue;
    }

    // Setext 标题（下一行是 === 或 ---）
    if (i + 1 < lines.length && line.trim()) {
      const next = lines[i + 1];
      if (/^={3,}\s*$/.test(next)) {
        const text = stripInline(line);
        out.push({ level: 1, text, line: i, id: withIds ? slugify(text, used) : '' });
        i += 1;
        continue;
      }
      if (/^-{3,}\s*$/.test(next) && !/^\s*[-*+]\s/.test(line)) {
        const text = stripInline(line);
        out.push({ level: 2, text, line: i, id: withIds ? slugify(text, used) : '' });
        i += 1;
      }
    }
  }

  return out;
}

/** 去掉标题中的行内 Markdown 标记，得到纯文本 */
function stripInline(s: string): string {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/==(.*?)==/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\$([^$]*)\$/g, '$1')
    .trim();
}

/** 渲染结果 */
export interface RenderResult {
  /** 渲染后的 HTML 片段 */
  html: string;
  /** 文档中的标题列表 */
  headings: HeadingInfo[];
  /** Front Matter 的原始文本（无则空串） */
  frontMatter: string;
}

/**
 * 渲染整篇 Markdown
 * @param md markdown-it 实例
 * @param src Markdown 源码
 * @param ctx 渲染上下文
 */
export function renderDocument(md: MarkdownIt, src: string, ctx: RenderContext): RenderResult {
  currentDocPath = ctx.docPath || '';
  // 每次渲染都重置锚点去重集合
  (md.renderer.rules['heading_open'] as unknown as { __reset?: boolean }).__reset = true;

  // 分离 Front Matter
  const { frontMatter, body } = splitFrontMatter(src);

  const headings = extractHeadings(body);

  let html = md.render(body);

  // 替换 [TOC] 占位符
  html = html.replace(
    /<p>\s*\[TOC\]\s*<\/p>/gi,
    () => buildTocHtml(headings),
  );

  return { html, headings, frontMatter };
}

/** 分离 YAML Front Matter 与正文 */
export function splitFrontMatter(src: string): { frontMatter: string; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
  if (!m) return { frontMatter: '', body: src };
  return { frontMatter: m[1], body: src.slice(m[0].length) };
}

/**
 * 根据标题列表生成目录 HTML
 * @param headings 标题列表
 */
export function buildTocHtml(headings: HeadingInfo[]): string {
  if (headings.length === 0) return '';

  const items = headings
    .map(
      (h) =>
        `<li class="hsm-toc-level-${h.level}"><a href="#${escapeHtml(h.id)}">${escapeHtml(h.text)}</a></li>`,
    )
    .join('\n');

  return `<div class="hsm-toc"><div class="hsm-toc-title">目录</div><ul>\n${items}\n</ul></div>`;
}

/**
 * 代码高亮引擎的版本号
 *
 * Shiki 是异步加载的：首帧先用 highlight.js 渲染，Shiki 就绪后需要把
 * 已经渲染出来的代码块换成更精细的结果。代码块 Widget 在构造时记录当时的
 * 版本号，并在 eq() 中比较——版本号变化时 CodeMirror 会重建 Widget 的 DOM，
 * 于是高亮结果自动升级。
 */
let highlightVersion = 0;

/** 当前高亮引擎版本号 */
export function getHighlightVersion(): number {
  return highlightVersion;
}

/** 高亮引擎升级（Shiki 就绪后调用），返回新版本号 */
export function bumpHighlightVersion(): number {
  highlightVersion += 1;
  clearShikiCache();
  return highlightVersion;
}

/**
 * 渲染单个代码块（供实时预览的块级 Widget 与导出使用）
 *
 * 优先使用 Shiki：它能给出变量、运算符、标点等细粒度分类；
 * Shiki 尚未就绪或语言未收录时回退到 highlight.js。
 *
 * @param code 代码内容
 * @param lang 语言标识
 * @param themeId 代码主题标识，默认取当前设置
 */
export function renderCodeBlock(code: string, lang: string, themeId?: string): string {
  const theme = themeId ?? currentCodeTheme;
  return renderCodeBlockHtml(code, lang, theme);
}

/** 当前代码主题（由界面层在设置变化时写入，供代码块渲染使用） */
let currentCodeTheme = 'github';

/** 设置当前代码主题 */
export function setCodeTheme(themeId: string): void {
  currentCodeTheme = themeId;
}

/**
 * 渲染一个 Markdown 表格源码为 HTML
 * @param md markdown-it 实例
 * @param tableSrc 表格源码（含分隔行）
 */
export function renderTable(md: MarkdownIt, tableSrc: string): string {
  const prev = currentDocPath;
  try {
    return md.render(tableSrc.trim() + '\n');
  } catch {
    return `<pre>${escapeHtml(tableSrc)}</pre>`;
  } finally {
    currentDocPath = prev;
  }
}

/* ==================================================================
 * 七、文档统计
 * ================================================================== */

/** 文档统计数据 */
export interface DocStats {
  /** 字符数（不含空白） */
  chars: number;
  /** 总字符数（含空白） */
  charsWithSpace: number;
  /** 中文字符数 */
  cjkChars: number;
  /** 西文单词数 */
  words: number;
  /** 行数 */
  lines: number;
  /** 段落数 */
  paragraphs: number;
  /** 预估阅读时长（分钟） */
  readingMinutes: number;
}

/**
 * 计算文档统计信息
 * 中文按"字"计，英文按"词"计，阅读速度取中文 300 字/分钟、英文 200 词/分钟。
 *
 * @param text 文档纯文本
 */
export function computeStats(text: string): DocStats {
  const src = text ?? '';
  const lines = src.split(/\r\n|\r|\n/);

  // 去掉代码块内容后再统计，避免代码影响字数
  const plain = src.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');

  const cjk = plain.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) ?? [];
  const latinWords = plain
    .replace(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g, ' ')
    .match(/[A-Za-z0-9_'’-]+/g) ?? [];

  const chars = plain.replace(/\s/g, '').length;
  const paragraphs = plain.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length;

  const readingMinutes = Math.max(
    cjk.length > 0 || latinWords.length > 0 ? 1 : 0,
    Math.ceil(cjk.length / 300 + latinWords.length / 200),
  );

  return {
    chars,
    charsWithSpace: plain.length,
    cjkChars: cjk.length,
    words: latinWords.length,
    lines: lines.length,
    paragraphs,
    readingMinutes,
  };
}
