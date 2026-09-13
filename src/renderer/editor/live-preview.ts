/**
 * 花生苗 Markdown 编辑器 —— 实时渲染引擎（核心）
 * ------------------------------------------------------------------
 * 实现 Typora 式的"源码 / 渲染混合"编辑体验，原理如下：
 *
 *   1. 使用 CodeMirror 6 与 @lezer/markdown 解析出的语法树；
 *   2. 用 ViewPlugin 遍历语法树，为可见区域生成装饰（Decoration）：
 *        · Decoration.replace  —— 隐藏 Markdown 语法标记（如 **、#、>）
 *        · Decoration.mark     —— 给内容套上样式类（加粗、斜体、链接…）
 *        · Decoration.line     —— 给整行套上样式类（标题、引用、列表…）
 *        · Decoration.replace + WidgetType —— 把整块语法替换为渲染结果
 *          （代码块、表格、公式、图片、Mermaid 图表、分割线…）
 *   3. 凡是"光标 / 选区所在"的语法元素一律保持源码原样显示，
 *      从而做到"想改哪里就看哪里"；
 *   4. 所有计算只针对视口范围，长文档也能保持流畅。
 *
 * 作者：何飞    联系方式：微信 6731663
 * 开源协议：MIT
 */

import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { EditorState, StateField, type Range, type Text } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import type MarkdownIt from 'markdown-it';
import { renderCodeBlock, escapeHtml, renderMath, renderTable, extractHeadings, buildTocHtml, type HeadingInfo } from './markdown';
import { paintMermaid } from './mermaid';
import { resolveResourceUrl } from '../../shared/path-utils';

/* ==================================================================
 * 一、通用工具
 * ================================================================== */

/**
 * 判断某个区间是否与当前选区相交（相交则不隐藏其语法标记）
 *
 * @param state 编辑器状态
 * @param from 区间起点
 * @param to 区间终点
 * @param includeEnd 光标恰好落在区间终点时是否算"在其中"。
 *   · 行内元素传 true：光标紧跟在 **斜体** 之后时也应展开源码，便于继续输入；
 *   · 块级元素传 false：块的 to 是"下一块的起始位置"，
 *     若按闭区间判断，光标停在代码块 / 分割线之后的下一行行首时，
 *     整块会被误判为"正在编辑"而从渲染结果退回源码，体验很突兀。
 */
function overlapsSelection(state: EditorState, from: number, to: number, includeEnd = true): boolean {
  for (const r of state.selection.ranges) {
    const f = Math.min(r.from, r.to);
    const t = Math.max(r.from, r.to);

    // 光标（零长度选区）按 includeEnd 决定是否把终点算作内部
    if (f === t) {
      if (f >= from && (includeEnd ? f <= to : f < to)) return true;
      continue;
    }

    // 区间选区：只要与目标区间有交集即算相交
    if (f <= to && t >= from) return true;
  }
  return false;
}

/** 判断某一行是否包含光标 */
function lineHasCursor(state: EditorState, lineFrom: number, lineTo: number): boolean {
  for (const r of state.selection.ranges) {
    if (r.from >= lineFrom && r.from <= lineTo) return true;
    if (r.to >= lineFrom && r.to <= lineTo) return true;
  }
  return false;
}

/** 隐藏某个区间（不让它占据显示空间） */
function hide(from: number, to: number): Range<Decoration> | null {
  if (to <= from) return null;
  return Decoration.replace({}).range(from, to);
}

/* ==================================================================
 * 二、块级 Widget
 * ================================================================== */

/** 代码块 Widget：渲染为带语法高亮的代码块 */
class CodeBlockWidget extends WidgetType {
  constructor(
    readonly code: string,
    readonly lang: string,
  ) {
    super();
  }

  eq(other: CodeBlockWidget): boolean {
    return other.code === this.code && other.lang === this.lang;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'hsm-widget hsm-codeblock';
    const lang = (this.lang || '').trim().split(/\s+/)[0].toLowerCase();
    if (lang) wrap.dataset.lang = lang;

    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.className = 'hljs' + (lang ? ` language-${lang}` : '');
    code.innerHTML = renderCodeBlock(this.code, lang);
    pre.appendChild(code);
    wrap.appendChild(pre);
    return wrap;
  }
}

/** Mermaid 图表 Widget：异步渲染为 SVG */
class MermaidWidget extends WidgetType {
  constructor(readonly source: string) {
    super();
  }

  eq(other: MermaidWidget): boolean {
    return other.source === this.source;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'hsm-widget hsm-mermaid-host';
    // 交给调度器渲染：命中缓存则同步填入，否则异步渲染
    paintMermaid(wrap, this.source);
    return wrap;
  }

  /** 允许点击图表内部的交互元素（部分图表带可点击节点） */
  ignoreEvent(): boolean {
    return false;
  }
}

/** 表格 Widget：渲染为带边框的 HTML 表格 + 浮动操作条 */
class TableWidget extends WidgetType {
  constructor(
    readonly html: string,
    readonly source: string,
    readonly blockFrom: number,
  ) {
    super();
  }

  eq(other: TableWidget): boolean {
    return other.html === this.html && other.source === this.source;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'hsm-widget hsm-table-widget';
    wrap.innerHTML = this.html;

    // 浮动工具条：插入/删除行列、对齐方式
    const bar = document.createElement('div');
    bar.className = 'table-toolbar';

    const actions: Array<{ label: string; title: string; run: () => void }> = [
      { label: '↑+', title: '上方插入行', run: () => view.dispatch({ selection: { anchor: this.blockFrom } }) },
      { label: '↓+', title: '下方插入行', run: () => view.dispatch({ selection: { anchor: this.blockFrom } }) },
      { label: '←+', title: '左侧插入列', run: () => view.dispatch({ selection: { anchor: this.blockFrom } }) },
      { label: '→+', title: '右侧插入列', run: () => view.dispatch({ selection: { anchor: this.blockFrom } }) },
      { label: '编辑', title: '编辑表格源码', run: () => view.dispatch({ selection: { anchor: this.blockFrom + 1 } }) },
    ];

    for (const a of actions) {
      const btn = document.createElement('button');
      btn.className = 'table-toolbar__btn';
      btn.textContent = a.label;
      btn.title = a.title;
      btn.type = 'button';
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        a.run();
        view.focus();
      });
      bar.appendChild(btn);
    }

    wrap.appendChild(bar);
    return wrap;
  }

  /** 工具条按钮需要收到点击事件 */
  ignoreEvent(): boolean {
    return false;
  }
}

