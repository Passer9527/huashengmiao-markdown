/**
 * 花生苗 Markdown 编辑器 —— 编辑器内核封装
 * ------------------------------------------------------------------
 * 职责：
 *   1. 组装 CodeMirror 6 的全部扩展（Markdown 语言、实时渲染、快捷键、
 *      搜索、历史、自动配对、列表智能续写、打字机滚动…）；
 *   2. 提供 Markdown 格式化命令（加粗、标题、列表、表格、公式…）的实现；
 *   3. 提供查找替换、行列移动、缩进等编辑能力；
 *   4. 管理"源码模式 / 实时预览"的切换。
 *
 * 作者：何飞    联系方式：微信 6731663
 * 开源协议：MIT
 */

import {
  EditorState,
  Compartment,
  type Extension,
  type TransactionSpec,
} from '@codemirror/state';
import {
  EditorView,
  keymap,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  lineNumbers,
  highlightSpecialChars,
  rectangularSelection,
  crosshairCursor,
  dropCursor,
  type KeyBinding,
} from '@codemirror/view';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  moveLineUp,
  moveLineDown,
  copyLineUp,
  copyLineDown,
  deleteLine,
} from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxHighlighting, defaultHighlightStyle, indentUnit, bracketMatching } from '@codemirror/language';
import { search, SearchQuery, setSearchQuery, findNext, findPrevious, replaceNext, replaceAll, getSearchQuery } from '@codemirror/search';
import { livePreview, blockWidgetField, type LivePreviewDeps, type HeadingsListener } from './live-preview';
import type { HeadingInfo } from './markdown';
import { getSetting } from '../core/store';

/* ==================================================================
 * 〇、快捷键绑定来源
 * ------------------------------------------------------------------
 * 编辑器内部的快捷键必须与"用户自定义绑定"保持一致，
 * 因此这里不写死按键，而是由 main.ts 注入一个映射提供者，
 * 每次构建或重建编辑器状态时按当前绑定生成快捷键表。
 * ================================================================== */

/** 命令 ID -> 组合串 的提供者，由 main.ts 注入 */
let bindingProvider: () => Map<string, string> = () => new Map();

/**
 * 注入快捷键绑定提供者
 * @param fn 返回当前 命令ID -> 组合串 映射的函数
 */
export function setBindingProvider(fn: () => Map<string, string>): void {
  bindingProvider = fn;
}

/**
 * 把本软件的组合串转换为 CodeMirror 6 的按键语法
 *
 * 两者格式很接近，区别在于：
 *   · 本软件用 "+" 连接（Mod+Shift+Z），CodeMirror 用 "-" 连接（Mod-Shift-z）
 *   · 单字符键在 CodeMirror 中必须小写
 *   · 空格键在 CodeMirror 中写作 Space
 *
 * @param combo 组合串，如 "Mod+Shift+BracketLeft"
 * @returns CodeMirror 按键串；无法转换时返回空串
 */
export function toCodeMirrorKey(combo: string): string {
  if (!combo) return '';

  const parts = combo.split('+').map((p) => p.trim()).filter(Boolean);
  const modifiers: string[] = [];
  let key = '';

  for (const raw of parts) {
    const low = raw.toLowerCase();
    if (low === 'mod') modifiers.push('Mod');
    else if (low === 'ctrl' || low === 'control') modifiers.push('Ctrl');
    else if (low === 'alt' || low === 'option') modifiers.push('Alt');
    else if (low === 'shift') modifiers.push('Shift');
    else key = raw;
  }

  if (!key) return '';

  // 单字符键统一小写；空格键与功能键做名称映射
  let cmKey: string;
  if (key === ' ' || key.toLowerCase() === 'space') cmKey = 'Space';
  else if (/^F\d{1,2}$/i.test(key)) cmKey = key.toUpperCase();
  else if (key.length === 1) cmKey = key.toLowerCase();
  else cmKey = key; // ArrowUp / Enter / Escape / Tab / Backspace 等名称与 CodeMirror 一致

  return [...modifiers, cmKey].join('-');
}

/* ==================================================================
 * 一、可动态切换的配置舱（Compartment）
 * ================================================================== */

