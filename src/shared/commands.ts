/**
 * 花生苗 Markdown 编辑器 —— 命令注册表与默认快捷键
 * ------------------------------------------------------------------
 * 所有可绑定快捷键的命令集中在此处定义，主进程负责持久化用户自定义绑定，
 * 渲染进程负责按键匹配与执行。两侧共用同一份命令表，确保一致。
 *
 * 按键组合书写规范：修饰键顺序固定为 Mod → Ctrl → Alt → Shift，
 * 最后是键名，例如 "Mod+Shift+Z"、"Alt+ArrowUp"、"F8"。
 *   Mod  在 Windows / Linux 上为 Ctrl，在 macOS 上为 ⌘(Command)
 *   Ctrl 始终为 Control（跨平台含义一致，用于少数特殊绑定）
 *
 * 作者：何飞    联系方式：微信 6731663
 * 开源协议：MIT
 */

/** 命令所属分类 */
export type CommandCategory = '文件' | '编辑' | '格式' | '视图' | '表格' | '帮助';

/** 单条命令定义 */
export interface CommandDef {
  /** 命令唯一标识 */
  id: string;
  /** 命令中文名称 */
  name: string;
  /** 所属分类 */
  category: CommandCategory;
  /** 默认快捷键（空字符串表示默认不绑定） */
  defaultKey: string;
  /** 命令说明，用于设置面板提示 */
  description?: string;
}

/**
 * 全部命令清单
 * 说明：需求文档中 "Ctrl+0" 同时被"普通段落"与"恢复默认字号"占用，
 *       此处按 Typora 习惯将 Mod+0 分配给"普通段落"，
 *       "恢复默认字号"改为 Mod+Shift+0，并已在设置面板中体现。
 */