/** 图片 Widget */
class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly rawSrc: string,
    readonly alt: string,
    readonly width?: number,
  ) {
    super();
  }

  eq(other: ImageWidget): boolean {
    return other.src === this.src && other.alt === this.alt && other.width === this.width;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('span');
    wrap.className = 'hsm-widget hsm-image-widget';

    const img = document.createElement('img');
    img.src = this.src;
    img.alt = this.alt || '图片';
    img.title = this.rawSrc || this.src;
    if (this.width) img.style.width = `${this.width}px`;
    // 加载失败时给出可见提示，而不是留一片空白
    img.addEventListener('error', () => {
      wrap.classList.add('is-error');
      wrap.title = `图片加载失败：${this.rawSrc || this.src}`;
    });

    wrap.appendChild(img);
    return wrap;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/** 分割线 Widget */
class HorizontalRuleWidget extends WidgetType {
  eq(): boolean {
    return true;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'hsm-widget hsm-hr-widget';
    wrap.appendChild(document.createElement('hr'));
    return wrap;
  }
}

/** 块级公式 Widget */
class MathBlockWidget extends WidgetType {
  constructor(readonly tex: string) {
    super();
  }

  eq(other: MathBlockWidget): boolean {
    return other.tex === this.tex;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'hsm-widget hsm-mathblock-widget';
    wrap.innerHTML = renderMath(this.tex, true);
    return wrap;
  }
}

/** Front Matter Widget：默认折叠，点击展开 */
class FrontMatterWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }

  eq(other: FrontMatterWidget): boolean {
    return other.text === this.text;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'hsm-widget hsm-frontmatter-widget collapsed';

    const head = document.createElement('div');
    head.className = 'hsm-frontmatter-head';
    head.textContent = '文档属性（YAML Front Matter）';
    head.title = '点击展开 / 折叠';

    const body = document.createElement('pre');
    body.className = 'hsm-frontmatter-body';
    body.textContent = this.text;

    head.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      wrap.classList.toggle('collapsed');
    });

    wrap.appendChild(head);
    wrap.appendChild(body);
    return wrap;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/** 行内公式 Widget：把 $...$ 替换为 KaTeX 渲染结果 */
class InlineMathWidget extends WidgetType {
  constructor(readonly tex: string) {
    super();
  }

  eq(other: InlineMathWidget): boolean {
    return other.tex === this.tex;
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'hsm-widget hsm-math-inline';
    span.innerHTML = renderMath(this.tex, false);
    return span;
  }
}

/** 目录 Widget */
class TocWidget extends WidgetType {
  constructor(readonly html: string) {
    super();
  }

  eq(other: TocWidget): boolean {
    return other.html === this.html;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'hsm-widget hsm-toc-widget';
    wrap.innerHTML = this.html;
    return wrap;
  }
}

/** 无序列表项目符号 Widget */
class BulletWidget extends WidgetType {
  constructor(readonly ordered: boolean, readonly marker: string) {
    super();
  }

  eq(other: BulletWidget): boolean {
    return other.ordered === this.ordered && other.marker === this.marker;
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = this.ordered ? 'hsm-bullet-widget hsm-bullet-widget--ordered' : 'hsm-bullet-widget';
    // 无序列表统一显示为实心圆点；有序列表显示原始编号
    span.textContent = this.ordered ? this.marker : '•';
    return span;
  }
}

/**
 * 任务列表复选框 Widget
 * 点击即可勾选 / 取消，直接改写源码中的 [ ] 与 [x]。
 */
class TaskCheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly from: number,
    readonly to: number,
  ) {
    super();
  }

  eq(other: TaskCheckboxWidget): boolean {
    return other.checked === this.checked && other.from === this.from && other.to === this.to;
  }

  toDOM(view: EditorView): HTMLElement {
    const label = document.createElement('span');
    label.className = 'hsm-widget hsm-task-checkbox';

    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = this.checked;
    box.title = this.checked ? '点击取消完成' : '点击标记为完成';

    box.addEventListener('mousedown', (e) => {
      // 阻止默认行为，避免点击复选框时编辑器把光标移走
      e.preventDefault();
      e.stopPropagation();
      view.dispatch({
        changes: { from: this.from, to: this.to, insert: this.checked ? '[ ]' : '[x]' },
      });
      view.focus();
    });

    label.appendChild(box);
    return label;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/* ==================================================================
 * 三、语法树扫描与装饰生成
 * ================================================================== */

/** 扫描结果：块级公式区间 */
interface MathBlockRange {
  from: number;
  to: number;
  tex: string;
}

/** 行内公式匹配结果 */
interface InlineMathRange {
  from: number;
  to: number;
  tex: string;
  /** 内容起始位置（不含 $） */
  innerFrom: number;
  innerTo: number;
}

/** 实时渲染所需的外部依赖 */
export interface LivePreviewDeps {
  /** 获取当前文档路径（用于解析图片相对路径） */
  getDocPath: () => string;
  /** 获取 markdown-it 实例（用于渲染表格） */
  getMarkdownIt: () => MarkdownIt | null;
}

/** 装饰生成的可选参数 */
export interface BuildOptions {
  /** 是否重新提取标题（仅在文档内容变化时为 true，选区变化时无需重算） */
  computeHeadings?: boolean;
  /** 上一次的标题列表，用于在跳过计算时复用 */
  previousHeadings?: HeadingInfo[];
}

/** 装饰生成结果 */
export interface BuiltDecorations {
  /** 装饰集合 */
  decorations: DecorationSet;
  /** 文档标题列表（供大纲使用） */
  headings: HeadingInfo[];
}

/**
 * 根据当前编辑器状态生成全部装饰
 *
 * @param state 编辑器状态
 * @param deps 外部依赖
 */
export function buildDecorations(
  state: EditorState,
  deps: LivePreviewDeps,
  options: BuildOptions = {},
): BuiltDecorations {
  const ranges: Range<Decoration>[] = [];
  const doc = state.doc;
  const docPath = deps.getDocPath();
  // 全文只在需要时取一次，避免重复构造大字符串
  const fullText = doc.toString();

  /** 已经加过行装饰的行号，避免重复添加导致渲染异常 */
  const lineDecorated = new Set<number>();

  /** 添加行装饰（带去重） */
  const addLine = (pos: number, cls: string): void => {
    const line = doc.lineAt(Math.max(0, Math.min(pos, doc.length)));
    if (lineDecorated.has(line.number)) return;
    lineDecorated.add(line.number);
    ranges.push(Decoration.line({ class: cls }).range(line.from));
  };

  /** 给某一行的每一行加行装饰（用于引用、表格等多行块） */
  const addLineClass = (from: number, to: number, cls: string): void => {
    const startLine = doc.lineAt(from).number;
    const endLine = doc.lineAt(Math.max(from, to - 1)).number;
    for (let n = startLine; n <= endLine; n += 1) {
      const line = doc.line(n);
      if (lineDecorated.has(n)) continue;
      lineDecorated.add(n);
      ranges.push(Decoration.line({ class: cls }).range(line.from));
    }
  };

  /** 整行隐藏（连同换行符） */
  const hideWholeLines = (fromLine: number, toLine: number): void => {
    const start = doc.line(fromLine).from;
    const endLineObj = doc.line(toLine);
    const end = endLineObj.to < doc.length ? endLineObj.to + 1 : endLineObj.to;
    const deco = hide(start, end);
    if (deco) ranges.push(deco);
  };

  /* -------------------- 0. Front Matter -------------------- */
  // Front Matter 的块级折叠由 blockWidgetField（StateField）负责，
  // 插件内只能提供行内与行级装饰，故此处仅记录其结束行号供公式扫描排除。
  const frontMatterTo = findFrontMatterEndLine(state);

  /* -------------------- 1. 块级公式（正则预扫描） -------------------- */
  const mathBlocks = scanMathBlocks(state, frontMatterTo);

  /* -------------------- 2. 遍历语法树 -------------------- */
  const tree = syntaxTree(state);

  tree.iterate({
    enter(ref) {
      const node = ref.node;
      const from = node.from;
      const to = node.to;

      /** 返回 false 表示不再遍历该节点的子节点 */
      let skipChildren = false;

      switch (node.name) {
        /* ---------------- 标题 ---------------- */
        case 'ATXHeading1':
        case 'ATXHeading2':
        case 'ATXHeading3':
        case 'ATXHeading4':
        case 'ATXHeading5':
        case 'ATXHeading6': {
          const level = Number(node.name.slice(-1));
          addLine(from, `hsm-line-h${level}`);
          // 光标不在该行时隐藏 # 标记与后面的空格
          if (!lineHasCursor(state, doc.lineAt(from).from, doc.lineAt(from).to)) {
            const mark = node.getChild('HeaderMark');
            if (mark) {
              const after = mark.to + 1 <= to && doc.sliceString(mark.to, mark.to + 1) === ' ' ? 1 : 0;
              const deco = hide(mark.from, mark.to + after);
              if (deco) ranges.push(deco);
            }
          }
          break;
        }

        /* ---------------- Setext 标题 ---------------- */
        case 'SetextHeading1':
        case 'SetextHeading2': {
          const level = node.name.endsWith('1') ? 1 : 2;
          addLine(from, `hsm-line-h${level}`);
          // Setext 的下划线行（=== 或 ---）在非激活时整行隐藏
          const mark = node.getChild('HeaderMark');
          if (mark && !lineHasCursor(state, doc.lineAt(from).from, doc.lineAt(from).to)) {
            const lineNo = doc.lineAt(mark.from).number;
            hideWholeLines(lineNo, lineNo);
          }
          break;
        }

        /* ---------------- 代码块 ---------------- */
        case 'FencedCode':
        case 'CodeBlock': {
          // 代码块展开为源码时（光标在其中）给予行样式，便于识别范围；
          // 折叠为 Widget 的部分由 blockWidgetField 负责。
          if (overlapsSelection(state, from, to, false)) addLineClass(from, to, 'hsm-line-code');
          break;
        }

        /* ---------------- 引用 ---------------- */
        case 'Blockquote': {
          addLineClass(from, to, 'hsm-line-quote');
          // 隐藏每一行行首的 > 标记（光标所在行保留）
          for (let n = doc.lineAt(from).number; n <= doc.lineAt(Math.max(from, to - 1)).number; n += 1) {
            const line = doc.line(n);
            if (lineHasCursor(state, line.from, line.to)) continue;
            const m = /^(\s*)(>+\s?)/.exec(line.text);
            if (m) {
              const deco = hide(line.from + m[1].length, line.from + m[1].length + m[2].length);
              if (deco) ranges.push(deco);
            }
          }
          break;
        }

        /* ---------------- 列表 ---------------- */
        case 'BulletList':
        case 'OrderedList': {
          // 说明：语法树中的 ListMark 是 ListItem 的子节点，
          //       直接从列表节点遍历兄弟节点取不到，
          //       因此这里改为按行匹配行首标记，逻辑更简单也更稳健。
          const ordered = node.name === 'OrderedList';
          const startLine = doc.lineAt(from).number;
          const endLine = doc.lineAt(Math.max(from, to - 1)).number;

          for (let n = startLine; n <= endLine; n += 1) {
            const line = doc.line(n);
            // 任务列表项由复选框 Widget 负责，这里不再重复插入项目符号
            if (/^\s*[-*+]\s+\[[ xX]\]/.test(line.text)) continue;
            // 光标所在行保留源码，便于修改标记
            if (lineHasCursor(state, line.from, line.to)) continue;

            const m = /^(\s*)([-*+]|\d+[.)])(\s+)/.exec(line.text);
            if (!m) continue;

            const markerFrom = line.from + m[1].length;
            const markerTo = markerFrom + m[2].length + m[3].length;
            ranges.push(
              Decoration.replace({ widget: new BulletWidget(ordered, m[2]) }).range(markerFrom, markerTo),
            );
          }
          break;
        }

        /* ---------------- 任务列表 ---------------- */
        case 'TaskMarker': {
          const raw = doc.sliceString(from, to);
          const checked = /\[[xX]\]/.test(raw);
          if (!lineHasCursor(state, doc.lineAt(from).from, doc.lineAt(from).to)) {
            ranges.push(
              Decoration.replace({
                widget: new TaskCheckboxWidget(checked, from, to),
              }).range(from, to),
            );
            // 统计适配：任务列表项需要额外缩进，用行装饰处理
            addLine(from, 'hsm-line-task');
          }
          break;
        }

        /* ---------------- 分割线 ---------------- */
        case 'HorizontalRule': {
          // 分割线的渲染由 blockWidgetField 负责，此处不做处理
          void from;
          void to;
          break;
        }

        /* ---------------- 表格 ---------------- */
        case 'Table': {
          // 光标进入表格时展开为源码，用行样式标出表格范围
          if (overlapsSelection(state, from, to, false)) addLineClass(from, to, 'hsm-line-table');
          break;
        }

        /* ---------------- 图片 ---------------- */
        case 'Image': {
          if (overlapsSelection(state, from, to)) break;
          const raw = doc.sliceString(from, to);
          const parsed = parseImageSyntax(raw);
          if (!parsed) break;

          ranges.push(
            Decoration.replace({
              widget: new ImageWidget(
                resolveResourceUrl(parsed.src, docPath),
                parsed.src,
                parsed.alt,
                parsed.width,
              ),
            }).range(from, to),
          );
          skipChildren = true;
          break;
        }

        /* ---------------- 加粗 ---------------- */
        case 'StrongEmphasis': {
          const active = overlapsSelection(state, from, to);
          ranges.push(Decoration.mark({ class: 'hsm-strong' }).range(from, to));
          if (!active) {
            const c = node.cursor();
            if (c.firstChild()) {
              do {
                if (c.name === 'EmphasisMark') {
                  const d = hide(c.from, c.to);
                  if (d) ranges.push(d);
                }
              } while (c.nextSibling());
            }
          }
          break;
        }

        /* ---------------- 斜体 ---------------- */
        case 'Emphasis': {
          const active = overlapsSelection(state, from, to);
          ranges.push(Decoration.mark({ class: 'hsm-em' }).range(from, to));
          if (!active) {
            const c = node.cursor();
            if (c.firstChild()) {
              do {
                if (c.name === 'EmphasisMark') {
                  const d = hide(c.from, c.to);
                  if (d) ranges.push(d);
                }
              } while (c.nextSibling());
            }
          }
          break;
        }

        /* ---------------- 删除线 ---------------- */
        case 'Strikethrough': {
          const active = overlapsSelection(state, from, to);
          ranges.push(Decoration.mark({ class: 'hsm-del' }).range(from, to));
          if (!active) {
            const c = node.cursor();
            if (c.firstChild()) {
              do {
                if (c.name === 'EmphasisMark') {
                  const d = hide(c.from, c.to);
                  if (d) ranges.push(d);
                }
              } while (c.nextSibling());
            }
          }
          break;
        }

        /* ---------------- 行内代码 ---------------- */
        case 'InlineCode': {
          const active = overlapsSelection(state, from, to);
          ranges.push(Decoration.mark({ class: 'hsm-code' }).range(from, to));
          if (!active) {
            const c = node.cursor();
            if (c.firstChild()) {
              do {
                if (c.name === 'CodeMark') {
                  const d = hide(c.from, c.to);
                  if (d) ranges.push(d);
                }
              } while (c.nextSibling());
            }
          }
          break;
        }

        /* ---------------- 链接 ---------------- */
        case 'Link': {
          const active = overlapsSelection(state, from, to);
          ranges.push(Decoration.mark({ class: 'hsm-link' }).range(from, to));
          if (!active) {
            const c = node.cursor();
            if (c.firstChild()) {
              do {
                if (c.name === 'LinkMark' || c.name === 'URL' || c.name === 'LinkTitle') {
                  // 链接文字不隐藏，只隐藏 [ ]( ) 与地址
                  if (c.name === 'LinkMark') {
                    const raw = doc.sliceString(c.from, c.to);
                    // "[" 与 "]" 是文字边界，保留可见；"(" ")" 与 "](" 隐藏
                    if (raw === '[' || raw === ']' || raw === '![') continue;
                  }
                  const d = hide(c.from, c.to);
                  if (d) ranges.push(d);
                }
              } while (c.nextSibling());
            }
          }
          break;
        }

        /* ---------------- 自动链接 ---------------- */
        case 'Autolink': {
          ranges.push(Decoration.mark({ class: 'hsm-link' }).range(from, to));
          break;
        }

        /* ---------------- 高亮 ==text== ---------------- */
        case 'Highlight': {
          ranges.push(Decoration.mark({ class: 'hsm-mark' }).range(from, to));
          break;
        }

        default:
          break;
      }

      // 已作为整块 Widget 替换的节点，无需再遍历其子节点
      return skipChildren ? false : undefined;
    },
  });

  /* -------------------- 3. 行内公式（按行扫描） -------------------- */
  for (const inline of scanInlineMath(state, mathBlocks, frontMatterTo)) {
    if (overlapsSelection(state, inline.from, inline.to)) {
      // 光标在公式内：保留源码，仅用样式标出范围
      ranges.push(Decoration.mark({ class: 'hsm-math-inline' }).range(inline.innerFrom, inline.innerTo));
    } else {
      // 非激活状态：整体替换为 KaTeX 渲染结果（含隐藏两侧的 $ 符号）
      ranges.push(
        Decoration.replace({ widget: new InlineMathWidget(inline.tex) }).range(inline.from, inline.to),
      );
    }
  }

  /* -------------------- 4. 块级公式 -------------------- */
  // 块级公式的渲染由 blockWidgetField 负责；
  // 当光标进入公式块时，这里为其加上行样式以示范围。
  for (const mb of mathBlocks) {
    if (overlapsSelection(state, mb.from, mb.to, false)) addLineClass(mb.from, mb.to, 'hsm-line-math');
  }

  /* -------------------- 5. 光标行高亮 -------------------- */
  for (const r of state.selection.ranges) {
    const line = doc.lineAt(r.from);
    ranges.push(Decoration.line({ class: 'hsm-active-line' }).range(line.from));
  }

  /* -------------------- 6. 目录 [TOC] -------------------- */
  // 标题提取较耗时，仅在文档内容变化时重算；选区变化时复用上一次结果
  const headings =
    options.computeHeadings === false && options.previousHeadings
      ? options.previousHeadings
      : extractHeadings(fullText);

  const tocRe = /^\s*\[TOC\]\s*$/gim;
  let m: RegExpExecArray | null;
  while ((m = tocRe.exec(fullText)) !== null) {
    const tFrom = m.index + (m[0].length - m[0].trimStart().length);
    const tTo = tFrom + '[TOC]'.length;
    if (overlapsSelection(state, tFrom, tTo)) continue;
    // 只替换 [TOC] 本身，保留其所在段落结构
    ranges.push(
      Decoration.replace({ widget: new TocWidget(buildTocHtml(headings)) }).range(tFrom, tTo),
    );
  }

  return {
    decorations: Decoration.set(ranges, true),
    headings,
  };
}