/** 实时渲染 / 源码模式切换 */
export const previewCompartment = new Compartment();

/** 行号显示切换 */
export const lineNumbersCompartment = new Compartment();

/** 自动换行切换 */
export const wrapCompartment = new Compartment();

/** 快捷键表（用户修改绑定后需要整体替换） */
export const keymapCompartment = new Compartment();

/** 当前是否处于源码模式 */
let sourceMode = false;

/** 获取当前是否源码模式 */
export function isSourceMode(): boolean {
  return sourceMode;
}

/* ==================================================================
 * 二、编辑器扩展组装
 * ================================================================== */

/** 构建编辑器扩展时的依赖 */
export interface EditorDeps {
  /** 实时渲染所需的依赖 */
  preview: LivePreviewDeps;
  /** 标题变化回调 */
  onHeadings: HeadingsListener;
  /** 内容变化回调 */
  onDocChanged: () => void;
  /** 光标变化回调 */
  onCursorChanged: (info: { line: number; column: number; selectionLength: number }) => void;
  /** 输入停顿回调（用于自动保存） */
  onIdle: () => void;
}

/**
 * 组装编辑器扩展列表
 * @param deps 依赖回调集合
 */
export function buildEditorExtensions(deps: EditorDeps): Extension[] {
  const wrap = getSetting<boolean>('editor.softWrap', true);
  const showLineNumbers = getSetting<boolean>('appearance.showLineNumbers', true);
  const livePreviewEnabled = getSetting<boolean>('editor.livePreview', true);
  sourceMode = !livePreviewEnabled;

  return [
    /* -------------------- 基础视觉 -------------------- */
    lineNumbersCompartment.of(showLineNumbers ? lineNumbers() : []),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    drawSelection(),
    dropCursor(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    bracketMatching(),
    // Markdown 语法本身的着色（源码模式下的观感）
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),

    /* -------------------- 历史与快捷键 -------------------- */
    history(),
    indentUnit.of(' '.repeat(getSetting<number>('editor.tabSize', 4))),
    // 快捷键表放在配置舱里：用户修改绑定后可整体替换而无需重建编辑器
    keymapCompartment.of(codemirrorKeymap()),

    /* -------------------- Markdown 语言 -------------------- */
    markdown({ base: markdownLanguage, codeLanguages: [] }),

    /* -------------------- 换行 -------------------- */
    wrapCompartment.of(wrap ? EditorView.lineWrapping : []),

    /* -------------------- 查找替换 -------------------- */
    // 使用自绘的查找条，因此把 CodeMirror 自带面板替换为一个空面板，
    // 只借用它的匹配高亮能力。
    search({
      createPanel: () => ({ dom: document.createElement('div'), top: false }),
    }),

    /* -------------------- 实时渲染 -------------------- */
    // 说明：CodeMirror 6 规定"块级装饰不能由 ViewPlugin 提供"，
    //       因此实时渲染拆成两部分——
    //       · blockWidgetField：StateField，负责代码块 / 表格 / 公式块 /
    //         分割线 / Front Matter 的整块替换
    //       · livePreview：ViewPlugin，负责行级样式、行内标记与行内 Widget
    previewCompartment.of(
      livePreviewEnabled ? [blockWidgetField(deps.preview), livePreview(deps.preview, deps.onHeadings)] : [],
    ),

    /* -------------------- 输入与内容监听 -------------------- */
    EditorView.updateListener.of((update) => {
      if (update.docChanged) deps.onDocChanged();

      if (update.selectionSet || update.docChanged) {
        const pos = update.state.selection.main.head;
        const line = update.state.doc.lineAt(pos);
        deps.onCursorChanged({
          line: line.number,
          column: pos - line.from + 1,
          selectionLength: Math.abs(update.state.selection.main.to - update.state.selection.main.from),
        });
      }

      // 打字机模式：让光标行保持垂直居中
      if (update.selectionSet || update.docChanged) {
        applyTypewriterScroll(update.view);
      }
    }),

    /* -------------------- 自动配对与智能输入 -------------------- */
    autoPairExtension(),

    /* -------------------- 粘贴处理 -------------------- */
    pasteHandler(),

    /* -------------------- 样式 -------------------- */
    editorTheme(),
  ];
}