export const COMMANDS: CommandDef[] = [
  /* ---------------------------- 文件 ---------------------------- */
  { id: 'file.new', name: '新建文件', category: '文件', defaultKey: 'Mod+N' },
  { id: 'file.newWindow', name: '新建窗口', category: '文件', defaultKey: 'Mod+Shift+N' },
  { id: 'file.open', name: '打开文件', category: '文件', defaultKey: 'Mod+O' },
  { id: 'file.openFolder', name: '打开文件夹', category: '文件', defaultKey: 'Mod+Shift+O' },
  { id: 'file.save', name: '保存', category: '文件', defaultKey: 'Mod+S' },
  { id: 'file.saveAs', name: '另存为', category: '文件', defaultKey: 'Mod+Shift+S' },
  { id: 'file.close', name: '关闭当前标签', category: '文件', defaultKey: 'Mod+W' },
  { id: 'file.closeWindow', name: '关闭窗口', category: '文件', defaultKey: 'Mod+Shift+W' },
  { id: 'file.quickOpen', name: '快速打开文件', category: '文件', defaultKey: 'Mod+P' },
  { id: 'file.settings', name: '打开设置', category: '文件', defaultKey: 'Mod+,' },
  { id: 'file.exportHtml', name: '导出为 HTML', category: '文件', defaultKey: 'Mod+Shift+E' },
  { id: 'file.exportPdf', name: '导出为 PDF', category: '文件', defaultKey: '' },
  { id: 'file.exportPng', name: '导出为图片（长图）', category: '文件', defaultKey: '' },
  { id: 'file.exportDialog', name: '导出为其它格式…', category: '文件', defaultKey: '' },
  { id: 'file.print', name: '打印', category: '文件', defaultKey: 'Mod+Alt+P' },

  /* ---------------------------- 编辑 ---------------------------- */
  { id: 'edit.undo', name: '撤销', category: '编辑', defaultKey: 'Mod+Z' },
  { id: 'edit.redo', name: '重做', category: '编辑', defaultKey: 'Mod+Shift+Z' },
  { id: 'edit.cut', name: '剪切', category: '编辑', defaultKey: 'Mod+X' },
  { id: 'edit.copy', name: '复制', category: '编辑', defaultKey: 'Mod+C' },
  { id: 'edit.paste', name: '粘贴', category: '编辑', defaultKey: 'Mod+V' },
  { id: 'edit.pastePlain', name: '粘贴为纯文本', category: '编辑', defaultKey: 'Mod+Shift+V' },
  { id: 'edit.selectAll', name: '全选', category: '编辑', defaultKey: 'Mod+A' },
  { id: 'edit.find', name: '查找', category: '编辑', defaultKey: 'Mod+F' },
  { id: 'edit.replace', name: '替换', category: '编辑', defaultKey: 'Mod+H' },
  { id: 'edit.findNext', name: '查找下一个', category: '编辑', defaultKey: 'Mod+G' },
  { id: 'edit.findPrev', name: '查找上一个', category: '编辑', defaultKey: 'Mod+Shift+G' },
  { id: 'edit.moveLineUp', name: '上移当前行', category: '编辑', defaultKey: 'Alt+ArrowUp' },
  { id: 'edit.moveLineDown', name: '下移当前行', category: '编辑', defaultKey: 'Alt+ArrowDown' },
  { id: 'edit.copyLineUp', name: '复制当前行到上方', category: '编辑', defaultKey: 'Shift+Alt+ArrowUp' },
  { id: 'edit.copyLineDown', name: '复制当前行到下方', category: '编辑', defaultKey: 'Shift+Alt+ArrowDown' },
  { id: 'edit.deleteLine', name: '删除当前行', category: '编辑', defaultKey: 'Mod+Shift+D' },

  /* ---------------------------- 格式 ---------------------------- */
  { id: 'format.bold', name: '加粗', category: '格式', defaultKey: 'Mod+B' },
  { id: 'format.italic', name: '斜体', category: '格式', defaultKey: 'Mod+I' },
  { id: 'format.underline', name: '下划线', category: '格式', defaultKey: 'Mod+U' },
  { id: 'format.strike', name: '删除线', category: '格式', defaultKey: 'Mod+Shift+X' },
  { id: 'format.highlight', name: '高亮', category: '格式', defaultKey: 'Mod+Shift+H' },
  { id: 'format.inlineCode', name: '行内代码', category: '格式', defaultKey: 'Mod+Shift+Backquote' },
  { id: 'format.link', name: '插入链接', category: '格式', defaultKey: 'Mod+K' },
  { id: 'format.image', name: '插入图片', category: '格式', defaultKey: 'Mod+Shift+I' },
  { id: 'format.codeBlock', name: '插入代码块', category: '格式', defaultKey: 'Mod+Shift+K' },
  { id: 'format.mathInline', name: '插入行内公式', category: '格式', defaultKey: '' },
  { id: 'format.mathBlock', name: '插入公式块', category: '格式', defaultKey: 'Mod+Shift+M' },
  { id: 'format.table', name: '插入表格', category: '格式', defaultKey: 'Mod+T' },
  { id: 'format.quote', name: '引用', category: '格式', defaultKey: 'Mod+Shift+Q' },
  { id: 'format.h1', name: '一级标题', category: '格式', defaultKey: 'Mod+1' },
  { id: 'format.h2', name: '二级标题', category: '格式', defaultKey: 'Mod+2' },
  { id: 'format.h3', name: '三级标题', category: '格式', defaultKey: 'Mod+3' },
  { id: 'format.h4', name: '四级标题', category: '格式', defaultKey: 'Mod+4' },
  { id: 'format.h5', name: '五级标题', category: '格式', defaultKey: 'Mod+5' },
  { id: 'format.h6', name: '六级标题', category: '格式', defaultKey: 'Mod+6' },
  { id: 'format.paragraph', name: '普通段落', category: '格式', defaultKey: 'Mod+0' },
  { id: 'format.bulletList', name: '无序列表', category: '格式', defaultKey: 'Mod+Shift+BracketLeft' },
  { id: 'format.orderedList', name: '有序列表', category: '格式', defaultKey: 'Mod+Shift+BracketRight' },
  { id: 'format.taskList', name: '任务列表', category: '格式', defaultKey: 'Mod+Shift+C' },
  { id: 'format.hr', name: '分割线', category: '格式', defaultKey: 'Mod+Shift+Minus' },
  { id: 'format.toc', name: '插入目录', category: '格式', defaultKey: '' },
  { id: 'format.footnote', name: '插入脚注', category: '格式', defaultKey: '' },

  /* ---------------------------- 视图 ---------------------------- */
  { id: 'view.toggleSource', name: '切换源码 / 实时预览', category: '视图', defaultKey: 'Mod+/' },
  { id: 'view.focusMode', name: '专注模式', category: '视图', defaultKey: 'F8' },
  { id: 'view.typewriter', name: '打字机模式', category: '视图', defaultKey: 'F9' },
  { id: 'view.fullscreen', name: '全屏', category: '视图', defaultKey: 'F11' },
  { id: 'view.toggleSidebar', name: '显示 / 隐藏侧边栏', category: '视图', defaultKey: 'Mod+Shift+L' },
  { id: 'view.outline', name: '显示大纲', category: '视图', defaultKey: 'Mod+Shift+1' },
  { id: 'view.fileTree', name: '显示文件树', category: '视图', defaultKey: 'Mod+Shift+2' },
  { id: 'view.searchPanel', name: '显示全局搜索', category: '视图', defaultKey: 'Mod+Shift+3' },
  { id: 'view.zoomIn', name: '放大字号', category: '视图', defaultKey: 'Mod+=' },
  { id: 'view.zoomOut', name: '缩小字号', category: '视图', defaultKey: 'Mod+-' },
  { id: 'view.zoomReset', name: '恢复默认字号', category: '视图', defaultKey: 'Mod+Shift+0' },
  { id: 'view.indent', name: '增加缩进', category: '视图', defaultKey: 'Tab', description: '仅编辑区内生效' },
  { id: 'view.outdent', name: '减少缩进', category: '视图', defaultKey: 'Shift+Tab', description: '仅编辑区内生效' },

  /* ---------------------------- 表格 ---------------------------- */
  { id: 'table.insertRowAbove', name: '上方插入行', category: '表格', defaultKey: 'Mod+Alt+ArrowUp' },
  { id: 'table.insertRowBelow', name: '下方插入行', category: '表格', defaultKey: 'Mod+Alt+ArrowDown' },
  { id: 'table.deleteRow', name: '删除当前行', category: '表格', defaultKey: 'Mod+Alt+Backspace' },
  { id: 'table.insertColLeft', name: '左侧插入列', category: '表格', defaultKey: 'Mod+Alt+ArrowLeft' },
  { id: 'table.insertColRight', name: '右侧插入列', category: '表格', defaultKey: 'Mod+Alt+ArrowRight' },
  { id: 'table.deleteCol', name: '删除当前列', category: '表格', defaultKey: 'Mod+Alt+Delete' },
  { id: 'table.alignLeft', name: '整表左对齐', category: '表格', defaultKey: '' },
  { id: 'table.alignCenter', name: '整表居中对齐', category: '表格', defaultKey: '' },
  { id: 'table.alignRight', name: '整表右对齐', category: '表格', defaultKey: '' },

  /* ---------------------------- 帮助 ---------------------------- */
  { id: 'help.shortcuts', name: '快捷键查询', category: '帮助', defaultKey: 'F1' },
  { id: 'help.markdown', name: 'Markdown 语法速查', category: '帮助', defaultKey: '' },
  { id: 'help.about', name: '关于花生苗', category: '帮助', defaultKey: '' },
  { id: 'help.userManual', name: '用户手册', category: '帮助', defaultKey: '' },
];