/* ==================================================================
 * 四、辅助扫描函数
 * ================================================================== */

/**
 * 扫描块级公式（$$ ... $$）
 * 支持单行形式 $$x=1$$ 与多行形式，且会跳过代码块与 Front Matter 区域。
 *
 * @param state 编辑器状态
 * @param frontMatterEndLine Front Matter 结束行的行号（1 起），无则传 -1
 */
function scanMathBlocks(state: EditorState, frontMatterEndLine: number): MathBlockRange[] {
  const doc = state.doc;
  const out: MathBlockRange[] = [];

  let inFence = false;
  let fenceChar = '';
  let openFrom = -1;
  let openContentStart = -1;
  let openLine = -1;

  for (let i = 1; i <= doc.lines; i += 1) {
    if (frontMatterEndLine > 0 && i <= frontMatterEndLine) continue;

    const line = doc.line(i);
    const text = line.text;

    // 围栏代码块内不解析公式
    const fence = /^\s*(`{3,}|~{3,})/.exec(text);
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

    if (openFrom < 0) {
      // 查找起始 $$
      const idx = text.indexOf('$$');
      if (idx < 0) continue;
      // 缩进超过 3 个空格不认为是块级公式
      if (idx > 3) continue;

      const rest = text.slice(idx + 2);
      const close = rest.indexOf('$$');
      if (close >= 0) {
        // 单行形式
        out.push({
          from: line.from + idx,
          to: line.from + idx + 2 + close + 2,
          tex: rest.slice(0, close).trim(),
        });
      } else {
        openFrom = line.from + idx;
        openContentStart = line.from + idx + 2;
        openLine = i;
      }
    } else {
      // 查找结束 $$
      const idx = text.indexOf('$$');
      if (idx < 0) continue;
      out.push({
        from: openFrom,
        to: line.from + idx + 2,
        tex: doc.sliceString(openContentStart, line.from + idx).trim(),
      });
      openFrom = -1;
      openContentStart = -1;
      openLine = -1;
    }
  }
  void openLine;

  return out;
}

/**
 * 扫描行内公式（$...$）
 * 会跳过代码块、行内代码、块级公式覆盖区与 Front Matter。
 *
 * @param state 编辑器状态
 * @param mathBlocks 已识别的块级公式，用于排除
 * @param frontMatterEndLine Front Matter 结束行
 */
function scanInlineMath(
  state: EditorState,
  mathBlocks: MathBlockRange[],
  frontMatterEndLine: number,
): InlineMathRange[] {
  const doc = state.doc;
  const out: InlineMathRange[] = [];

  let inFence = false;
  let fenceChar = '';

  for (let i = 1; i <= doc.lines; i += 1) {
    if (frontMatterEndLine > 0 && i <= frontMatterEndLine) continue;

    const line = doc.line(i);
    const text = line.text;

    const fence = /^\s*(`{3,}|~{3,})/.exec(text);
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

    // 落在块级公式范围内的行整行跳过
    if (mathBlocks.some((b) => line.from >= b.from - 2 && line.to <= b.to + 2)) continue;

    // 逐个匹配 $...$，同时排除行内代码中的内容
    const re = /(?<!\\)\$([^$\n]+?)(?<!\\)\$/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = m.index + m[0].length;
      const inner = m[1];

      // 排除金额写法（纯数字）
      if (/^[\d,.\s]+$/.test(inner)) continue;
      // 排除行内代码中的 $（用反引号数量判断）
      const before = text.slice(0, start);
      const backticks = (before.match(/`/g) || []).length;
      if (backticks % 2 === 1) continue;

      out.push({
        from: line.from + start,
        to: line.from + end,
        tex: inner,
        innerFrom: line.from + start + 1,
        innerTo: line.from + end - 1,
      });
    }
  }

  return out;
}

/**
 * 解析图片语法 ![alt](src "title"){width=300}
 * @param raw 原始图片 Markdown 片段
 */
function parseImageSyntax(raw: string): { alt: string; src: string; width?: number } | null {
  const m = /^!\[([^\]]*)\]\(\s*<?([^\s>)]+)>?(?:\s+["']([^"']*)["'])?\s*\)(\{[^}]*\})?/.exec(raw);
  if (!m) return null;

  const alt = m[1] ?? '';
  const src = m[2] ?? '';
  const attrs = m[4] ?? '';

  const widthMatch = /width\s*[=:]\s*(\d+)/i.exec(attrs);
  return {
    alt,
    src,
    width: widthMatch ? Number(widthMatch[1]) : undefined,
  };
}

/* ==================================================================
 * 五、块级 Widget 的点击定位
 * ------------------------------------------------------------------
 * 问题：代码块 / 表格 / 公式块等在实时预览下是**原子替换的 Widget**
 *       （Decoration.replace 覆盖了整块源码）。CodeMirror 对原子区间的
 *       点击只会把光标放到区块的边界，于是"点在代码第 3 行，光标却跑到
 *       块外面去了"，用户看到的现象就是"点击处光标不跟随"。
 *
 * 对策：拦截落在块级 Widget 上的鼠标按下事件，按点击的几何位置换算出
 *       源码中的精确落点，再把光标放过去。定位到源码后该块会自动展开，
 *       用户随即可以在真实源码上继续编辑。
 * ================================================================== */

/** 复用的画布上下文，用于测量等宽字符宽度 */
let measureCtx: CanvasRenderingContext2D | null | undefined;

/**
 * 测量元素所用字体下一个数字字符的宽度（等宽字体下即字符宽度）
 * @param el 参照元素
 */
function measureCharWidth(el: Element): number {
  const cs = getComputedStyle(el);
  if (measureCtx === undefined) {
    measureCtx = document.createElement('canvas').getContext('2d');
  }
  if (measureCtx) {
    measureCtx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const w = measureCtx.measureText('0').width;
    if (w > 0) return w;
  }
  // 退路：按字号估算等宽字体的字符宽度
  return parseFloat(cs.fontSize) * 0.6;
}

/**
 * 计算表格某一列内容在源码行中的起始位置
 * @param lineText 该行的源码文本
 * @param lineFrom 该行在文档中的起始位置
 * @param cellIndex 列序号（0 起）
 */
function cellContentStart(lineText: string, lineFrom: number, cellIndex: number): number {
  let pipes = 0;
  let i = 0;
  for (; i < lineText.length; i += 1) {
    if (lineText[i] === '|') {
      pipes += 1;
      if (pipes === cellIndex + 1) {
        i += 1;
        break;
      }
    }
  }
  // 跳过单元格内容前的空格
  while (i < lineText.length && lineText[i] === ' ') i += 1;
  return lineFrom + Math.min(i, lineText.length);
}

/**
 * 找出屏幕坐标落在哪个"已渲染"的块级元素上
 *
 * @param view 编辑器视图
 * @param y 点击的纵坐标
 * @returns 命中的块范围；未命中返回 null
 */
function blockAtPoint(view: EditorView, y: number): BlockRange | null {
  const state = view.state;
  for (const block of scanBlocksCached(state)) {
    // 已经展开为源码的块不参与（此时它本身就是普通文本）
    if (overlapsSelection(state, block.from, block.to, false)) continue;

    const top = view.coordsAtPos(block.from, -1);
    const bottom = view.coordsAtPos(Math.max(block.from, block.to - 1), 1);
    if (!top || !bottom) continue;

    // 块级元素在垂直方向依次排列，不重叠，因此按纵向区间即可唯一确定
    if (y >= top.top - 2 && y <= bottom.bottom + 2) return block;
  }
  return null;
}

/**
 * 把"点击块级 Widget 的屏幕坐标"换算为文档中的目标位置
 *
 * @param view 编辑器视图
 * @param block 命中的块
 * @param x 点击横坐标
 * @param y 点击纵坐标
 */
function resolveBlockClickPosition(view: EditorView, block: BlockRange, x: number, y: number): number {
  const doc = view.state.doc;
  const dom = document.elementFromPoint(x, y) as HTMLElement | null;
  const widget = dom?.closest('.hsm-widget') as HTMLElement | null;

  /* -------------------- 代码块：按行高换算行、按字符宽换算列 -------------------- */
  if (block.kind === 'code' && widget) {
    const pre = widget.querySelector('pre');
    if (pre) {
      const rect = pre.getBoundingClientRect();
      const cs = getComputedStyle(pre);
      const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.6 || 20;
      const padTop = parseFloat(cs.paddingTop) || 0;
      const padLeft = parseFloat(cs.paddingLeft) || 0;

      // 点击落在代码的第几行
      const lineIdx = Math.max(0, Math.floor((y - rect.top - padTop) / lineHeight));
      const firstLineNo = doc.lineAt(block.contentFrom).number;
      const lastLineNo = doc.lineAt(Math.max(block.contentFrom, block.contentTo - 1)).number;
      const targetLine = doc.line(Math.min(firstLineNo + lineIdx, lastLineNo));

      // 点击落在该行的第几列
      const charW = measureCharWidth(pre);
      const col = charW > 0 ? Math.round((x - rect.left - padLeft) / charW) : 0;
      return Math.min(targetLine.from + Math.max(0, col), targetLine.to);
    }
  }

  /* -------------------- 表格：换算到被点击单元格的源码位置 -------------------- */
  if (block.kind === 'table') {
    const cell = dom?.closest('td, th') as HTMLTableCellElement | null;
    const table = dom?.closest('table');
    const row = cell?.parentElement ?? null;
    if (cell && table && row) {
      const rows = Array.from(table.querySelectorAll('tr'));
      const rowIdx = rows.indexOf(row as HTMLTableRowElement);
      const tableStartLineNo = doc.lineAt(block.from).number;
      // 源码中：第 0 行是表头，第 1 行是分隔行，正文从第 2 行开始
      const lineNo = tableStartLineNo + (rowIdx <= 0 ? 0 : rowIdx + 1);
      if (lineNo <= doc.lines) {
        const line = doc.line(lineNo);
        return cellContentStart(line.text, line.from, cell.cellIndex);
      }
    }
  }

  /* -------------------- 公式 / 图表 / 分割线 / Front Matter：定位到块首 -------------------- */
  return block.from;
}

/**
 * 处理块级 Widget 上的鼠标按下：把光标放到点击位置对应的源码处
 *
 * @param view 编辑器视图
 * @param event 鼠标事件
 * @returns 是否已接管该事件
 */
function handleBlockWidgetMouseDown(view: EditorView, event: MouseEvent): boolean {
  if (event.button !== 0) return false;

  const target = event.target as HTMLElement | null;
  const widget = target?.closest('.hsm-widget');
  if (!widget) return false;

  // Widget 内部的交互元素要自己处理，不能被我们接管
  if (target?.closest('input, button, a, select, textarea, .table-toolbar, .hsm-frontmatter-head')) {
    return false;
  }

  const block = blockAtPoint(view, event.clientY);
  if (!block) return false;

  const pos = resolveBlockClickPosition(view, block, event.clientX, event.clientY);

  // 阻止 CodeMirror 把光标丢到原子块的边界上
  event.preventDefault();
  event.stopPropagation();

  view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
  view.focus();
  return true;
}

/* ==================================================================
 * 六、CodeMirror 扩展：实时渲染插件
 * ================================================================== */

/** 标题变化的回调签名 */
export type HeadingsListener = (headings: HeadingInfo[]) => void;

/**
 * 创建实时渲染扩展
 *
 * @param deps 外部依赖
 * @param onHeadings 文档标题发生变化时的回调（用于刷新大纲面板）
 */
export function livePreview(deps: LivePreviewDeps, onHeadings?: HeadingsListener) {
  return ViewPlugin.fromClass(
    class {
      /** 当前装饰集合 */
      decorations: DecorationSet;

      /** 最近一次解析出的标题列表 */
      headings: HeadingInfo[] = [];

      /** 标题签名，用于判断是否真的发生了变化，避免无谓的界面刷新 */
      private headingSignature = '';

      /** 编辑器宿主元素（销毁时需要解绑事件） */
      private hostEl: HTMLElement;

      /** 块级 Widget 点击处理函数 */
      private onMouseDown: (event: MouseEvent) => void;

      constructor(view: EditorView) {
        const built = buildDecorations(view.state, deps, { computeHeadings: true });
        this.decorations = built.decorations;
        this.headings = built.headings;
        this.headingSignature = signatureOf(built.headings);

        // 在宿主元素的**捕获阶段**监听鼠标按下：
        // 这样可以在 CodeMirror 自身的输入处理之前接管"点击块级 Widget"的场景，
        // 把光标直接放到点击处对应的源码位置，而不是原子块的边界。
        this.hostEl = view.dom;
        this.onMouseDown = (event: MouseEvent) => {
          handleBlockWidgetMouseDown(view, event);
        };
        this.hostEl.addEventListener('mousedown', this.onMouseDown, true);
      }

      /** 插件销毁时解绑事件，避免内存泄漏 */
      destroy(): void {
        this.hostEl?.removeEventListener('mousedown', this.onMouseDown, true);
      }

      update(update: ViewUpdate): void {
        // 以下任一情况都需要重新计算装饰
        const contentChanged = update.docChanged;
        const selectionChanged = update.selectionSet;
        const viewportChanged = update.viewportChanged || update.geometryChanged;

        if (!contentChanged && !selectionChanged && !viewportChanged) return;

        const built = buildDecorations(update.view.state, deps, {
          // 只有内容变化时才重新提取标题，选区变化时直接复用
          computeHeadings: contentChanged,
          previousHeadings: this.headings,
        });

        this.decorations = built.decorations;

        if (contentChanged) {
          this.headings = built.headings;
          const sig = signatureOf(built.headings);
          if (sig !== this.headingSignature) {
            this.headingSignature = sig;
            onHeadings?.(built.headings);
          }
        }
      }
    },
    {
      // 把装饰集合交给 CodeMirror 渲染。
      // 说明：块级 Widget 的点击定位不走 eventHandlers（其返回值语义不足以
      //       阻止 CodeMirror 的原子定位），而是在构造函数里于宿主元素上
      //       以捕获阶段直接接管，见 handleBlockWidgetMouseDown。
      decorations: (value) => value.decorations,
    },
  );
}

/** 生成标题列表的签名，用于变化检测 */
function signatureOf(headings: HeadingInfo[]): string {
  let s = '';
  for (const h of headings) s += `${h.level}:${h.line}:${h.text}|`;
  return s;
}

/**
 * 源码模式扩展：不做任何渲染，仅保留最基础的语法高亮
 * 与实时渲染二选一，通过 Compartment 动态切换。
 */
export const sourceModeExtension = EditorView.theme({
  '.cm-content': { fontFamily: 'var(--ui-font-mono)' },
});

/* ==================================================================
 * 六、块级装饰（StateField）
 * ------------------------------------------------------------------
 * CodeMirror 6 有一项硬性限制：**块级装饰不能由 ViewPlugin 提供**
 * （详见官方文档 "Block decorations may not be specified via plugins"）。
 * 因此代码块、表格、块级公式、分割线、Front Matter 这些需要整块替换的
 * 元素，统一由本节的 StateField 负责生成。
 *
 * 为了同时兼顾准确性与性能，这里不依赖语法树，而是对文档文本做一次
 * 逐行扫描，得到所有块级元素的范围；扫描结果按文档对象缓存，
 * 因此"仅移动光标"时无需重新扫描。
 * ================================================================== */

/** 块级元素种类 */
type BlockKind = 'frontmatter' | 'code' | 'math' | 'table' | 'hr';

/** 一个块级元素的范围信息 */
interface BlockRange {
  /** 元素种类 */
  kind: BlockKind;
  /** 起始位置（所在行行首） */
  from: number;
  /** 结束位置（末行换行符之后，即下一行行首） */
  to: number;
  /** 内容起始位置（用于代码块与公式块取正文） */
  contentFrom: number;
  /** 内容结束位置 */
  contentTo: number;
  /** 代码块的语言标识 */
  lang: string;
}

/** 单行位置信息 */
interface LineSpan {
  /** 行首位置 */
  from: number;
  /** 行尾位置（不含换行符） */
  to: number;
  /** 下一行行首位置（含换行符） */
  end: number;
}

/**
 * 计算每一行的起止位置
 * 支持 LF 与 CRLF 两种换行符。
 *
 * @param text 文档全文
 */
function computeLineSpans(text: string): LineSpan[] {
  const spans: LineSpan[] = [];
  let from = 0;

  for (let i = 0; i <= text.length; i += 1) {
    if (i === text.length || text.charCodeAt(i) === 10 /* \n */) {
      let to = i;
      // CRLF：把 \r 排除在行内容之外
      if (to > from && text.charCodeAt(to - 1) === 13) to -= 1;
      spans.push({ from, to, end: Math.min(i + 1, text.length) });
      from = i + 1;
    }
  }
  return spans;
}

/**
 * 找出 YAML Front Matter 的结束行号
 * @param state 编辑器状态
 * @returns 结束行的行号（1 起）；不存在时返回 -1
 */
function findFrontMatterEndLine(state: EditorState): number {
  const doc = state.doc;
  if (doc.lines < 3) return -1;
  if (!/^---\s*$/.test(doc.line(1).text)) return -1;
  for (let i = 2; i <= Math.min(doc.lines, 300); i += 1) {
    if (/^---\s*$/.test(doc.line(i).text)) return i;
  }
  return -1;
}

/** 判断某行是否为表格分隔行（形如 | --- | :---: |） */
function isTableDelimiterRow(line: string): boolean {
  if (!line.includes('|') || !line.includes('-')) return false;
  return /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(line);
}

/** 判断某行是否为无序/有序列表项，用于排除 Setext 标题的下划线 */
function looksLikeListItem(line: string): boolean {
  return /^\s*([-*+]|\d+\.)\s+/.test(line);
}

/**
 * 扫描文档中的全部块级元素
 *
 * @param doc 文档对象
 * @param frontMatterEndLine Front Matter 结束行号（无则 -1）
 */
function scanBlocks(doc: Text, frontMatterEndLine: number): BlockRange[] {
  const text = doc.toString();
  const lines = computeLineSpans(text);
  const out: BlockRange[] = [];

  /* -------------------- Front Matter -------------------- */
  if (frontMatterEndLine > 1 && lines.length >= frontMatterEndLine) {
    const startIdx = 0;
    const endIdx = frontMatterEndLine - 1; // 结束标记行（0 起）
    out.push({
      kind: 'frontmatter',
      from: lines[startIdx].from,
      to: lines[endIdx].end,
      contentFrom: lines[1]?.from ?? lines[startIdx].to,
      contentTo: lines[endIdx - 1]?.to ?? lines[startIdx].to,
      lang: '',
    });
  }

  let i = frontMatterEndLine > 1 ? frontMatterEndLine : 0;

  while (i < lines.length) {
    const span = lines[i];
    const line = text.slice(span.from, span.to);

    /* -------------------- 围栏代码块 -------------------- */
    const fenceMatch = /^(\s*)(`{3,}|~{3,})(.*)$/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[2][0];
      const lang = fenceMatch[3].trim();
      const closeRe = marker === '`' ? /^\s*`{3,}\s*$/ : /^\s*~{3,}\s*$/;

      let j = i + 1;
      let closed = false;
      for (; j < lines.length; j += 1) {
        if (closeRe.test(text.slice(lines[j].from, lines[j].to))) {
          closed = true;
          break;
        }
      }

      const endIdx = closed ? j : lines.length - 1;
      out.push({
        kind: 'code',
        from: span.from,
        to: lines[endIdx].end,
        contentFrom: span.end,
        contentTo: lines[endIdx].from,
        lang,
      });
      i = endIdx + 1;
      continue;
    }

    /* -------------------- 块级公式 $$ ... $$ -------------------- */
    if (/^\s*\$\$/.test(line) && line.indexOf('$$') <= 3) {
      const openIdx = line.indexOf('$$');
      const rest = line.slice(openIdx + 2);
      const closeSameLine = rest.indexOf('$$');

      if (closeSameLine >= 0) {
        // 单行形式：$$ E = mc^2 $$
        out.push({
          kind: 'math',
          from: span.from,
          to: span.end,
          contentFrom: span.from + openIdx + 2,
          contentTo: span.from + openIdx + 2 + closeSameLine,
          lang: '',
        });
        i += 1;
        continue;
      }

      // 多行形式：向下寻找结束标记
      let j = i + 1;
      let closeIdx = -1;
      for (; j < lines.length; j += 1) {
        const c = text.indexOf('$$', lines[j].from);
        if (c >= 0 && c <= lines[j].to) {
          closeIdx = c;
          break;
        }
      }

      if (closeIdx < 0) {
        // 未闭合：按到文档末尾处理，避免残留源码影响阅读
        out.push({
          kind: 'math',
          from: span.from,
          to: lines[lines.length - 1].end,
          contentFrom: span.end,
          contentTo: lines[lines.length - 1].to,
          lang: '',
        });
        i = lines.length;
        continue;
      }

      out.push({
        kind: 'math',
        from: span.from,
        to: lines[j].end,
        contentFrom: span.end,
        contentTo: closeIdx,
        lang: '',
      });
      i = j + 1;
      continue;
    }

    /* -------------------- 表格 -------------------- */
    if (line.includes('|') && i + 1 < lines.length) {
      const nextLine = text.slice(lines[i + 1].from, lines[i + 1].to);
      if (isTableDelimiterRow(nextLine)) {
        let j = i + 1;
        // 继续吞并后续仍是表格行的内容
        while (j + 1 < lines.length) {
          const candidate = text.slice(lines[j + 1].from, lines[j + 1].to);
          if (!candidate.includes('|') || candidate.trim() === '') break;
          j += 1;
        }
        out.push({
          kind: 'table',
          from: span.from,
          to: lines[j].end,
          contentFrom: span.from,
          contentTo: lines[j].to,
          lang: '',
        });
        i = j + 1;
        continue;
      }
    }

    /* -------------------- 分割线 -------------------- */
    // 形如 ---、***、___（至少三个），且上一行不是普通文字（排除 Setext 标题）
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      const prevLine = i > 0 ? text.slice(lines[i - 1].from, lines[i - 1].to) : '';
      const isSetextUnderline = prevLine.trim() !== '' && !looksLikeListItem(prevLine);
      const insideFrontMatter = frontMatterEndLine > 1 && i < frontMatterEndLine;
      if (!isSetextUnderline && !insideFrontMatter) {
        out.push({
          kind: 'hr',
          from: span.from,
          to: span.end,
          contentFrom: span.from,
          contentTo: span.to,
          lang: '',
        });
      }
    }

    i += 1;
  }

  return out;
}

/** 扫描结果缓存：文档对象未变化时直接复用 */
let cachedDocRef: Text | null = null;
let cachedBlocks: BlockRange[] = [];

/**
 * 带缓存的块级元素扫描
 * 只有文档内容真正发生变化（Text 对象被替换）时才会重新扫描。
 *
 * @param state 编辑器状态
 */
function scanBlocksCached(state: EditorState): BlockRange[] {
  const doc = state.doc;
  if (doc === cachedDocRef) return cachedBlocks;
  const fmEnd = findFrontMatterEndLine(state);
  cachedBlocks = scanBlocks(doc, fmEnd);
  cachedDocRef = doc;
  return cachedBlocks;
}

/**
 * 根据块级元素范围生成块级替换装饰
 * @param state 编辑器状态
 * @param deps 外部依赖
 */
function buildBlockWidgets(state: EditorState, deps: LivePreviewDeps): DecorationSet {
  const blocks = scanBlocksCached(state);
  if (blocks.length === 0) return Decoration.none;

  const doc = state.doc;
  const ranges: Range<Decoration>[] = [];

  for (const block of blocks) {
    // 光标或选区落在该块内时，展开显示源码以便编辑；
    // 这里用半开区间：光标停在块的下一行行首时不应把整块退回源码。
    if (overlapsSelection(state, block.from, block.to, false)) continue;

    let widget: WidgetType | null = null;

    switch (block.kind) {
      case 'frontmatter': {
        const fm = doc.sliceString(block.contentFrom, block.contentTo).replace(/\s+$/, '');
        widget = new FrontMatterWidget(fm);
        break;
      }
      case 'code': {
        const code = doc.sliceString(block.contentFrom, block.contentTo);
        widget = /^(mermaid|mmd)$/i.test(block.lang)
          ? new MermaidWidget(code)
          : new CodeBlockWidget(code, block.lang);
        break;
      }
      case 'math': {
        widget = new MathBlockWidget(doc.sliceString(block.contentFrom, block.contentTo).trim());
        break;
      }
      case 'table': {
        const source = doc.sliceString(block.from, block.contentTo);
        const md = deps.getMarkdownIt();
        widget = new TableWidget(
          md ? renderTable(md, source) : `<pre>${escapeHtml(source)}</pre>`,
          source,
          block.from,
        );
        break;
      }
      case 'hr': {
        widget = new HorizontalRuleWidget();
        break;
      }
      default:
        break;
    }

    if (widget) {
      ranges.push(Decoration.replace({ widget, block: true }).range(block.from, block.to));
    }
  }

  return Decoration.set(ranges, true);
}

/**
 * 块级装饰扩展
 *
 * 使用 StateField 而非 ViewPlugin，是 CodeMirror 6 对块级装饰的硬性要求。
 * 说明：StateField 无法感知视口范围，因此这里对整篇文档做扫描；
 *       由于扫描结果按文档对象缓存，纯光标移动不会触发重新扫描，
 *       即便 10 万字的长文档也能保持流畅。
 *
 * @param deps 外部依赖
 */
export function blockWidgetField(deps: LivePreviewDeps): StateField<DecorationSet> {
  return StateField.define<DecorationSet>({
    create(state) {
      return buildBlockWidgets(state, deps);
    },
    update(value, tr) {
      // 文档或选区未变化时无需重建
      if (!tr.docChanged && !tr.selection) return value;
      return buildBlockWidgets(tr.state, deps);
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}

/** 清空块级扫描缓存（切换文档等场景使用） */
export function invalidateBlockCache(): void {
  cachedDocRef = null;
  cachedBlocks = [];
}