/* ==================================================================
 * 三、快捷键
 * ================================================================== */

/**
 * 编辑器内部可承载的命令实现表
 * 只有"光标在编辑区内才有意义"的命令才注册到 CodeMirror；
 * 涉及窗口、文件、对话框的命令交由全局快捷键处理器统一负责。
 */
const EDITOR_COMMAND_IMPL: Record<string, (view: EditorView) => boolean> = {
  'format.bold': applyBold,
  'format.italic': applyItalic,
  'format.underline': applyUnderline,
  'format.strike': applyStrike,
  'format.highlight': applyHighlight,
  'format.inlineCode': applyInlineCode,
  'format.codeBlock': applyCodeBlock,
  'format.mathBlock': applyMathBlock,
  'format.mathInline': applyMathInline,
  'format.table': applyTable,
  'format.quote': applyQuote,
  'format.h1': (v) => applyHeading(v, 1),
  'format.h2': (v) => applyHeading(v, 2),
  'format.h3': (v) => applyHeading(v, 3),
  'format.h4': (v) => applyHeading(v, 4),
  'format.h5': (v) => applyHeading(v, 5),
  'format.h6': (v) => applyHeading(v, 6),
  'format.paragraph': (v) => applyHeading(v, 0),
  'format.bulletList': applyBulletList,
  'format.orderedList': applyOrderedList,
  'format.taskList': applyTaskList,
  'format.hr': applyHorizontalRule,
  'format.toc': applyToc,
  'format.footnote': applyFootnote,
  // 行级操作
  'edit.moveLineUp': moveLineUp,
  'edit.moveLineDown': moveLineDown,
  'edit.copyLineUp': copyLineUp,
  'edit.copyLineDown': copyLineDown,
  'edit.deleteLine': deleteLine,
};

/**
 * 按"当前用户绑定"生成编辑器内部的完整快捷键表
 *
 * 这样无论是默认绑定还是用户自定义的绑定，在编辑区内都能正确触发，
 * 并且顺序在 CodeMirror 默认快捷键之前，可覆盖 Ctrl+U 之类的默认行为。
 */
export function buildDynamicFormatKeymap(): KeyBinding[] {
  const bindings = bindingProvider();
  const out: KeyBinding[] = [];

  for (const [commandId, run] of Object.entries(EDITOR_COMMAND_IMPL)) {
    const combo = bindings.get(commandId);
    if (!combo) continue;
    const key = toCodeMirrorKey(combo);
    if (!key) continue;
    out.push({ key, run });
  }

  // 未绑定快捷键时给出提示无意义；这里直接跳过
  return out;
}

/** 编辑器内使用的完整快捷键表（含智能输入、动态格式化、默认键位） */
function codemirrorKeymap(): Extension {
  return keymap.of([
    ...smartInputKeymap(),
    ...buildDynamicFormatKeymap(),
    ...historyKeymap,
    ...defaultKeymap,
    indentWithTab,
  ]);
}

/**
 * 重建编辑器快捷键表（用户修改快捷键后调用）
 * @param view 编辑器视图
 */
export function reconfigureKeymap(view: EditorView): void {
  view.dispatch({
    effects: keymapCompartment.reconfigure(codemirrorKeymap()),
  });
}

/** 智能输入（列表续写、回车行为） */
function smartInputKeymap(): KeyBinding[] {
  return [
    {
      key: 'Enter',
      run: (view) => {
        if (!getSetting<boolean>('editor.smartLists', true)) return false;
        return continueList(view);
      },
    },
    {
      key: 'Backspace',
      run: (view) => removeEmptyListMark(view),
    },
  ];
}

/* ==================================================================
 * 四、格式化命令实现
 * ================================================================== */

/** 用一对标记包裹选区；未选中时插入占位文字并选中它 */
export function wrapSelection(
  view: EditorView,
  before: string,
  after: string,
  placeholder = '文本',
): boolean {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const body = selected || placeholder;

  view.dispatch({
    changes: { from, to, insert: before + body + after },
    selection: { anchor: from + before.length, head: from + before.length + body.length },
    userEvent: 'input.format',
    scrollIntoView: true,
  });
  view.focus();
  return true;
}