/** 命令 ID -> 定义 的快速索引 */
export const COMMAND_MAP: Map<string, CommandDef> = new Map(COMMANDS.map((c) => [c.id, c]));

/** 默认绑定表：命令 ID -> 默认快捷键 */
export const DEFAULT_KEYBINDINGS: Record<string, string> = Object.fromEntries(
  COMMANDS.map((c) => [c.id, c.defaultKey]),
);

/* ==================================================================
 * 按键组合的解析与格式化工具
 * ================================================================== */

/** 解析后的按键组合 */
export interface ParsedKey {
  /** 是否需要 Mod（Ctrl / Cmd） */
  mod: boolean;
  /** 是否需要 Ctrl（始终为 Control） */
  ctrl: boolean;
  /** 是否需要 Alt */
  alt: boolean;
  /** 是否需要 Shift */
  shift: boolean;
  /** 主键名（统一为规范化名称，如 'B'、'ArrowUp'、'F8'） */
  key: string;
}

/** 修饰键的识别别名 */
const MOD_ALIASES = new Set(['mod', 'cmd', 'command', 'meta', 'super']);
const CTRL_ALIASES = new Set(['ctrl', 'control']);

/** 主键别名归一化：把各种写法统一成 KeyboardEvent.key 风格 */
const KEY_ALIASES: Record<string, string> = {
  esc: 'Escape',
  escape: 'Escape',
  space: ' ',
  spacebar: ' ',
  tab: 'Tab',
  enter: 'Enter',
  return: 'Enter',
  backspace: 'Backspace',
  delete: 'Delete',
  del: 'Delete',
  insert: 'Insert',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
  backquote: '`',
  minus: '-',
  equal: '=',
  plus: '+',
  bracketleft: '[',
  bracketright: ']',
  backslash: '\\',
  semicolon: ';',
  quote: "'",
  comma: ',',
  period: '.',
  slash: '/',
};

/**
 * 把按键组合字符串解析为结构化对象
 * @param combo 形如 "Mod+Shift+Z" 的组合串
 * @returns 解析结果；无法解析时返回 null
 */
