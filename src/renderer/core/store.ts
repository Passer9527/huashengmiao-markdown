/**
 * 花生苗 Markdown 编辑器 —— 应用状态层
 * ------------------------------------------------------------------
 * 集中管理应用运行时状态：
 *   · 标签页集合与当前激活标签
 *   · 工作区（打开的文件夹）
 *   · 用户设置与快捷键绑定
 *   · 主题注入（文档主题 + 代码主题 + 明暗模式）
 *   · 命令注册与执行
 *   · 轻量事件总线
 *
 * 本模块不直接操作界面，只提供状态与能力，界面模块向其订阅变化。
 *
 * 作者：何飞    联系方式：微信 6731663
 * 开源协议：MIT
 */

import type { EditorState, Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import {
  DEFAULT_KEYBINDINGS,
  COMMAND_MAP,
  formatCombo,
  matchCombo,
  type CommandDef,
} from '../../shared/commands';
import { defaultSettings } from '../../shared/settings-defs';
import { buildDocumentCss, DOC_ROOT_CLASS, type ThemeDef } from '../../shared/themes';
import type { RecentFile, SettingDef, SettingsMap, ShortcutBinding, WorkspaceInfo } from '../../shared/types';
import { basename, stem } from '../../shared/path-utils';
import { toast } from './ui-kit';

/* ==================================================================
 * 一、数据结构
 * ================================================================== */

/** 一个标签页 */
export interface Tab {
  /** 标签唯一 ID */
  id: string;
  /** 文件绝对路径；未保存的新文档为 null */
  path: string | null;
  /** 显示名称 */
  name: string;
  /** CodeMirror 编辑器状态（含内容与撤销历史） */
  state: EditorState;
  /** 上次保存时的内容，用于判断是否有未保存修改 */
  savedContent: string;
  /** 文件编码 */
  encoding: string;
  /** 换行符风格 */
  eol: 'LF' | 'CRLF';
  /** 文件最后修改时间 */
  mtime: number;
  /** 是否为全新未保存文档 */
  isUntitled: boolean;
}

/** 侧边栏当前面板 */
export type SidebarPanel = 'files' | 'outline' | 'search';

/* ==================================================================
 * 二、事件总线
 * ================================================================== */

/** 支持的事件名 */
export type AppEvent =
  | 'tabs-changed'
  | 'active-tab-changed'
  | 'doc-changed'
  | 'dirty-changed'
  | 'settings-changed'
  | 'shortcuts-changed'
  | 'workspace-changed'
  | 'headings-changed'
  | 'cursor-changed'
  | 'theme-changed'
  | 'focus-mode-changed'
  | 'typewriter-changed'
  | 'source-mode-changed'
  | 'sidebar-changed';

/** 事件处理函数 */
type Handler = (payload?: unknown) => void;

/** 事件订阅表 */
const listeners = new Map<AppEvent, Set<Handler>>();

/**
 * 订阅事件
 * @param event 事件名
 * @param handler 处理函数
 * @returns 取消订阅的函数
 */
export function on(event: AppEvent, handler: Handler): () => void {
  let set = listeners.get(event);
  if (!set) {
    set = new Set();
    listeners.set(event, set);
  }
  set.add(handler);
  return () => set?.delete(handler);
}

/**
 * 触发事件
 * @param event 事件名
 * @param payload 附加数据
 */
export function emit(event: AppEvent, payload?: unknown): void {
  const set = listeners.get(event);
  if (!set) return;
  for (const h of [...set]) {
    try {
      h(payload);
    } catch {
      /* 单个订阅者出错不应影响其它订阅者 */
    }
  }
}

/* ==================================================================
 * 三、全局状态
 * ================================================================== */

/** 应用全局状态 */
export const state = {
  /** 已打开的标签页 */
  tabs: [] as Tab[],
  /** 当前激活标签的 ID */
  activeTabId: '' as string,
  /** 当前工作区 */
  workspace: null as WorkspaceInfo | null,
  /** 用户设置 */
  settings: defaultSettings() as SettingsMap,
  /** 设置项定义 */
  settingDefs: [] as SettingDef[],
  /** 快捷键绑定：命令 ID -> 按键组合 */
  keybindings: new Map<string, string>(),
  /** 快捷键完整信息 */
  shortcuts: [] as ShortcutBinding[],
  /** 最近打开的文件 */
  recent: [] as RecentFile[],
  /** 当前侧边栏面板 */
  sidebarPanel: 'files' as SidebarPanel,
  /** 侧边栏是否可见 */
  sidebarVisible: true,
  /** 是否处于源码模式 */
  sourceMode: false,
  /** 自定义主题列表 */
  customThemes: [] as Array<{ name: string; css: string; path: string }>,
  /** 内置主题列表 */
  builtinThemes: [] as ThemeDef[],
  /** 共享的编辑器实例（所有标签页共用一个 EditorView，切换标签时替换 state） */
  view: null as EditorView | null,
  /** 命令表：命令 ID -> 执行函数 */
  commands: new Map<string, () => void | Promise<void>>(),
  /** 界面语言 */
  language: 'zh-CN' as 'zh-CN' | 'en-US',
};

/* ==================================================================
 * 四、标签页管理
 * ================================================================== */

/** 生成唯一 ID */
function uid(): string {
  return 'tab-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

/**
 * 创建一个标签页对象
 * @param options 初始数据
 */
export function createTab(options: {
  path?: string | null;
  name?: string;
  content?: string;
  encoding?: string;
  eol?: 'LF' | 'CRLF';
  mtime?: number;
  state: EditorState;
}): Tab {
  return {
    id: uid(),
    path: options.path ?? null,
    name: options.name ?? '未命名',
    state: options.state,
    savedContent: options.content ?? '',
    encoding: options.encoding ?? 'UTF-8',
    eol: options.eol ?? 'LF',
    mtime: options.mtime ?? 0,
    isUntitled: !options.path,
  };
}

/** 添加标签页并激活 */
export function addTab(tab: Tab, activate = true): void {
  state.tabs.push(tab);
  if (activate) state.activeTabId = tab.id;
  emit('tabs-changed');
  if (activate) emit('active-tab-changed', tab);
}

/** 获取当前激活的标签页 */
export function activeTab(): Tab | null {
  return state.tabs.find((t) => t.id === state.activeTabId) ?? null;
}

/** 按路径查找已打开的标签页 */
export function findTabByPath(p: string): Tab | null {
  return state.tabs.find((t) => t.path === p) ?? null;
}

/**
 * 关闭标签页
 * @param id 标签 ID
 */
export function removeTab(id: string): void {
  const idx = state.tabs.findIndex((t) => t.id === id);
  if (idx < 0) return;

  const wasActive = state.activeTabId === id;
  state.tabs.splice(idx, 1);

  if (wasActive) {
    // 激活右侧邻居，没有则激活左侧
    const next = state.tabs[idx] ?? state.tabs[idx - 1] ?? null;
    state.activeTabId = next?.id ?? '';
  }

  emit('tabs-changed');
  emit('active-tab-changed', activeTab());
}

/**
 * 切换激活的标签页
 * @param id 标签 ID
 */
export function setActiveTab(id: string): void {
  if (state.activeTabId === id) return;
  state.activeTabId = id;
  emit('active-tab-changed', activeTab());
}

/** 判断标签页是否有未保存的修改 */
export function isDirty(tab: Tab): boolean {
  return tab.state.doc.toString() !== tab.savedContent;
}

/** 获取当前文档内容 */
export function currentContent(): string {
  const tab = activeTab();
  return tab ? tab.state.doc.toString() : '';
}

/**
 * 更新标签页的"已保存内容"基线
 * @param tab 标签页
 * @param content 已写入磁盘的内容
 */
export function markSaved(tab: Tab, content: string): void {
  tab.savedContent = content;
  tab.isUntitled = false;
  emit('dirty-changed', tab);
  emit('tabs-changed');
}

/* ==================================================================
 * 五、设置
 * ================================================================== */

/**
 * 读取一个设置项
 * @param key 设置键
 * @param fallback 兜底值
 */
export function getSetting<T extends string | number | boolean>(key: string, fallback: T): T {
  const v = state.settings[key];
  if (v === undefined || v === null) return fallback;
  return v as T;
}

/**
 * 修改一个设置项并持久化
 * @param key 设置键
 * @param value 新值
 */
export async function setSetting(key: string, value: string | number | boolean): Promise<void> {
  state.settings[key] = value;
  applySettings();
  emit('settings-changed', { key, value });
  try {
    await window.hsm.settings.set(key, value);
  } catch {
    toast('设置保存失败，重启后可能丢失', 'warning');
  }
}

/** 批量修改设置 */
export async function setSettings(values: SettingsMap): Promise<void> {
  Object.assign(state.settings, values);
  applySettings();
  emit('settings-changed', values);
  try {
    await window.hsm.settings.setMany(values);
  } catch {
    toast('设置保存失败，重启后可能丢失', 'warning');
  }
}

/* ==================================================================
 * 六、主题注入
 * ================================================================== */

/** 文档主题的 <style> 元素 */
let docThemeStyle: HTMLStyleElement | null = null;

/** 自定义主题的 <style> 元素 */
let customThemeStyle: HTMLStyleElement | null = null;

/**
 * 把当前主题写入页面
 * 文档主题样式只作用于编辑器内容区与导出内容，不影响应用界面配色。
 */
export function applyDocumentTheme(): void {
  if (!docThemeStyle) {
    docThemeStyle = document.createElement('style');
    docThemeStyle.id = 'hsm-doc-theme';
    document.head.appendChild(docThemeStyle);
  }

  const themeId = String(state.settings['appearance.theme'] ?? 'github');
  const codeThemeId = String(state.settings['appearance.codeTheme'] ?? 'github');

  // 自定义主题时，结构样式仍使用默认主题的骨架
  const baseId = themeId === 'custom' ? 'github' : themeId;
  let css = buildDocumentCss(baseId, codeThemeId);

  // 覆盖排版相关变量
  const fontSize = Number(state.settings['appearance.fontSize'] ?? 16);
  const lineHeight = Number(state.settings['appearance.lineHeight'] ?? 1.7);
  const pageWidth = Number(state.settings['appearance.pageWidth'] ?? 800);
  const paraGap = Number(state.settings['appearance.paragraphSpacing'] ?? 1);
  const fontFamily = String(state.settings['appearance.fontFamily'] ?? 'sans-serif');
  const codeFont = String(state.settings['appearance.codeFontFamily'] ?? 'monospace');
  const maxWidth = Number(state.settings['image.maxWidth'] ?? 100);
  const fullWidth = state.settings['appearance.fullWidth'] === true;

  css += `
.${DOC_ROOT_CLASS} {
  --doc-font-size: ${fontSize}px;
  --doc-line-height: ${lineHeight};
  --doc-para-gap: ${paraGap}em;
  --doc-font: ${fontFamily};
  --doc-code-font: ${codeFont};
  --doc-image-max-width: ${maxWidth}%;
}
.editor-inner {
  --editor-font-size: ${fontSize}px;
  --editor-line-height: ${lineHeight};
  --editor-page-width: ${fullWidth ? '100%' : pageWidth + 'px'};
  --editor-font: ${fontFamily};
  --editor-code-font: ${codeFont};
}
`;

  docThemeStyle.textContent = css;

  // 注入用户自定义主题 CSS
  if (themeId === 'custom') {
    const name = String(state.settings['appearance.customTheme'] ?? '');
    const found = state.customThemes.find((t) => t.name === name);
    if (found) {
      if (!customThemeStyle) {
        customThemeStyle = document.createElement('style');
        customThemeStyle.id = 'hsm-custom-theme';
        document.head.appendChild(customThemeStyle);
      }
      customThemeStyle.textContent = found.css;
    }
  } else if (customThemeStyle) {
    customThemeStyle.textContent = '';
  }

  emit('theme-changed');
}

/**
 * 计算并应用明暗模式
 * 规则：设置为 system 时跟随系统；否则直接使用设置值。
 */
export function applyColorMode(): void {
  const mode = String(state.settings['appearance.colorMode'] ?? 'system');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = mode === 'dark' || (mode === 'system' && prefersDark);
  document.documentElement.setAttribute('data-color-mode', dark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-color-mode-setting', mode);
}

/**
 * 统一应用所有影响界面的设置
 */
export function applySettings(): void {
  applyColorMode();
  applyDocumentTheme();

  const sidebarWidth = Number(state.settings['appearance.sidebarWidth'] ?? 240);
  document.documentElement.style.setProperty('--sidebar-width', `${sidebarWidth}px`);

  const app = document.getElementById('app');
  if (app) {
    app.classList.toggle('is-typewriter', state.settings['editor.typewriter'] === true);
    app.classList.toggle('is-focus-mode', state.settings['editor.focusMode'] === true);
    app.classList.toggle('is-source-mode', state.sourceMode);
  }

  // 状态栏显示/隐藏
  const statusbar = document.getElementById('statusbar');
  if (statusbar) statusbar.hidden = state.settings['appearance.showStatusBar'] === false;
}

/* ==================================================================
 * 七、快捷键
 * ================================================================== */

/** 按键组合 -> 命令 ID 的反向索引，用于快速匹配 */
let keyIndex = new Map<string, string>();

/** 重建快捷键反向索引 */
export function rebuildKeyIndex(): void {
  keyIndex = new Map();
  for (const [commandId, combo] of state.keybindings) {
    if (!combo) continue;
    keyIndex.set(combo.toLowerCase(), commandId);
  }
}

/**
 * 根据键盘事件查找匹配的命令
 * @param e 键盘事件
 * @returns 命令 ID；未匹配返回 null
 */
export function resolveCommand(e: KeyboardEvent): string | null {
  if (e.isComposing) return null; // 中文输入法组字过程中不响应快捷键
  for (const [combo, commandId] of keyIndex) {
    if (matchCombo(e, combo)) return commandId;
  }
  return null;
}

/** 获取某个命令当前绑定的显示文本 */
export function comboLabel(commandId: string): string {
  const combo = state.keybindings.get(commandId) ?? DEFAULT_KEYBINDINGS[commandId] ?? '';
  return formatCombo(combo);
}

/* ==================================================================
 * 八、命令
 * ================================================================== */

/**
 * 注册一个命令的实现
 * @param commandId 命令 ID
 * @param handler 执行函数
 */
export function registerCommand(commandId: string, handler: () => void | Promise<void>): void {
  state.commands.set(commandId, handler);
}

/**
 * 执行命令
 * @param commandId 命令 ID
 * @returns 是否成功找到并执行
 */
export async function runCommand(commandId: string): Promise<boolean> {
  const handler = state.commands.get(commandId);
  if (!handler) {
    const def: CommandDef | undefined = COMMAND_MAP.get(commandId);
    if (def) toast(`功能「${def.name}」暂未实现`, 'warning');
    return false;
  }
  try {
    await handler();
    return true;
  } catch (e) {
    const def = COMMAND_MAP.get(commandId);
    toast(`执行「${def?.name ?? commandId}」失败：${(e as Error).message}`, 'error');
    return false;
  }
}

/* ==================================================================
 * 九、窗口标题
 * ================================================================== */

/** 刷新窗口标题栏与任务栏标题 */
export function refreshWindowTitle(): void {
  const tab = activeTab();
  const dirty = tab ? isDirty(tab) : false;
  const name = tab ? tab.name : '未打开文档';

  const titleEl = document.getElementById('tb-filename');
  if (titleEl) titleEl.textContent = name;

  const dirtyEl = document.getElementById('tb-dirty');
  if (dirtyEl) dirtyEl.hidden = !dirty;

  void window.hsm.win.setTitle(`${dirty ? '● ' : ''}${name} - 花生苗 Markdown 编辑器`);
}

/* ==================================================================
 * 十、编辑器扩展装载点
 * ================================================================== */

/** 由 main.ts 注入的编辑器扩展（避免循环依赖） */
let editorExtensions: Extension[] = [];

/** 设置编辑器扩展列表 */
export function setEditorExtensions(ext: Extension[]): void {
  editorExtensions = ext;
}

/** 获取编辑器扩展列表 */
export function getEditorExtensions(): Extension[] {
  return editorExtensions;
}

/** 文件名工具：从路径取显示名 */
export function displayName(p: string): string {
  return stem(basename(p));
}