/** 若选区已经被同一对标记包裹，则取消包裹 */
function toggleWrap(view: EditorView, before: string, after: string, placeholder: string): boolean {
  const { from, to } = view.state.selection.main;
  const doc = view.state.doc;
  const selected = view.state.sliceDoc(from, to);

  // 情况一：选区内容自带标记
  if (selected.startsWith(before) && selected.endsWith(after) && selected.length >= before.length + after.length) {
    const inner = selected.slice(before.length, selected.length - after.length);
    view.dispatch({
      changes: { from, to, insert: inner },
      selection: { anchor: from, head: from + inner.length },
      userEvent: 'input.format',
    });
    view.focus();
    return true;
  }

  // 情况二：选区外侧紧邻标记
  const outerFrom = from - before.length;
  const outerTo = to + after.length;
  if (
    outerFrom >= 0 &&
    outerTo <= doc.length &&
    doc.sliceString(outerFrom, from) === before &&
    doc.sliceString(to, outerTo) === after
  ) {
    view.dispatch({
      changes: [
        { from: outerFrom, to: from, insert: '' },
        { from: to - before.length, to: to + after.length - before.length, insert: '' },
      ],
      selection: { anchor: outerFrom, head: outerFrom + selected.length },
      userEvent: 'input.format',
    });
    view.focus();
    return true;
  }

  return wrapSelection(view, before, after, placeholder);
}

/** 加粗 */
export function applyBold(view: EditorView): boolean {
  return toggleWrap(view, '**', '**', '加粗文本');
}

/** 斜体 */
export function applyItalic(view: EditorView): boolean {
  return toggleWrap(view, '*', '*', '斜体文本');
}

/** 下划线（Markdown 无原生语法，使用 HTML 标签，渲染时保持原样） */
export function applyUnderline(view: EditorView): boolean {
  return toggleWrap(view, '<u>', '</u>', '下划线文本');
}

/** 删除线 */
export function applyStrike(view: EditorView): boolean {
  return toggleWrap(view, '~~', '~~', '删除文本');
}

/** 高亮 */
export function applyHighlight(view: EditorView): boolean {
  return toggleWrap(view, '==', '==', '高亮文本');
}

/** 行内代码 */
export function applyInlineCode(view: EditorView): boolean {
  return toggleWrap(view, '`', '`', 'code');
}

/** 插入链接 */
export function applyLink(view: EditorView): boolean {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const text = selected || '链接文字';
  const insert = `[${text}](https://)`;
  // 光标落在 URL 上，方便直接输入
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + text.length + 3, head: from + insert.length - 1 },
    userEvent: 'input.format',
  });
  view.focus();
  return true;
}

/** 插入图片（由外部提供已保存的图片路径，这里只处理"插入语法"的场景） */
export function insertImage(view: EditorView, src: string, alt = '图片'): boolean {
  const { from, to } = view.state.selection.main;
  const insert = `![${alt}](${src})`;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length },
    userEvent: 'input.format',
  });
  return true;
}

/** 插入代码块 */
export function applyCodeBlock(view: EditorView): boolean {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const line = view.state.doc.lineAt(from);
  const needLeading = line.from !== from ? '\n' : '';
  const insert = `${needLeading}\`\`\`\n${selected}\n\`\`\`\n`;
  view.dispatch({
    changes: { from, to, insert },
    // 光标放在语言标识处，方便直接输入语言
    selection: { anchor: from + needLeading.length + 3 },
    userEvent: 'input.format',
  });
  view.focus();
  return true;
}

/** 插入块级公式 */
export function applyMathBlock(view: EditorView): boolean {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to).trim() || 'E = mc^2';
  const line = view.state.doc.lineAt(from);
  const needLeading = line.from !== from ? '\n' : '';
  const insert = `${needLeading}$$\n${selected}\n$$\n`;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + needLeading.length + 3, head: from + needLeading.length + 3 + selected.length },
    userEvent: 'input.format',
  });
  view.focus();
  return true;
}

/** 插入行内公式 */
export function applyMathInline(view: EditorView): boolean {
  return wrapSelection(view, '$', '$', 'x^2');
}