export function parseKeyCombo(combo: string): ParsedKey | null {
  if (!combo) return null;
  const parts = combo.split('+').map((p) => p.trim()).filter(Boolean);
  const result: ParsedKey = { mod: false, ctrl: false, alt: false, shift: false, key: '' };

  for (const raw of parts) {
    const low = raw.toLowerCase();
    if (MOD_ALIASES.has(low)) {
      result.mod = true;
    } else if (CTRL_ALIASES.has(low)) {
      result.ctrl = true;
    } else if (low === 'alt' || low === 'option') {
      result.alt = true;
    } else if (low === 'shift') {
      result.shift = true;
    } else {
      // 主键
      const alias = KEY_ALIASES[low];
      if (alias) {
        result.key = alias;
      } else if (raw.length === 1) {
        result.key = raw.toUpperCase();
      } else if (/^F\d{1,2}$/i.test(raw)) {
        result.key = raw.toUpperCase();
      } else {
        result.key = raw;
      }
    }
  }
  return result.key ? result : null;
}

/**
 * 把键盘事件转换为规范的组合串
 * @param e 键盘事件
 * @returns 规范化组合串；若只按了修饰键则返回空串
 */
export function eventToCombo(e: KeyboardEvent | { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }): string {
  const key = e.key;
  // 只按下修饰键时不产生绑定
  if (['Control', 'Meta', 'Alt', 'Shift', 'CapsLock', 'Dead'].includes(key)) return '';

  const parts: string[] = [];
  // Windows / Linux 上的 Ctrl 与 macOS 上的 Cmd 统一记为 Mod；
  // macOS 上的 Control 单独记为 Ctrl，以保证跨平台绑定语义一致。
  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent);
  if (isMac) {
    if (e.metaKey) parts.push('Mod');
    if (e.ctrlKey) parts.push('Ctrl');
  } else {
    if (e.ctrlKey) parts.push('Mod');
    if (e.metaKey) parts.push('Mod');
  }
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  parts.push(normalizeKeyName(key));
  return parts.join('+');
}

/** 把 KeyboardEvent.key 归一化为组合串中使用的键名 */
export function normalizeKeyName(key: string): string {
  if (key === ' ') return 'Space';
  if (key.length === 1) return key.toUpperCase();
  return key;
}

/**
 * 判断键盘事件是否匹配指定的按键组合
 * @param e 键盘事件
 * @param combo 目标组合串
 */
export function matchCombo(
  e: KeyboardEvent,
  combo: string,
): boolean {
  const parsed = parseKeyCombo(combo);
  if (!parsed) return false;

  const isMac = /Mac/i.test(navigator.platform || navigator.userAgent);
  const evtMod = isMac ? e.metaKey : e.ctrlKey;
  const evtCtrl = isMac ? e.ctrlKey : false;

  if (parsed.mod !== evtMod) return false;
  if (parsed.ctrl !== evtCtrl) return false;
  // 非 macOS 上用户按下 Meta（Win 键）不作为绑定，直接忽略
  if (!isMac && e.metaKey) return false;
  if (parsed.alt !== e.altKey) return false;
  if (parsed.shift !== e.shiftKey) return false;

  const evtKey = normalizeKeyName(e.key);
  return parsed.key.toLowerCase() === evtKey.toLowerCase();
}

/**
 * 把组合串格式化为界面上展示的文本
 * @param combo 组合串，如 "Mod+Shift+Z"
 * @param forMac 是否按 macOS 风格展示
 */
export function formatCombo(combo: string, forMac?: boolean): string {
  if (!combo) return '未绑定';
  const isMac = forMac ?? (typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent));
  const parsed = parseKeyCombo(combo);
  if (!parsed) return combo;

  const parts: string[] = [];
  if (parsed.mod) parts.push(isMac ? '⌘' : 'Ctrl');
  if (parsed.ctrl) parts.push(isMac ? '⌃' : 'Ctrl');
  if (parsed.alt) parts.push(isMac ? '⌥' : 'Alt');
  if (parsed.shift) parts.push(isMac ? '⇧' : 'Shift');

  const keyLabel: Record<string, string> = {
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    ' ': 'Space',
    Enter: 'Enter',
    Escape: 'Esc',
    Backspace: 'Backspace',
    Delete: 'Del',
    Tab: 'Tab',
    '`': '`',
    '-': '-',
    '=': '=',
    '[': '[',
    ']': ']',
    '/': '/',
    ',': ',',
  };
  parts.push(keyLabel[parsed.key] ?? parsed.key);

  return isMac ? parts.join('') : parts.join('+');
}

/**
 * 检查组合串是否为合法的可绑定组合（至少包含一个修饰键或为功能键）
 * @param combo 组合串
 */
export function isBindableCombo(combo: string): boolean {
  const parsed = parseKeyCombo(combo);
  if (!parsed) return false;
  // 功能键可以单独绑定
  if (/^F\d{1,2}$/.test(parsed.key)) return true;
  // 其余情况必须带修饰键，避免与普通输入冲突
  return parsed.mod || parsed.ctrl || parsed.alt;
}