/** 插入分割线 */
export function applyHorizontalRule(view: EditorView): boolean {
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const needLeading = line.text.trim() ? '\n' : '';
  const insert = `${needLeading}---\n`;
  view.dispatch({
    changes: { from, insert },
    selection: { anchor: from + insert.length },
    userEvent: 'input.format',
  });
  view.focus();
  return true;
}

/** 插入表格（3 列 2 行） */
export function applyTable(view: EditorView): boolean {
  const { from, to } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const needLeading = line.text.trim() ? '\n' : '';
  const insert = `${needLeading}| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n`;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + needLeading.length + 2, head: from + needLeading.length + 4 },
    userEvent: 'input.format',
  });
  view.focus();
  return true;
}

/** 插入脚注 */
export function applyFootnote(view: EditorView): boolean {
  const { from, to } = view.state.selection.main;
  const doc = view.state.doc.toString();
  // 计算下一个可用的脚注编号
  const existing = doc.match(/\[\^(\d+)\]/g) ?? [];
  const next = existing.length + 1;
  const insert = `[^${next}]`;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length },
    userEvent: 'input.format',
  });
  // 在文档末尾追加脚注定义
  const tail = `\n\n[^${next}]: 脚注内容\n`;
  view.dispatch({
    changes: { from: view.state.doc.length, insert: tail },
  });
  view.focus();
  return true;
}

/** 插入目录 */
export function applyToc(view: EditorView): boolean {
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const needLeading = line.text.trim() ? '\n' : '';
  const insert = `${needLeading}[TOC]\n`;
  view.dispatch({
    changes: { from, insert },
    selection: { anchor: from + insert.length },
    userEvent: 'input.format',
  });
  view.focus();
  return true;
}

/* ==================================================================
 * 五、行级格式（标题、引用、列表）
 * ================================================================== */

/**
 * 切换行首前缀
 * 若当前行已有其它同级前缀会自动替换；再次执行同一前缀则取消。
 *
 * @param view 编辑器
 * @param prefix 要添加的前缀（如 "## "、"> "）
 * @param matcher 用于识别"已存在同类前缀"的正则
 */
export function toggleLinePrefix(view: EditorView, prefix: string, matcher: RegExp): boolean {
  const state = view.state;
  const changes: Array<{ from: number; to: number; insert: string }> = [];

  // 对选区涉及的每一行生效
  const startLine = state.doc.lineAt(state.selection.main.from).number;
  const endLine = state.doc.lineAt(state.selection.main.to).number;

  for (let n = startLine; n <= endLine; n += 1) {
    const line = state.doc.line(n);
    const text = line.text;
    const m = matcher.exec(text);

    if (m) {
      // 已存在同类前缀：判断是否与目标一致
      const existing = m[0];
      if (existing === prefix) {
        // 再次执行则取消
        changes.push({ from: line.from + m.index, to: line.from + m.index + existing.length, insert: '' });
      } else {
        // 换成新的前缀
        changes.push({ from: line.from + m.index, to: line.from + m.index + existing.length, insert: prefix });
      }
    } else {
      // 行首插入
      changes.push({ from: line.from, to: line.from, insert: prefix });
    }
  }

  if (changes.length === 0) return false;
  view.dispatch({ changes, userEvent: 'input.format', scrollIntoView: true });
  view.focus();
  return true;
}

/**
 * 设置标题级别
 * @param view 编辑器
 * @param level 1-6；传 0 表示转为普通段落
 */
export function applyHeading(view: EditorView, level: number): boolean {
  const prefix = level > 0 ? '#'.repeat(level) + ' ' : '';
  return toggleLinePrefix(view, prefix, /^#{1,6}\s/);
}

/** 引用 */
export function applyQuote(view: EditorView): boolean {
  return toggleLinePrefix(view, '> ', /^>\s?/);
}

/** 无序列表 */
export function applyBulletList(view: EditorView): boolean {
  return toggleLinePrefix(view, '- ', /^[-*+]\s(?!\[[ xX]\])/);
}

/** 有序列表 */
export function applyOrderedList(view: EditorView): boolean {
  const state = view.state;
  const startLine = state.doc.lineAt(state.selection.main.from).number;
  const changes: Array<{ from: number; to: number; insert: string }> = [];

  let index = 1;
  for (let n = startLine; n <= state.doc.lines; n += 1) {
    const line = state.doc.line(n);
    const m = /^(\d+)\.\s/.exec(line.text);
    if (m) {
      changes.push({ from: line.from, to: line.from + m[0].length, insert: '' });
      break;
    }
    changes.push({ from: line.from, to: line.from, insert: `${index}. ` });
    index += 1;
    // 只处理选区范围内的行（至少一行）
    if (n >= state.doc.lineAt(state.selection.main.to).number) break;
  }

  if (changes.length === 0) return false;
  view.dispatch({ changes, userEvent: 'input.format' });
  view.focus();
  return true;
}

/** 任务列表 */
export function applyTaskList(view: EditorView): boolean {
  return toggleLinePrefix(view, '- [ ] ', /^[-*+]\s\[[ xX]\]\s/);
}

/* ==================================================================
 * 六、智能输入
 * ================================================================== */

/**
 * 列表智能续写：在列表项末尾回车时自动补下一项；
 * 空列表项回车则退出列表。
 */
export function continueList(view: EditorView): boolean {
  const state = view.state;
  const { from, to } = state.selection.main;
  // 仅在光标为单点且位于行尾时生效
  if (from !== to) return false;

  const line = state.doc.lineAt(from);
  if (from !== line.to) return false;

  const text = line.text;

  // 任务列表
  const task = /^(\s*)([-*+])\s\[([ xX])\]\s(.*)$/.exec(text);
  if (task) {
    if (task[4].trim() === '') {
      // 空任务项：退出列表
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: '' },
        selection: { anchor: line.from },
        userEvent: 'input',
      });
      return true;
    }
    const insert = `\n${task[1]}${task[2]} [ ] `;
    view.dispatch({ changes: { from, insert }, selection: { anchor: from + insert.length }, userEvent: 'input' });
    return true;
  }

  // 无序列表
  const bullet = /^(\s*)([-*+])\s(.*)$/.exec(text);
  if (bullet) {
    if (bullet[3].trim() === '') {
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: '' },
        selection: { anchor: line.from },
        userEvent: 'input',
      });
      return true;
    }
    const insert = `\n${bullet[1]}${bullet[2]} `;
    view.dispatch({ changes: { from, insert }, selection: { anchor: from + insert.length }, userEvent: 'input' });
    return true;
  }

  // 有序列表
  const ordered = /^(\s*)(\d+)\.\s(.*)$/.exec(text);
  if (ordered) {
    if (ordered[3].trim() === '') {
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: '' },
        selection: { anchor: line.from },
        userEvent: 'input',
      });
      return true;
    }
    const next = Number(ordered[2]) + 1;
    const insert = `\n${ordered[1]}${next}. `;
    view.dispatch({ changes: { from, insert }, selection: { anchor: from + insert.length }, userEvent: 'input' });
    return true;
  }

  // 引用
  const quote = /^(\s*)>\s(.*)$/.exec(text);
  if (quote) {
    if (quote[2].trim() === '') {
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: '' },
        selection: { anchor: line.from },
        userEvent: 'input',
      });
      return true;
    }
    const insert = `\n${quote[1]}> `;
    view.dispatch({ changes: { from, insert }, selection: { anchor: from + insert.length }, userEvent: 'input' });
    return true;
  }

  // 表格：在表格行末尾回车时自动补一行
  if (/^\s*\|.*\|\s*$/.test(text)) {
    const cells = text.split('|').length - 2;
    if (cells > 0) {
      const insert = `\n|${'  |'.repeat(cells)}`;
      view.dispatch({ changes: { from, insert }, selection: { anchor: from + insert.length }, userEvent: 'input' });
      return true;
    }
  }

  return false;
}

/** 删除空列表项的行首标记（在空列表项上按退格时） */
export function removeEmptyListMark(view: EditorView): boolean {
  const state = view.state;
  const { from, to } = state.selection.main;
  if (from !== to) return false;

  const line = state.doc.lineAt(from);
  // 仅当光标在标记之后时才处理
  const m = /^(\s*)([-*+]\s\[[ xX]\]\s|[-*+]\s|\d+\.\s|>\s)$/.exec(line.text.slice(0, from - line.from));
  if (!m) return false;
  if (from - line.from !== m[0].length) return false;

  view.dispatch({
    changes: { from: line.from, to: from, insert: '' },
    selection: { anchor: line.from },
    userEvent: 'delete',
  });
  return true;
}

/** 自动配对：输入左符号时自动补右符号，选中文字时自动包裹 */
function autoPairExtension(): Extension {
  const PAIRS: Record<string, string> = {
    '*': '*',
    _: '_',
    '`': '`',
    '~': '~',
    '[': ']',
    '(': ')',
    '"': '"',
    "'": "'",
    $: '$',
    '「': '」',
    '（': '）',
    '【': '】',
    '<': '>',
  };

  return EditorView.inputHandler.of((view, from, to, text) => {
    if (!getSetting<boolean>('editor.autoPair', true)) return false;
    if (text.length !== 1) return false;
    const close = PAIRS[text];
    if (!close) return false;

    const state = view.state;

    // 有选区时：用符号包裹选中内容
    if (from !== to) {
      const selected = state.sliceDoc(from, to);
      const insert = text + selected + close;
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + text.length, head: from + text.length + selected.length },
        userEvent: 'input.type',
        scrollIntoView: true,
      });
      return true;
    }

    // 无选区但后面紧跟着相同的闭合符号时，直接跳过而不重复插入
    const nextChar = state.sliceDoc(from, Math.min(from + 1, state.doc.length));
    if (nextChar === close) {
      view.dispatch({ selection: { anchor: from + 1 }, userEvent: 'input.type' });
      return true;
    }

    // 常规自动配对
    view.dispatch({
      changes: { from, insert: text + close },
      selection: { anchor: from + 1 },
      userEvent: 'input.type',
      scrollIntoView: true,
    });
    return true;
  });
}

/* ==================================================================
 * 七、粘贴处理
 * ================================================================== */

/** 粘贴回调，由 main.ts 注册（用于处理图片粘贴与 URL 转链接） */
type PasteHook = (event: ClipboardEvent, view: EditorView) => boolean;

let pasteHook: PasteHook | null = null;

/** 注册自定义粘贴处理 */
export function setPasteHook(hook: PasteHook | null): void {
  pasteHook = hook;
}

/** 构建粘贴处理扩展 */
function pasteHandler(): Extension {
  return EditorView.domEventHandlers({
    paste(event, view) {
      if (pasteHook && pasteHook(event as ClipboardEvent, view)) {
        event.preventDefault();
        return true;
      }
      return false;
    },
  });
}

/* ==================================================================
 * 八、外观与滚动
 * ================================================================== */

/** 编辑器基础样式（与 CSS 变量配合） */
function editorTheme(): Extension {
  return EditorView.theme({
    '&': { height: '100%' },
    '.cm-scroller': {
      fontFamily: 'var(--editor-font, inherit)',
      fontSize: 'var(--editor-font-size, 16px)',
      lineHeight: 'var(--editor-line-height, 1.7)',
      overflow: 'auto',
    },
    '.cm-content': {
      maxWidth: 'var(--editor-page-width, 800px)',
      margin: '0 auto',
      padding: '48px 60px 45vh',
      caretColor: 'var(--ui-accent)',
    },
    '.cm-gutters': {
      background: 'transparent',
      border: 'none',
      color: 'var(--ui-text-faint)',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 8px 0 16px',
      fontSize: '12px',
    },
  });
}

/**
 * 打字机模式：滚动到让光标行垂直居中
 * @param view 编辑器
 */
export function applyTypewriterScroll(view: EditorView): void {
  if (!getSetting<boolean>('editor.typewriter', false)) return;

  // 延迟到布局完成后执行，避免与 CodeMirror 自身的滚动冲突
  requestAnimationFrame(() => {
    const pos = view.state.selection.main.head;
    const coords = view.coordsAtPos(pos);
    if (!coords) return;

    const scroller = view.scrollDOM;
    const rect = scroller.getBoundingClientRect();
    const targetCenter = rect.top + rect.height / 2;
    const currentCenter = (coords.top + coords.bottom) / 2;
    const delta = currentCenter - targetCenter;

    // 只有当偏离中心超过一行高度时才滚动，避免抖动
    if (Math.abs(delta) > 8) {
      scroller.scrollTop += delta;
    }
  });
}

/**
 * 把指定行滚动到视口中央（大纲点击跳转使用）
 * @param view 编辑器
 * @param lineNumber 行号（1 起）
 */
export function scrollToLine(view: EditorView, lineNumber: number): void {
  const clamped = Math.max(1, Math.min(lineNumber, view.state.doc.lines));
  const line = view.state.doc.line(clamped);

  view.dispatch({
    selection: { anchor: line.from },
    effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
  });
  view.focus();
}

/* ==================================================================
 * 九、查找替换
 * ================================================================== */

/** 查找参数 */
export interface FindOptions {
  /** 查找内容 */
  search: string;
  /** 替换内容 */
  replace?: string;
  /** 区分大小写 */
  caseSensitive?: boolean;
  /** 全字匹配 */
  wholeWord?: boolean;
  /** 正则表达式 */
  regexp?: boolean;
}

/**
 * 应用查找条件（不移动光标）
 * @param view 编辑器
 * @param options 查找参数
 * @returns 匹配总数
 */
export function applyFindQuery(view: EditorView, options: FindOptions): number {
  let query: SearchQuery;
  try {
    query = new SearchQuery({
      search: options.search,
      replace: options.replace ?? '',
      caseSensitive: options.caseSensitive ?? false,
      wholeWord: options.wholeWord ?? false,
      regexp: options.regexp ?? false,
    });
  } catch {
    // 正则非法时退化为普通查找
    query = new SearchQuery({ search: options.search, caseSensitive: options.caseSensitive ?? false });
  }

  // setSearchQuery 是一个 StateEffect，必须通过 dispatch 的 effects 应用
  view.dispatch({ effects: setSearchQuery.of(query) });
  return countMatches(view, query);
}

/**
 * 统计匹配数量
 * @param view 编辑器
 * @param query 查询对象
 */
export function countMatches(view: EditorView, query?: SearchQuery): number {
  const q = query ?? getSearchQuery(view.state);
  if (!q || !q.search) return 0;

  const doc = view.state.doc;
  let count = 0;
  try {
    const iter = q.getCursor(view.state.doc, 0, doc.length);
    while (!iter.next().done) {
      count += 1;
      // 防御性上限，避免极端情况下长时间占用
      if (count > 9999) break;
    }
  } catch {
    return 0;
  }
  return count;
}

/** 查找下一个 */
export function doFindNext(view: EditorView): boolean {
  return findNext(view);
}

/** 查找上一个 */
export function doFindPrev(view: EditorView): boolean {
  return findPrevious(view);
}

/** 替换当前匹配并跳到下一个 */
export function doReplaceNext(view: EditorView): boolean {
  return replaceNext(view);
}

/** 全部替换 */
export function doReplaceAll(view: EditorView): boolean {
  return replaceAll(view);
}

/** 获取当前匹配序号（用于显示 3/12） */
export function currentMatchIndex(view: EditorView): number {
  const q = getSearchQuery(view.state);
  if (!q || !q.search) return 0;

  const head = view.state.selection.main.head;
  let index = 0;
  try {
    const iter = q.getCursor(view.state.doc, 0, view.state.doc.length);
    let i = 1;
    // 迭代器每次 next() 返回 { done, value }，匹配区间在 value 中
    let step = iter.next();
    while (!step.done) {
      const value = step.value;
      if (value.from <= head && value.to >= head) {
        index = i;
        break;
      }
      i += 1;
      step = iter.next();
    }
  } catch {
    return 0;
  }
  return index;
}

/* ==================================================================
 * 十、工具
 * ================================================================== */

/** 批量应用编辑事务（供外部使用） */
export function dispatch(view: EditorView, spec: TransactionSpec): void {
  view.dispatch(spec);
}

/** 提取当前文档中所有标题（用于大纲，不改动编辑器） */
export function headingsFromState(state: EditorState): HeadingInfo[] {
  void state;
  return [];
}

/** 把字符插入到光标处 */
export function insertText(view: EditorView, text: string): void {
  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length },
    userEvent: 'input.type',
    scrollIntoView: true,
  });
  view.focus();
}
