/**
 * 花生苗 Markdown 编辑器 —— 渲染进程入口
 * ------------------------------------------------------------------
 * 负责把各个模块装配成一个完整的应用：
 *   · 启动时加载设置、快捷键、最近文件、自定义主题
 *   · 创建 CodeMirror 编辑器并管理多标签页
 *   · 注册全部命令（文件、编辑、格式、视图、表格、帮助）
 *   · 渲染标题栏菜单、标签栏、状态栏、查找条
 *   · 处理自动保存、图片粘贴、文件拖拽、导出、会话恢复
 *
 * 作者：何飞    联系方式：微信 6731663
 * 开源协议：MIT
 */

import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { undo, redo, selectAll as cmSelectAll } from '@codemirror/commands';

import {
  byId,
  clear,
  contextMenu,
  el,
  esc,
  openModal,
  toast,
  formatSize,
  hasModalOpen,
  closeTopModal,
} from './core/ui-kit';
import {
  state,
  on,
  emit,
  addTab,
  createTab,
  activeTab,
  findTabByPath,
  removeTab,
  setActiveTab,
  isDirty,
  markSaved,
  getSetting,
  setSetting,
  setSettings,
  applySettings,
  applyDocumentTheme,
  applyColorMode,
  rebuildKeyIndex,
  resolveCommand,
  comboLabel,
  registerCommand,
  runCommand,
  refreshWindowTitle,
  type Tab,
} from './core/store';

import {
  buildEditorExtensions,
  applyBold,
  applyItalic,
  applyUnderline,
  applyStrike,
  applyHighlight,
  applyInlineCode,
  applyLink,
  applyCodeBlock,
  applyMathBlock,
  applyMathInline,
  applyTable,
  applyQuote,
  applyHeading,
  applyBulletList,
  applyOrderedList,
  applyTaskList,
  applyHorizontalRule,
  applyToc,
  applyFootnote,
  insertImage,
  insertText,
  applyFindQuery,
  countMatches,
  doFindNext,
  doFindPrev,
  doReplaceNext,
  doReplaceAll,
  currentMatchIndex,
  setPasteHook,
  setBindingProvider,
  reconfigureKeymap,
  isSourceMode,
  scrollToLine,
  dispatch,
} from './editor/editor';

import {
  createMarkdownIt,
  renderDocument,
  computeStats,
  bumpHighlightVersion,
  type HeadingInfo,
} from './editor/markdown';
import { renderMermaid, clearMermaidCache } from './editor/mermaid';
import { loadShiki } from './editor/shiki';
import {
  initSidebar,
  showPanel,
  toggleSidebar,
  setSidebarVisible,
  openWorkspace,
  setWorkspace,
  refreshRecent,
  renderOutline,
  syncOutlineWithCursor,
  setSelectedPath,
  refreshTree,
} from './ui/sidebar';
import {
  openSettings,
  openShortcutDialog,
  openAboutDialog,
  openCheatsheet,
  openQuickOpen,
  openVersionHistory,
  openExportDialog,
} from './ui/overlays';

import { basename, dirname, extname, stem, join } from '../shared/path-utils';
import { COMMANDS, COMMAND_MAP } from '../shared/commands';
import type { FileNode, ExportFormat } from '../shared/types';

/* ==================================================================
 * 全局实例
 * ================================================================== */

/** markdown-it 实例（用于表格 Widget 与导出） */
const md = createMarkdownIt();

/** 最近一次解析出的标题列表 */
let headings: HeadingInfo[] = [];

/** 自动保存定时器 */
let autoSaveTimer: number | null = null;

/** 版本快照定时器 */
let snapshotTimer: number | null = null;

/** 查找条是否处于"替换"模式 */
let findReplaceMode = false;

/* ==================================================================
 * 一、启动
 * ================================================================== */

/** 应用启动入口 */
async function bootstrap(): Promise<void> {
  try {
    await loadUserData();
    applySettings();
    buildTitlebar();
    buildToolbar();
    createEditor();
    initSidebar({
      openFile: (p) => void openFileByPath(p),
      onTreeChanged: () => void refreshWindowTitle(),
      jumpToLine: () => undefined,
      openSearchHit: (hit) => void openSearchHit(hit),
    });
    registerAllCommands();
    bindGlobalShortcuts();
    bindWindowEvents();
    bindDragAndDrop();
    initFindBar();
    initStatusbar();
    setupAutoSave();
    setupPasteHandling();
    setupAppearanceWatchers();

    await restoreSession();

    // 处理启动参数里指定的文件
    const params = new URLSearchParams(location.search);
    const startFile = params.get('file');
    if (startFile) await openFileByPath(startFile, false);

    // 无任何标签页时展示欢迎页
    updateWorkspaceVisibility();

    console.log(`%c🌱 花生苗 Markdown 编辑器 v${window.__APP_VERSION__} 已就绪`, 'color:#22a06b;font-weight:bold');
    console.log('作者：何飞  微信：6731663  MIT 开源协议');

    // 后台加载 Shiki 代码高亮引擎：首帧先用 highlight.js 渲染，
    // 引擎就绪后再把代码块升级为更精细的分类结果（变量、运算符、标点都有独立配色）。
    // 放在启动之后再加载，避免与首屏渲染争抢时间。
    window.setTimeout(() => {
      void loadShiki().then((mod) => {
        if (!mod) return;
        bumpHighlightVersion();
        // 触发一次选区事务，让实时渲染重建代码块 Widget
        if (view) {
          view.dispatch({ selection: { anchor: view.state.selection.main.head } });
        }
        console.log('[花生苗] Shiki 代码高亮引擎已就绪');
      });
    }, 900);

    // 装载调试与自动化接口
    installDebugApi();
    (window as unknown as { __HSM_READY__: boolean }).__HSM_READY__ = true;
  } catch (e) {
    console.error('应用启动失败', e);
    toast(`启动时发生错误：${(e as Error).message}`, 'error', 0);
  }
}

/** 从主进程加载用户数据 */
async function loadUserData(): Promise<void> {
  const [settings, defs, shortcuts, recent, themes] = await Promise.all([
    window.hsm.settings.all(),
    window.hsm.settings.defs(),
    window.hsm.shortcuts.list(),
    window.hsm.recent.list(),
    window.hsm.theme.customList(),
  ]);

  state.settings = settings;
  state.settingDefs = defs;
  state.shortcuts = shortcuts;
  state.recent = recent;
  state.customThemes = themes;

  state.keybindings = new Map(shortcuts.map((s) => [s.commandId, s.keybinding]));
  rebuildKeyIndex();

  // 把"当前绑定"注入编辑器：编辑器内部的快捷键同样跟随用户自定义设置
  setBindingProvider(() => state.keybindings);

  // 设置里保存的侧边栏宽度优先于默认值
  const w = Number(settings['appearance.sidebarWidth'] ?? 240);
  document.documentElement.style.setProperty('--sidebar-width', `${w}px`);
}

/* ==================================================================
 * 二、标题栏与菜单
 * ================================================================== */

/** 菜单栏结构：菜单名 -> 命令 ID 列表 */
const MENU_STRUCTURE: Array<{ label: string; items: Array<string | '-'> }> = [
  {
    label: '文件',
    items: [
      'file.new',
      'file.newWindow',
      'file.open',
      'file.openFolder',
      '-',
      'file.save',
      'file.saveAs',
      '-',
      'file.exportHtml',
      'file.exportPdf',
      'file.exportPng',
      '-',
      'file.close',
      'file.closeWindow',
    ],
  },
  {
    label: '编辑',
    items: [
      'edit.undo',
      'edit.redo',
      '-',
      'edit.cut',
      'edit.copy',
      'edit.paste',
      'edit.pastePlain',
      'edit.selectAll',
      '-',
      'edit.find',
      'edit.replace',
      'edit.findNext',
      '-',
      'edit.moveLineUp',
      'edit.moveLineDown',
    ],
  },
  {
    label: '格式',
    items: [
      'format.bold',
      'format.italic',
      'format.underline',
      'format.strike',
      'format.highlight',
      'format.inlineCode',
      '-',
      'format.h1',
      'format.h2',
      'format.h3',
      'format.paragraph',
      '-',
      'format.quote',
      'format.codeBlock',
      'format.mathBlock',
      'format.table',
      'format.hr',
      '-',
      'format.link',
      'format.image',
      'format.toc',
      'format.footnote',
    ],
  },
  {
    label: '视图',
    items: [
      'view.toggleSource',
      'view.focusMode',
      'view.typewriter',
      'view.fullscreen',
      '-',
      'view.toggleSidebar',
      'view.outline',
      'view.fileTree',
      'view.searchPanel',
      '-',
      'view.zoomIn',
      'view.zoomOut',
      'view.zoomReset',
    ],
  },
  {
    label: '帮助',
    items: ['help.shortcuts', 'help.markdown', 'help.userManual', '-', 'help.about'],
  },
];

/** 构建标题栏菜单栏 */
function buildTitlebar(): void {
  const menubar = byId('menubar');
  clear(menubar);

  for (const menu of MENU_STRUCTURE) {
    const btn = el('button', { class: 'menubar__item', text: menu.label, type: 'button' });

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const rect = btn.getBoundingClientRect();
      contextMenu(
        rect.left,
        rect.bottom + 2,
        menu.items.map((id) =>
          id === '-'
            ? { label: '', separator: true }
            : {
                label: COMMAND_MAP.get(id)?.name ?? id,
                accelerator: comboLabel(id),
                onClick: () => void runCommand(id),
              },
        ),
      );
    });

    menubar.appendChild(btn);
  }

  // 工具栏按钮
  for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>('[data-command]'))) {
    b.addEventListener('click', () => {
      const id = b.dataset.command;
      if (id) void runCommand(id);
    });
  }
}

/** 工具栏：把 data-command 的按钮补上 tooltip */
function buildToolbar(): void {
  for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>('.toolbtn[data-command]'))) {
    const id = b.dataset.command;
    if (!id) continue;
    const def = COMMAND_MAP.get(id);
    if (def) b.title = `${def.name}（${comboLabel(id)}）`;
  }
}

/* ==================================================================
 * 三、编辑器
 * ================================================================== */

/** 创建编辑器实例 */
function createEditor(): void {
  const host = byId('editor-inner');
  clear(host);

  const extensions = buildEditorExtensions({
    preview: {
      getDocPath: () => activeTab()?.path ?? '',
      getMarkdownIt: () => md,
    },
    onHeadings: (h) => {
      headings = h;
      renderOutline(h);
      emit('headings-changed', h);
    },
    onDocChanged: () => {
      const tab = activeTab();
      if (!tab) return;
      // 保持标签页里的编辑器状态与视图同步，便于未保存判断与切换
      tab.state = view!.state;
      refreshWindowTitle();
      updateStatusbar();
      emit('doc-changed');
    },
    onCursorChanged: (info) => {
      updateCursorStatus(info);
      syncOutlineWithCursor(info.line - 1);
    },
    onIdle: () => scheduleSave(),
  });

  view = new EditorView({
    state: EditorState.create({ doc: '', extensions }),
    parent: host,
  });

  state.view = view;
}

/** 编辑器实例（延迟赋值，供回调引用） */
let view: EditorView | null = null;

/** 创建一个新的编辑器状态 */
function newState(content: string): EditorState {
  return EditorState.create({
    doc: content,
    extensions: buildEditorExtensions({
      preview: {
        getDocPath: () => activeTab()?.path ?? '',
        getMarkdownIt: () => md,
      },
      onHeadings: (h) => {
        headings = h;
        renderOutline(h);
        emit('headings-changed', h);
      },
      onDocChanged: () => {
        const tab = activeTab();
        if (tab && view) tab.state = view.state;
        refreshWindowTitle();
        updateStatusbar();
        emit('doc-changed');
      },
      onCursorChanged: (info) => {
        updateCursorStatus(info);
        syncOutlineWithCursor(info.line - 1);
      },
      onIdle: () => scheduleSave(),
    }),
  });
}

/* ==================================================================
 * 四、标签页
 * ================================================================== */

/** 渲染标签栏 */
function renderTabs(): void {
  const host = byId('tabs');
  clear(host);

  if (state.tabs.length === 0) {
    host.classList.add('is-hidden');
    return;
  }
  host.classList.remove('is-hidden');

  for (const tab of state.tabs) {
    const dirty = isDirty(tab);
    const node = el(
      'div',
      {
        class: `tab${tab.id === state.activeTabId ? ' is-active' : ''}${dirty ? ' is-dirty' : ''}`,
        title: tab.path ?? tab.name,
        role: 'tab',
      },
      el('span', { class: 'tab__icon', text: tab.isUntitled ? '✎' : '📄' }),
      el('span', { class: 'tab__title', text: tab.name }),
      dirty ? el('span', { class: 'tab__dirty', text: '●' }) : null,
      el('button', { class: 'tab__close', text: '✕', title: '关闭标签 (Ctrl+W)' }),
    );

    node.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).classList.contains('tab__close')) return;
      switchToTab(tab.id);
    });

    node.querySelector('.tab__close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      void closeTab(tab.id);
    });

    node.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      contextMenu(e.clientX, e.clientY, [
        { label: '关闭', onClick: () => void closeTab(tab.id) },
        { label: '关闭其它标签', onClick: () => void closeOtherTabs(tab.id) },
        { label: '关闭全部标签', onClick: () => void closeAllTabs() },
        { separator: true },
        {
          label: '在文件管理器中显示',
          disabled: !tab.path,
          onClick: () => tab.path && void window.hsm.fs.showInFolder(tab.path),
        },
        {
          label: '复制完整路径',
          disabled: !tab.path,
          onClick: () => {
            if (tab.path) {
              void navigator.clipboard.writeText(tab.path);
              toast('路径已复制', 'success');
            }
          },
        },
      ]);
    });

    host.appendChild(node);
  }

  // 让激活标签滚动到可见区域
  host.querySelector('.tab.is-active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/**
 * 切换标签页
 * @param id 目标标签 ID
 */
function switchToTab(id: string): void {
  const target = state.tabs.find((t) => t.id === id);
  if (!target || !view) return;

  // 先把当前编辑器状态存回旧标签页
  const current = activeTab();
  if (current) current.state = view.state;

  setActiveTab(id);
  view.setState(target.state);
  setSelectedPath(target.path ?? '');
  renderTabs();
  updateWorkspaceVisibility();
  refreshWindowTitle();
  updateStatusbar();

  // 让编辑器获得焦点，方便直接开始打字
  window.setTimeout(() => view?.focus(), 0);
}

/**
 * 关闭一个标签页（会检查未保存内容）
 * @param id 标签 ID
 */
async function closeTab(id: string): Promise<boolean> {
  const tab = state.tabs.find((t) => t.id === id);
  if (!tab) return true;

  // 同步当前编辑器状态
  const current = activeTab();
  if (current && view) current.state = view.state;

  if (isDirty(tab) && getSetting<boolean>('general.confirmOnExit', true)) {
    const choice = await window.hsm.dialog.confirmUnsaved(tab.name);
    if (choice === 'cancel') return false;
    if (choice === 'save') {
      const ok = await saveTab(tab);
      if (!ok) return false;
    }
  }

  if (tab.path) void window.hsm.fs.unwatch(tab.path);

  const wasActive = tab.id === state.activeTabId;
  removeTab(id);

  if (wasActive) {
    const next = activeTab();
    if (next && view) view.setState(next.state);
    else if (view) view.setState(newState(''));
  }

  renderTabs();
  updateWorkspaceVisibility();
  refreshWindowTitle();
  updateStatusbar();
  return true;
}

/** 关闭除指定标签外的其它标签 */
async function closeOtherTabs(keepId: string): Promise<void> {
  for (const tab of [...state.tabs]) {
    if (tab.id === keepId) continue;
    const ok = await closeTab(tab.id);
    if (!ok) break;
  }
}

/** 关闭全部标签 */
async function closeAllTabs(): Promise<void> {
  for (const tab of [...state.tabs]) {
    const ok = await closeTab(tab.id);
    if (!ok) break;
  }
}

/* ==================================================================
 * 五、打开与保存
 * ================================================================== */

/**
 * 打开一个文件
 * @param path 文件绝对路径
 * @param focus 打开后是否聚焦编辑器
 */
async function openFileByPath(path: string, focus = true): Promise<void> {
  // 已经打开过则直接切换
  const existing = findTabByPath(path);
  if (existing) {
    switchToTab(existing.id);
    return;
  }

  try {
    const file = await window.hsm.fs.openFileByPath(path);
    if (!file) {
      toast(`无法打开文件：${basename(path)}`, 'error');
      return;
    }

    const tab = createTab({
      path: file.path,
      name: basename(file.path),
      content: file.content,
      encoding: file.encoding,
      eol: file.eol,
      mtime: file.mtime,
      state: newState(file.content),
    });

    addTab(tab, true);
    if (view) view.setState(tab.state);
    setSelectedPath(file.path);
    renderTabs();
    updateWorkspaceVisibility();
    refreshWindowTitle();
    updateStatusbar();
    void refreshRecent();

    if (focus) window.setTimeout(() => view?.focus(), 0);
    void window.hsm.fs.watch(file.path);

    // 建立全文索引
    void window.hsm.search.index(file.path, stem(basename(file.path)), file.content);
  } catch (e) {
    toast(`打开文件失败：${(e as Error).message}`, 'error');
  }
}

/** 新建一个空白文档 */
function newFile(): void {
  const tab = createTab({
    name: '未命名',
    content: '',
    state: newState(''),
  });
  addTab(tab, true);
  if (view) view.setState(tab.state);
  setSelectedPath('');
  renderTabs();
  updateWorkspaceVisibility();
  refreshWindowTitle();
  updateStatusbar();
  window.setTimeout(() => view?.focus(), 0);
}

/**
 * 保存指定标签页
 * @param tab 标签页
 * @returns 是否保存成功
 */
async function saveTab(tab: Tab): Promise<boolean> {
  // 确保拿到最新内容
  const current = activeTab();
  if (current && current.id === tab.id && view) tab.state = view.state;

  const content = tab.state.doc.toString();

  // 未命名文档需要先选择保存位置
  if (!tab.path) {
    const target = await window.hsm.fs.saveAsDialog(join(await defaultSaveDir(), `${tab.name}.md`));
    if (!target) return false;
    tab.path = target;
    tab.name = basename(target);
    tab.isUntitled = false;
  }

  try {
    const result = await window.hsm.fs.writeFile(tab.path, content);
    if (!result.ok) {
      toast(`保存失败：${result.error ?? '未知错误'}`, 'error');
      return false;
    }

    markSaved(tab, content);
    renderTabs();
    refreshWindowTitle();
    updateStatusbar();
    setSaveIndicator(true);

    // 更新索引与最近文件
    void window.hsm.search.index(tab.path, stem(basename(tab.path)), content);
    void window.hsm.recent.add(tab.path);
    void window.hsm.fs.watch(tab.path);

    toast(`已保存 ${tab.name}`, 'success', 1400);
    return true;
  } catch (e) {
    toast(`保存失败：${(e as Error).message}`, 'error');
    return false;
  }
}

/** 计算默认保存目录 */
async function defaultSaveDir(): Promise<string> {
  if (state.workspace) return state.workspace.root;
  const tab = activeTab();
  if (tab?.path) return dirname(tab.path);
  // 退回用户主目录（由主进程解析）
  return '';
}

/** 另存为 */
async function saveTabAs(tab: Tab): Promise<boolean> {
  const content = tab.state.doc.toString();
  const suggested = tab.path ?? join(await defaultSaveDir(), `${tab.name}.md`);
  const target = await window.hsm.fs.saveAsDialog(suggested);
  if (!target) return false;

  const result = await window.hsm.fs.writeFile(target, content);
  if (!result.ok) {
    toast(`另存为失败：${result.error ?? '未知错误'}`, 'error');
    return false;
  }

  const oldPath = tab.path;
  tab.path = target;
  tab.name = basename(target);
  tab.isUntitled = false;
  markSaved(tab, content);

  if (oldPath) void window.hsm.fs.unwatch(oldPath);
  void window.hsm.fs.watch(target);
  void window.hsm.recent.add(target);

  renderTabs();
  refreshWindowTitle();
  toast(`已另存为 ${basename(target)}`, 'success');
  return true;
}

/* ==================================================================
 * 六、自动保存与快照
 * ================================================================== */

/** 安排一次延迟保存（停止输入后触发） */
function scheduleSave(): void {
  if (!getSetting<boolean>('general.autoSave', true)) return;
  if (autoSaveTimer !== null) window.clearTimeout(autoSaveTimer);

  const seconds = getSetting<number>('general.autoSaveInterval', 5);
  autoSaveTimer = window.setTimeout(() => {
    autoSaveTimer = null;
    void autoSaveCurrent();
  }, Math.max(1, seconds) * 1000);
}

/** 执行自动保存（只保存已命名的文件） */
async function autoSaveCurrent(): Promise<void> {
  const tab = activeTab();
  if (!tab || !tab.path) return;
  if (!isDirty(tab)) return;
  await saveTab(tab);
}

/** 设置自动保存与版本快照的定时任务 */
function setupAutoSave(): void {
  // 定时快照
  const scheduleSnapshot = (): void => {
    if (!getSetting<boolean>('advanced.historyEnabled', true)) return;
    if (snapshotTimer !== null) window.clearTimeout(snapshotTimer);
    const minutes = getSetting<number>('advanced.historyInterval', 5);
    snapshotTimer = window.setTimeout(() => {
      snapshotTimer = null;
      const tab = activeTab();
      if (tab?.path) {
        void window.hsm.history.snapshot(tab.path, tab.state.doc.toString());
      }
      scheduleSnapshot();
    }, Math.max(1, minutes) * 60 * 1000);
  };
  scheduleSnapshot();

  // 窗口失焦时保存
  window.addEventListener('blur', () => {
    void autoSaveCurrent();
  });

  // 定时器兜底：即使没有输入也定期检查一次
  window.setInterval(() => {
    const tab = activeTab();
    if (tab && isDirty(tab) && tab.path) void autoSaveCurrent();
  }, 30000);
}

/* ==================================================================
 * 七、查找替换
 * ================================================================== */

/** 初始化查找条 */
function initFindBar(): void {
  const bar = byId('findbar');
  const findInput = byId<HTMLInputElement>('find-input');
  const replaceInput = byId<HTMLInputElement>('replace-input');
  const countEl = byId('find-count');

  const refresh = (): void => {
    if (!view) return;
    const total = applyFindQuery(view, {
      search: findInput.value,
      replace: replaceInput.value,
      caseSensitive: byId<HTMLInputElement>('find-case').checked,
      wholeWord: byId<HTMLInputElement>('find-word').checked,
      regexp: byId<HTMLInputElement>('find-regex').checked,
    });
    const idx = currentMatchIndex(view);
    countEl.textContent = total > 0 ? `${idx || 1}/${total}` : '0/0';
  };

  findInput.addEventListener('input', refresh);
  replaceInput.addEventListener('input', refresh);
  for (const id of ['find-case', 'find-word', 'find-regex']) {
    byId<HTMLInputElement>(id).addEventListener('change', refresh);
  }

  findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) doFindPrev(view!);
      else doFindNext(view!);
      refresh();
    }
    if (e.key === 'Escape') closeFindBar();
  });

  byId('find-next').addEventListener('click', () => {
    if (view) doFindNext(view);
    refresh();
  });
  byId('find-prev').addEventListener('click', () => {
    if (view) doFindPrev(view);
    refresh();
  });
  byId('find-close').addEventListener('click', () => closeFindBar());
  byId('replace-one').addEventListener('click', () => {
    if (view) doReplaceNext(view);
    refresh();
  });
  byId('replace-all').addEventListener('click', () => {
    if (!view) return;
    const count = countMatches(view);
    doReplaceAll(view);
    toast(`已替换 ${count} 处`, 'success');
    refresh();
  });

  void bar;
}

/**
 * 打开查找条
 * @param withReplace 是否显示替换行
 */
function openFindBar(withReplace: boolean): void {
  findReplaceMode = withReplace;
  const bar = byId('findbar');
  bar.hidden = false;
  byId('findbar-replace-row').hidden = !withReplace;

  const input = byId<HTMLInputElement>('find-input');
  // 若编辑器中有选中文本，自动填入查找框
  const sel = view ? view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to) : '';
  if (sel && !sel.includes('\n')) input.value = sel;

  input.focus();
  input.select();
  if (view) applyFindQuery(view, { search: input.value });
}

/** 关闭查找条 */
function closeFindBar(): void {
  byId('findbar').hidden = true;
  if (view) {
    // 清空查找条件，移除匹配高亮
    applyFindQuery(view, { search: '' });
    view.focus();
  }
}

/* ==================================================================
 * 八、状态栏
 * ================================================================== */

/** 初始化状态栏交互 */
function initStatusbar(): void {
  byId('st-outline-toggle').addEventListener('click', () => showPanel('outline'));

  byId('st-mode').addEventListener('click', () => void runCommand('view.toggleSource'));

  byId('st-theme').addEventListener('click', () => {
    // 依次循环：跟随系统 → 浅色 → 深色
    const cur = String(state.settings['appearance.colorMode'] ?? 'system');
    const next = cur === 'system' ? 'light' : cur === 'light' ? 'dark' : 'system';
    void setSetting('appearance.colorMode', next);
    updateStatusbar();
  });
}

/** 更新状态栏的统计信息 */
function updateStatusbar(): void {
  const tab = activeTab();
  const text = tab ? tab.state.doc.toString() : '';
  const stats = computeStats(text);

  byId('st-stats').textContent =
    `字数 ${stats.chars} · 词 ${stats.words} · 行 ${stats.lines} · 阅读 ${stats.readingMinutes} 分钟`;

  byId('st-encoding').textContent = tab?.encoding ?? 'UTF-8';
  byId('st-eol').textContent = tab?.eol ?? 'LF';
  byId('st-lang').textContent = 'Markdown';

  byId('st-mode').textContent = isSourceMode() ? '源码模式' : '实时预览';

  const modeNames: Record<string, string> = { system: '跟随系统', light: '浅色', dark: '深色' };
  byId('st-theme').textContent = modeNames[String(state.settings['appearance.colorMode'] ?? 'system')] ?? '跟随系统';

  // 保存状态
  const saveEl = byId('st-save');
  const dirty = tab ? isDirty(tab) : false;
  saveEl.textContent = dirty ? '未保存' : '已保存';
  saveEl.className = `statusitem ${dirty ? 'statusitem--dirty' : 'statusitem--saved'}`;
}

/** 更新光标位置显示 */
function updateCursorStatus(info: { line: number; column: number; selectionLength: number }): void {
  byId('st-cursor').textContent = `行 ${info.line}，列 ${info.column}`;

  const selEl = byId('st-selection');
  if (info.selectionLength > 0) {
    selEl.hidden = false;
    selEl.textContent = `已选 ${info.selectionLength} 字符`;
  } else {
    selEl.hidden = true;
  }
}

/** 显示保存状态提示 */
function setSaveIndicator(saved: boolean): void {
  const saveEl = byId('st-save');
  saveEl.textContent = saved ? '已保存' : '未保存';
  saveEl.className = `statusitem ${saved ? 'statusitem--saved' : 'statusitem--dirty'}`;
}

/* ==================================================================
 * 九、命令注册
 * ================================================================== */

/** 注册全部命令的实现 */
function registerAllCommands(): void {
  const withEditor = (fn: (v: EditorView) => unknown) => () => {
    if (!view) return;
    view.focus();
    fn(view);
  };

  /* -------------------- 文件 -------------------- */
  registerCommand('file.new', () => newFile());
  registerCommand('file.newWindow', () => void window.hsm.app.newWindow());
  registerCommand('file.open', async () => {
    const file = await window.hsm.fs.openFile();
    if (file) {
      const existing = findTabByPath(file.path);
      if (existing) {
        switchToTab(existing.id);
      } else {
        await openFileByPath(file.path);
      }
    }
  });
  registerCommand('file.openFolder', () => void openWorkspace());
  registerCommand('file.save', async () => {
    const tab = activeTab();
    if (tab) await saveTab(tab);
  });
  registerCommand('file.saveAs', async () => {
    const tab = activeTab();
    if (tab) await saveTabAs(tab);
  });
  registerCommand('file.close', async () => {
    const tab = activeTab();
    if (tab) await closeTab(tab.id);
  });
  registerCommand('file.closeWindow', () => void window.hsm.win.close());
  registerCommand('file.quickOpen', () => void quickOpen());
  registerCommand('file.settings', () => openSettings());
  registerCommand('file.exportHtml', () => void quickExport('html'));
  registerCommand('file.exportPdf', () => void quickExport('pdf'));
  registerCommand('file.exportPng', () => void quickExport('png'));
  registerCommand('file.print', () => void quickExport('pdf'));
  registerCommand('file.exportDialog', () => {
    const tab = activeTab();
    openExportDialog(tab?.path ?? '', tab?.name ?? '未命名', (format) => {
      void quickExport(format as ExportFormat);
    });
  });

  /* -------------------- 编辑 -------------------- */
  registerCommand('edit.undo', withEditor((v) => undo(v)));
  registerCommand('edit.redo', withEditor((v) => redo(v)));
  registerCommand('edit.cut', withEditor(() => {
    // Electron 中 document.execCommand 仍然可用，能正确触发系统剪贴板
    document.execCommand('cut');
  }));
  registerCommand('edit.copy', withEditor(() => {
    document.execCommand('copy');
  }));
  registerCommand('edit.paste', withEditor(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (view && text) insertText(view, text);
    } catch {
      toast('无法读取剪贴板，请使用 Ctrl+V', 'warning');
    }
  }));
  registerCommand('edit.pastePlain', withEditor(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (view && text) insertText(view, text);
    } catch {
      toast('无法读取剪贴板，请使用 Ctrl+Shift+V', 'warning');
    }
  }));
  registerCommand('edit.selectAll', withEditor((v) => cmSelectAll(v)));
  registerCommand('edit.find', () => openFindBar(false));
  registerCommand('edit.replace', () => openFindBar(true));
  registerCommand('edit.findNext', withEditor((v) => {
    doFindNext(v);
    if (!byId('findbar').hidden) {
      byId('find-count').textContent = String(countMatches(v));
    }
  }));
  registerCommand('edit.findPrev', withEditor((v) => doFindPrev(v)));
  registerCommand('edit.moveLineUp', withEditor(async (v) => {
    const { moveLineUp } = await import('@codemirror/commands');
    moveLineUp(v);
  }));
  registerCommand('edit.moveLineDown', withEditor(async (v) => {
    const { moveLineDown } = await import('@codemirror/commands');
    moveLineDown(v);
  }));
  registerCommand('edit.copyLineUp', withEditor(async (v) => {
    const { copyLineUp } = await import('@codemirror/commands');
    copyLineUp(v);
  }));
  registerCommand('edit.copyLineDown', withEditor(async (v) => {
    const { copyLineDown } = await import('@codemirror/commands');
    copyLineDown(v);
  }));
  registerCommand('edit.deleteLine', withEditor(async (v) => {
    const { deleteLine } = await import('@codemirror/commands');
    deleteLine(v);
  }));

  /* -------------------- 格式 -------------------- */
  registerCommand('format.bold', withEditor(applyBold));
  registerCommand('format.italic', withEditor(applyItalic));
  registerCommand('format.underline', withEditor(applyUnderline));
  registerCommand('format.strike', withEditor(applyStrike));
  registerCommand('format.highlight', withEditor(applyHighlight));
  registerCommand('format.inlineCode', withEditor(applyInlineCode));
  registerCommand('format.link', withEditor(applyLink));
  registerCommand('format.image', () => void insertImageFromDialog());
  registerCommand('format.codeBlock', withEditor(applyCodeBlock));
  registerCommand('format.mathBlock', withEditor(applyMathBlock));
  registerCommand('format.mathInline', withEditor(applyMathInline));
  registerCommand('format.table', withEditor(applyTable));
  registerCommand('format.quote', withEditor(applyQuote));
  registerCommand('format.h1', withEditor((v) => applyHeading(v, 1)));
  registerCommand('format.h2', withEditor((v) => applyHeading(v, 2)));
  registerCommand('format.h3', withEditor((v) => applyHeading(v, 3)));
  registerCommand('format.h4', withEditor((v) => applyHeading(v, 4)));
  registerCommand('format.h5', withEditor((v) => applyHeading(v, 5)));
  registerCommand('format.h6', withEditor((v) => applyHeading(v, 6)));
  registerCommand('format.paragraph', withEditor((v) => applyHeading(v, 0)));
  registerCommand('format.bulletList', withEditor(applyBulletList));
  registerCommand('format.orderedList', withEditor(applyOrderedList));
  registerCommand('format.taskList', withEditor(applyTaskList));
  registerCommand('format.hr', withEditor(applyHorizontalRule));
  registerCommand('format.toc', withEditor(applyToc));
  registerCommand('format.footnote', withEditor(applyFootnote));

  /* -------------------- 视图 -------------------- */
  registerCommand('view.toggleSource', () => toggleSourceMode());
  registerCommand('view.focusMode', () => void toggleFocusMode());
  registerCommand('view.typewriter', () => void toggleTypewriter());
  registerCommand('view.fullscreen', () => void toggleFullscreen());
  registerCommand('view.toggleSidebar', () => toggleSidebar());
  registerCommand('view.outline', () => showPanel('outline'));
  registerCommand('view.fileTree', () => showPanel('files'));
  registerCommand('view.searchPanel', () => showPanel('search'));
  registerCommand('view.zoomIn', () => void zoomFontSize(1));
  registerCommand('view.zoomOut', () => void zoomFontSize(-1));
  registerCommand('view.zoomReset', () => void setSetting('appearance.fontSize', 16));
  registerCommand('view.indent', withEditor(async (v) => {
    const { indentMore } = await import('@codemirror/commands');
    indentMore(v);
  }));
  registerCommand('view.outdent', withEditor(async (v) => {
    const { indentLess } = await import('@codemirror/commands');
    indentLess(v);
  }));

  /* -------------------- 表格 -------------------- */
  registerCommand('table.insertRowBelow', withEditor((v) => insertTableRow(v, 1)));
  registerCommand('table.insertRowAbove', withEditor((v) => insertTableRow(v, 0)));
  registerCommand('table.deleteRow', withEditor((v) => deleteTableRow(v)));
  registerCommand('table.insertColRight', withEditor((v) => insertTableColumn(v, 1)));
  registerCommand('table.insertColLeft', withEditor((v) => insertTableColumn(v, 0)));
  registerCommand('table.deleteCol', withEditor((v) => deleteTableColumn(v)));
  registerCommand('table.alignLeft', withEditor((v) => setTableAlign(v, ':---')));
  registerCommand('table.alignCenter', withEditor((v) => setTableAlign(v, ':---:')));
  registerCommand('table.alignRight', withEditor((v) => setTableAlign(v, '---:')));

  /* -------------------- 帮助 -------------------- */
  registerCommand('help.shortcuts', () => openShortcutDialog());
  registerCommand('help.markdown', () => openCheatsheet());
  registerCommand('help.about', () => openAboutDialog());
  registerCommand('help.userManual', () => {
    openModal({
      title: '用户手册',
      className: 'modal--wide',
      width: 720,
      content: `<div class="manual">
        <h3>快速上手</h3>
        <ol>
          <li><b>新建 / 打开文档</b>：<code>Ctrl+N</code> 新建，<code>Ctrl+O</code> 打开文件，<code>Ctrl+Shift+O</code> 打开文件夹作为工作区。</li>
          <li><b>实时渲染</b>：默认所见即所得。光标所在位置会显示 Markdown 源码，其余位置直接显示排版结果。按 <code>Ctrl+/</code> 可切换为纯源码模式。</li>
          <li><b>格式排版</b>：用工具栏按钮或快捷键，如 <code>Ctrl+B</code> 加粗、<code>Ctrl+1</code> 一级标题、<code>Ctrl+T</code> 插入表格。</li>
          <li><b>插入图片</b>：直接粘贴或拖拽图片到编辑区，图片会自动保存到文档旁的 assets 目录并插入相对路径。</li>
          <li><b>导出</b>：<code>文件 → 导出为 HTML / PDF / 图片</code>。</li>
        </ol>
        <h3>数据存放位置</h3>
        <p>所有配置、最近文件、版本快照都保存在本机的用户数据目录中，不会上传到任何服务器。</p>
        <h3>遇到问题</h3>
        <p>可通过「帮助 → 关于」打开日志目录，把日志文件发给作者协助排查。</p>
        <p class="manual__contact">作者：何飞 &nbsp;·&nbsp; 微信：6731663</p>
      </div>`,
    });
  });
}

/* ==================================================================
 * 十、视图模式切换
 * ================================================================== */

/** 切换源码 / 实时预览模式 */
function toggleSourceMode(): void {
  if (!view) return;
  const next = !isSourceMode();
  // 通过重建编辑器状态来应用模式切换：实时渲染扩展与源码扩展互斥
  rebuildEditorState(next);
  toast(next ? '已切换到源码模式' : '已切换到实时预览', 'info', 1500);
}

/**
 * 重建编辑器状态以应用源码 / 实时预览模式
 * @param sourceMode 是否切换为源码模式
 */
function rebuildEditorState(sourceMode: boolean): void {
  const tab = activeTab();
  if (!view || !tab) return;

  const content = view.state.doc.toString();
  const selection = view.state.selection.main;

  // 先写入设置，newState 会读取它来决定是否装载实时渲染扩展
  state.settings['editor.livePreview'] = !sourceMode;
  void window.hsm.settings.set('editor.livePreview', !sourceMode);

  const rebuilt = newState(content);
  view.setState(rebuilt);

  // 尽量恢复光标位置
  try {
    const pos = Math.min(selection.head, rebuilt.doc.length);
    view.dispatch({ selection: { anchor: pos } });
  } catch {
    /* 忽略位置恢复失败 */
  }

  tab.state = view.state;
  byId('app').classList.toggle('is-source-mode', sourceMode);
  updateStatusbar();
}

/** 切换专注模式 */
async function toggleFocusMode(): Promise<void> {
  const next = !getSetting<boolean>('editor.focusMode', false);
  await setSetting('editor.focusMode', next);
  byId('app').classList.toggle('is-focus-mode', next);
  emit('focus-mode-changed', next);
  toast(next ? '已进入专注模式（F8 退出）' : '已退出专注模式', 'info', 1800);
}

/** 切换打字机模式 */
async function toggleTypewriter(): Promise<void> {
  const next = !getSetting<boolean>('editor.typewriter', false);
  await setSetting('editor.typewriter', next);
  byId('app').classList.toggle('is-typewriter', next);
  emit('typewriter-changed', next);
  toast(next ? '已开启打字机模式（当前行居中）' : '已关闭打字机模式', 'info', 1800);
}

/** 切换全屏 */
async function toggleFullscreen(): Promise<void> {
  const isFull = await window.hsm.win.isFullScreen();
  await window.hsm.win.setFullScreen(!isFull);
  byId('app').classList.toggle('is-fullscreen', !isFull);
}

/** 调整字号 */
async function zoomFontSize(delta: number): Promise<void> {
  const current = Number(state.settings['appearance.fontSize'] ?? 16);
  const next = Math.max(10, Math.min(40, current + delta));
  await setSetting('appearance.fontSize', next);
  toast(`字号 ${next}px`, 'info', 1200);
}

/* ==================================================================
 * 十一、表格操作
 * ================================================================== */

/** 定位光标所在的表格区域 */
function locateTable(v: EditorView): { startLine: number; endLine: number; rows: string[]; rowIndex: number } | null {
  const pos = v.state.selection.main.head;
  const doc = v.state.doc;
  const curLine = doc.lineAt(pos).number;
  const isRow = (s: string): boolean => /^\s*\|.*\|\s*$/.test(s) || /^\s*\|?[-: ]+\|[-: |]*$/.test(s);

  if (!isRow(doc.line(curLine).text)) return null;

  let start = curLine;
  while (start > 1 && isRow(doc.line(start - 1).text)) start -= 1;
  let end = curLine;
  while (end < doc.lines && isRow(doc.line(end + 1).text)) end += 1;

  const rows: string[] = [];
  for (let n = start; n <= end; n += 1) rows.push(doc.line(n).text);

  return { startLine: start, endLine: end, rows, rowIndex: curLine - start };
}

/** 解析表格行为单元格数组 */
function splitRow(row: string): string[] {
  let s = row.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

/** 把单元格数组还原为表格行 */
function joinRow(cells: string[]): string {
  return '| ' + cells.join(' | ') + ' |';
}

/**
 * 插入表格行
 * @param v 编辑器
 * @param offset 0 表示插入到当前行上方，1 表示下方
 */
function insertTableRow(v: EditorView, offset: number): boolean {
  const info = locateTable(v);
  if (!info) {
    toast('请先把光标放到表格内', 'warning');
    return false;
  }

  const cells = splitRow(info.rows[info.rowIndex]);
  const newRow = joinRow(cells.map(() => ' '));
  const doc = v.state.doc;
  const line = doc.line(info.startLine + info.rowIndex);

  dispatch(v, {
    changes: { from: offset === 0 ? line.from : line.to, insert: (offset === 0 ? '' : '\n') + newRow + (offset === 0 ? '\n' : '') },
    userEvent: 'input.table',
  });
  return true;
}

/** 删除当前表格行 */
function deleteTableRow(v: EditorView): boolean {
  const info = locateTable(v);
  if (!info) {
    toast('请先把光标放到表格内', 'warning');
    return false;
  }
  if (info.rows.length <= 2) {
    toast('表格至少需要保留表头与分隔行', 'warning');
    return false;
  }

  const doc = v.state.doc;
  const line = doc.line(info.startLine + info.rowIndex);
  const to = line.to < doc.length ? line.to + 1 : line.to;

  dispatch(v, { changes: { from: line.from, to, insert: '' }, userEvent: 'delete.table' });
  return true;
}

/**
 * 插入表格列
 * @param v 编辑器
 * @param offset 0 表示插入到当前列左侧，1 表示右侧
 */
function insertTableColumn(v: EditorView, offset: number): boolean {
  const info = locateTable(v);
  if (!info) {
    toast('请先把光标放到表格内', 'warning');
    return false;
  }

  const pos = v.state.selection.main.head;
  const line = v.state.doc.lineAt(pos);
  const colIndex = (line.text.slice(0, pos - line.from).match(/\|/g) || []).length;
  const insertAt = Math.max(1, colIndex + offset);

  const changes = info.rows.map((row, i) => {
    const docLine = v.state.doc.line(info.startLine + i);
    const cells = splitRow(row);
    const isDelimiter = /^[-: ]+$/.test(cells[0] ?? '');
    cells.splice(Math.min(insertAt, cells.length), 0, isDelimiter ? '---' : ' ');
    return { from: docLine.from, to: docLine.to, insert: joinRow(cells) };
  });

  dispatch(v, { changes, userEvent: 'input.table' });
  return true;
}

/** 删除当前表格列 */
function deleteTableColumn(v: EditorView): boolean {
  const info = locateTable(v);
  if (!info) {
    toast('请先把光标放到表格内', 'warning');
    return false;
  }

  const pos = v.state.selection.main.head;
  const line = v.state.doc.lineAt(pos);
  const colIndex = Math.max(0, (line.text.slice(0, pos - line.from).match(/\|/g) || []).length - 1);

  const firstCells = splitRow(info.rows[0]);
  if (firstCells.length <= 1) {
    toast('表格至少需要保留一列', 'warning');
    return false;
  }

  const changes = info.rows.map((row, i) => {
    const docLine = v.state.doc.line(info.startLine + i);
    const cells = splitRow(row);
    cells.splice(Math.min(colIndex, cells.length - 1), 1);
    return { from: docLine.from, to: docLine.to, insert: joinRow(cells) };
  });

  dispatch(v, { changes, userEvent: 'delete.table' });
  return true;
}

/** 设置整表对齐方式 */
function setTableAlign(v: EditorView, delimiter: string): boolean {
  const info = locateTable(v);
  if (!info) {
    toast('请先把光标放到表格内', 'warning');
    return false;
  }

  // 第二行是分隔行
  const delimLineIndex = info.startLine + 1;
  const doc = v.state.doc;
  if (delimLineIndex > doc.lines) return false;

  const line = doc.line(delimLineIndex);
  const cells = splitRow(line.text).map(() => delimiter);

  dispatch(v, {
    changes: { from: line.from, to: line.to, insert: joinRow(cells) },
    userEvent: 'input.table',
  });
  return true;
}

/* ==================================================================
 * 十二、图片与粘贴
 * ================================================================== */

/** 通过文件对话框插入图片 */
async function insertImageFromDialog(): Promise<void> {
  if (!view) return;
  const docPath = activeTab()?.path ?? state.workspace?.root ?? '';
  const result = await window.hsm.image.pickAndSave(docPath);
  if (!result.ok) {
    if (result.error !== 'cancelled') toast(result.error ?? '插入图片失败', 'error');
    return;
  }
  if (result.relativePath) {
    insertImage(view, result.relativePath, stem(basename(result.relativePath)));
  }
}

/** 注册粘贴处理：图片自动落盘，URL 自动转链接 */
function setupPasteHandling(): void {
  setPasteHook((event, v) => {
    const clipboard = event.clipboardData;
    if (!clipboard) return false;

    // 1) 剪贴板里有图片文件
    const files = Array.from(clipboard.files || []);
    const imageFile = files.find((f) => f.type.startsWith('image/'));
    if (imageFile) {
      void handleImageFile(imageFile, v);
      return true;
    }

    // 2) 剪贴板里是 HTML 且含 img 标签（从网页复制的图片）
    const html = clipboard.getData('text/html');
    if (html) {
      const m = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
      if (m && /^https?:/i.test(m[1])) {
        const selected = v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to);
        // 选中文字时把文字变成链接，否则插入图片
        insertText(v, selected ? `[${selected}](${m[1]})` : `![图片](${m[1]})`);
        return true;
      }
    }

    // 3) 粘贴 URL 到选中的文字上 → 自动转为链接
    const text = clipboard.getData('text/plain');
    const sel = v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to);
    if (sel && text && /^https?:\/\/\S+$/i.test(text.trim())) {
      insertText(v, `[${sel}](${text.trim()})`);
      return true;
    }

    return false;
  });
}

/**
 * 处理粘贴 / 拖拽进来的图片文件
 * @param file 图片文件
 * @param v 编辑器
 */
async function handleImageFile(file: File, v: EditorView): Promise<void> {
  try {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const ext = file.type ? await window.hsm.image.mimeToExt(file.type) : guessExt(file.name);

    if (!activeTab()?.path && !state.workspace) {
      toast('请先保存文档或打开工作区，图片需要保存到磁盘', 'warning', 4000);
      return;
    }

    const docPath = activeTab()?.path ?? state.workspace?.root ?? '';
    const result = await window.hsm.image.saveFromBuffer(buffer, ext, docPath);

    if (!result.ok || !result.relativePath) {
      toast(result.error ?? '图片保存失败', 'error');
      return;
    }

    insertImage(v, result.relativePath, stem(basename(result.relativePath)));
    toast(
      result.deduplicated ? '图片已存在，直接复用' : `图片已保存（${result.width ?? '?'}×${result.height ?? '?'}）`,
      'success',
      1800,
    );
  } catch (e) {
    toast(`处理图片失败：${(e as Error).message}`, 'error');
  }
}

/** 根据文件名猜扩展名 */
function guessExt(name: string): string {
  const e = extname(name);
  return e || '.png';
}

/** 绑定窗口级文件拖拽 */
function bindDragAndDrop(): void {
  const host = byId('editor-host');

  const prevent = (e: DragEvent): void => {
    e.preventDefault();
    e.stopPropagation();
  };

  for (const evt of ['dragenter', 'dragover', 'dragleave', 'drop'] as const) {
    document.addEventListener(evt, prevent as EventListener, false);
  }

  host.addEventListener('dragover', () => host.classList.add('is-dragover'));

  host.addEventListener('drop', (e) => {
    host.classList.remove('is-dragover');
    const dt = e.dataTransfer;
    if (!dt || !view) return;
    e.preventDefault();

    const files = Array.from(dt.files ?? []);
    if (files.length === 0) return;

    // 图片：保存到资源目录后插入
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (images.length > 0) {
      for (const img of images) void handleImageFile(img, view);
      return;
    }

    // 非图片：交给主进程打开
    for (const f of files) {
      const path = window.hsm.fs.getPathForFile(f);
      if (!path) continue;
      if (extname(path) === '.md' || extname(path) === '.markdown' || extname(path) === '.txt' || extname(path) === '.mdx') {
        void openFileByPath(path);
      }
    }
  });
}

/* ==================================================================
 * 十三、导出
 * ================================================================== */

/**
 * 快速导出当前文档
 * @param format 目标格式
 */
async function quickExport(format: ExportFormat): Promise<void> {
  const tab = activeTab();
  if (!tab) {
    toast('请先打开一个文档', 'warning');
    return;
  }

  const content = tab.state.doc.toString();
  const baseName = tab.path ? stem(basename(tab.path)) : tab.name;
  const extMap: Record<string, string> = {
    html: 'html',
    'html-plain': 'html',
    pdf: 'pdf',
    png: 'png',
    docx: 'docx',
    latex: 'tex',
    epub: 'epub',
    rtf: 'rtf',
  };

  const outputPath = await window.hsm.exporter.pickOutputPath(format, `${baseName}.${extMap[format] ?? 'html'}`);
  if (!outputPath) return;

  toast('正在导出，请稍候…', 'info', 2000);

  try {
    const options = {
      format,
      docPath: tab.path ?? '',
      title: stem(tab.name),
      // Pandoc 类格式直接传原始 Markdown，效率更高且格式更准确
      html: format === 'docx' || format === 'latex' || format === 'epub' || format === 'rtf'
        ? content
        : await buildExportHtml(content, tab.path ?? ''),
      theme: String(state.settings['appearance.theme'] ?? 'github'),
    };

    const result = await window.hsm.exporter.run(options, outputPath);

    if (result.ok) {
      toast(`导出成功：${basename(outputPath)}（${formatSize(result.fileSize ?? 0)}）`, 'success', 3200);
    } else {
      toast(result.error ?? '导出失败', 'error', 5000);
    }
  } catch (e) {
    toast(`导出失败：${(e as Error).message}`, 'error', 5000);
  }
}

/**
 * 生成用于导出的 HTML 正文
 * 会把 Mermaid 图表预渲染为 SVG 后内联，保证导出文件与编辑器所见一致。
 *
 * @param content Markdown 源码
 * @param docPath 文档路径（解析图片相对路径）
 */
async function buildExportHtml(content: string, docPath: string): Promise<string> {
  const rendered = renderDocument(md, content, { docPath, forExport: true });
  let html = rendered.html;

  // 把 Mermaid 占位符替换为已渲染的 SVG
  const re = /<div class="hsm-mermaid" data-mermaid="([^"]*)"><\/div>/g;
  const matches = [...html.matchAll(re)];
  for (const m of matches) {
    let code = '';
    try {
      code = decodeURIComponent(m[1]);
    } catch {
      code = '';
    }
    if (!code) continue;
    const svgHtml = await renderMermaid(code);
    html = html.replace(m[0], svgHtml);
  }

  // 前置 Front Matter 用折叠块展示
  if (rendered.frontMatter) {
    html =
      `<div class="hsm-front-matter"><div class="hsm-front-matter-title">文档属性</div>` +
      `<pre>${esc(rendered.frontMatter)}</pre></div>\n` +
      html;
  }

  return html;
}

/* ==================================================================
 * 十四、快速打开与会话
 * ================================================================== */

/** 收集工作区中的全部 Markdown 文件 */
function collectFiles(): Array<{ name: string; path: string; rel: string }> {
  const out: Array<{ name: string; path: string; rel: string }> = [];
  const root = state.workspace?.root ?? '';

  const walk = (node: FileNode | undefined): void => {
    if (!node?.children) return;
    for (const child of node.children) {
      if (child.type === 'folder') {
        walk(child);
      } else if (child.isMarkdown) {
        out.push({
          name: child.name,
          path: child.path,
          rel: root && child.path.startsWith(root) ? child.path.slice(root.length + 1) : child.path,
        });
      }
    }
  };

  if (state.workspace) walk(state.workspace.tree);

  // 工作区中的文件不够时，补充最近打开的文件
  if (out.length < 200) {
    for (const r of state.recent) {
      if (!out.some((o) => o.path === r.path)) {
        out.push({ name: basename(r.path), path: r.path, rel: r.path });
      }
    }
  }

  return out;
}

/** 打开快速打开面板 */
async function quickOpen(): Promise<void> {
  // 若工作区目录树数据较旧，先刷新一次
  if (state.workspace) {
    try {
      const tree = await window.hsm.fs.readTree(state.workspace.root, 5);
      state.workspace.tree = tree;
    } catch {
      /* 刷新失败则使用缓存 */
    }
  }
  openQuickOpen(collectFiles(), (path) => void openFileByPath(path));
}

/** 打开搜索结果 */
async function openSearchHit(hit: { docPath: string; line: number }): Promise<void> {
  await openFileByPath(hit.docPath);
  window.setTimeout(() => {
    if (view) scrollToLine(view, hit.line);
  }, 250);
}

/** 保存当前会话（标签页与工作区） */
async function saveSession(): Promise<void> {
  try {
    const payload = {
      workspace: state.workspace?.root ?? null,
      tabs: state.tabs.map((t) => ({ path: t.path, name: t.name })),
      activeIndex: state.tabs.findIndex((t) => t.id === state.activeTabId),
    };
    await window.hsm.session.set('lastSession', JSON.stringify(payload));
  } catch {
    /* 会话保存失败不影响使用 */
  }
}

/** 恢复上次会话 */
async function restoreSession(): Promise<void> {
  if (!getSetting<boolean>('general.restoreSession', true)) return;

  try {
    const raw = await window.hsm.session.get('lastSession');
    if (!raw) return;

    const data = JSON.parse(raw) as {
      workspace: string | null;
      tabs: Array<{ path: string | null; name: string }>;
      activeIndex: number;
    };

    if (data.workspace) {
      const info = await window.hsm.fs.openFolderByPath(data.workspace);
      if (info) setWorkspace(info);
    }

    for (const t of data.tabs ?? []) {
      if (!t.path) continue;
      if (await window.hsm.fs.exists(t.path)) {
        await openFileByPath(t.path, false);
      }
    }

    const idx = data.activeIndex ?? 0;
    if (idx >= 0 && idx < state.tabs.length) switchToTab(state.tabs[idx].id);
  } catch (e) {
    console.warn('恢复会话失败', e);
  }
}

/* ==================================================================
 * 十五、窗口与全局事件
 * ================================================================== */

/** 绑定窗口控制按钮与关闭拦截 */
function bindWindowEvents(): void {
  const isMac = /Mac/i.test(navigator.platform || navigator.userAgent);
  if (isMac) {
    byId('window-controls').classList.add('is-hidden');
  }

  byId('win-min').addEventListener('click', () => void window.hsm.win.minimize());
  byId('win-max').addEventListener('click', () => void window.hsm.win.toggleMaximize());
  byId('win-close').addEventListener('click', () => void window.hsm.win.close());

  byId('tb-btn-sidebar').addEventListener('click', () => toggleSidebar());
  byId('tb-btn-source').addEventListener('click', () => void runCommand('view.toggleSource'));

  // 侧边栏 Tab 上的状态栏按钮
  byId('st-outline-toggle').addEventListener('click', () => showPanel('outline'));

  // 主进程请求关闭窗口：检查未保存内容
  window.hsm.win.onCloseRequest(() => {
    void (async () => {
      // 先保存会话，便于下次恢复
      await saveSession();

      for (const tab of state.tabs) {
        const current = activeTab();
        if (current && view) current.state = view.state;

        if (isDirty(tab) && getSetting<boolean>('general.confirmOnExit', true)) {
          const choice = await window.hsm.dialog.confirmUnsaved(tab.name);
          if (choice === 'cancel') return;
          if (choice === 'save') {
            const ok = await saveTab(tab);
            if (!ok) return;
          }
        }
      }
      await window.hsm.win.confirmClose();
    })();
  });

  // 最大化状态变化
  window.hsm.win.onMaximizeChange((maximized) => {
    byId('win-max').title = maximized ? '还原' : '最大化';
  });

  void window.hsm.win.isMaximized().then((m) => {
    byId('win-max').title = m ? '还原' : '最大化';
  });

  // 外部请求打开文件
  window.hsm.app.onOpenFileRequest((path) => {
    void openFileByPath(path);
  });

  // 原生菜单命令（macOS）
  window.hsm.app.onCommand(({ commandId }) => {
    void runCommand(commandId);
  });

  // 文件被外部修改
  window.hsm.fs.onFileChanged((path) => {
    const tab = findTabByPath(path);
    if (!tab) return;
    if (!getSetting<boolean>('editor.watchExternalChange', true)) return;

    void window.hsm.dialog
      .message('question', '文件已被外部修改', `「${tab.name}」在其它程序中发生了变化，是否重新载入？`, [
        '重新载入',
        '保留当前内容',
      ])
      .then(async (choice) => {
        if (choice !== 0) return;
        const file = await window.hsm.fs.readFile(path);
        if (!view) return;
        const wasActive = tab.id === state.activeTabId;
        tab.state = newState(file.content);
        markSaved(tab, file.content);
        if (wasActive) view.setState(tab.state);
        renderTabs();
        updateStatusbar();
        toast('已重新载入最新内容', 'success');
      });
  });

  // 窗口尺寸变化时更新响应式状态
  window.addEventListener('resize', () => {
    document.body.classList.toggle('is-narrow', window.innerWidth < 900);
  });

  // 系统明暗模式变化
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (String(state.settings['appearance.colorMode']) === 'system') applyColorMode();
  });

  // 退出前保存会话
  window.addEventListener('beforeunload', () => {
    try {
      void saveSession();
    } catch {
      /* 忽略 */
    }
  });
}

/** 绑定全局快捷键 */
function bindGlobalShortcuts(): void {
  document.addEventListener('keydown', (e) => {
    // 已经被 CodeMirror 或其它组件处理的按键不再重复处理
    if (e.defaultPrevented) return;
    if (e.isComposing) return;

    // Esc 优先关闭浮层
    if (e.key === 'Escape') {
      if (hasModalOpen()) {
        e.preventDefault();
        closeTopModal();
        return;
      }
      if (!byId('findbar').hidden) {
        e.preventDefault();
        closeFindBar();
        return;
      }
    }

    const commandId = resolveCommand(e);
    if (!commandId) return;

    e.preventDefault();
    e.stopPropagation();
    void runCommand(commandId);
  });
}

/** 监听会影响外观的设置变化 */
function setupAppearanceWatchers(): void {
  on('settings-changed', (payload) => {
    const p = payload as { key?: string } | undefined;
    if (p?.key === 'appearance.theme' || p?.key === 'appearance.codeTheme') {
      // 主题变化后 Mermaid 图表需要按新配色重绘
      clearMermaidCache();
      applyDocumentTheme();
    }
    updateStatusbar();
  });

  // 系统主题变化时重绘图表
  on('theme-changed', () => clearMermaidCache());

  // 用户修改快捷键后，立即重建编辑器内部的快捷键表
  on('shortcuts-changed', () => {
    if (view) {
      reconfigureKeymap(view);
      toast('快捷键已更新', 'success', 1500);
    }
  });
}

/** 根据是否有打开的文档切换欢迎页与编辑区 */
function updateWorkspaceVisibility(): void {
  const hasTab = state.tabs.length > 0;
  byId('welcome').classList.toggle('is-hidden', hasTab);
  byId('editor-scroll').classList.toggle('is-hidden', !hasTab);
  byId('tabs').classList.toggle('is-hidden', !hasTab);

  // 没有文档时禁用工具栏按钮
  for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>('.toolbtn'))) {
    b.disabled = !hasTab;
  }
}

/* ==================================================================
 * 十六、调试与自动化接口
 * ------------------------------------------------------------------
 * 暴露一组受控的内部句柄，供开发者工具与自动化测试使用。
 * 这些接口只读取/操作编辑器本身，不具备任何文件系统或系统级能力，
 * 因此不会扩大安全面。
 * ================================================================== */

interface HsmDebugApi {
  /** 获取编辑器视图实例 */
  getView: () => EditorView | null;
  /** 获取当前文档内容 */
  getContent: () => string;
  /** 设置当前文档内容 */
  setContent: (text: string) => void;
  /** 执行命令 */
  run: (commandId: string) => Promise<boolean>;
  /** 读取应用状态快照 */
  snapshot: () => Record<string, unknown>;
  /** 等待指定毫秒 */
  wait: (ms: number) => Promise<void>;
  /** 当前渲染出的 Markdown 装饰统计（用于验证实时渲染是否生效） */
  decorationStats: () => Record<string, number>;
}

/** 安装调试接口 */
function installDebugApi(): void {
  const api: HsmDebugApi = {
    getView: () => view,
    getContent: () => (view ? view.state.doc.toString() : ''),
    setContent: (text: string) => {
      if (!view) return;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        // 同时把选区收缩到文末：否则替换全文时旧选区会被映射成"全选"，
        // 导致实时渲染把整篇文档都当作"光标所在元素"而全部显示源码。
        selection: { anchor: text.length },
      });
    },
    run: (commandId: string) => runCommand(commandId),
    snapshot: () => ({
      tabs: state.tabs.length,
      activeTab: activeTab()?.name ?? null,
      workspace: state.workspace?.root ?? null,
      sourceMode: isSourceMode(),
      theme: state.settings['appearance.theme'],
      colorMode: state.settings['appearance.colorMode'],
      sidebarVisible: state.sidebarVisible,
      sidebarPanel: state.sidebarPanel,
      headings: headings.length,
      version: window.__APP_VERSION__,
    }),
    wait: (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms)),
    decorationStats: () => {
      const host = document.querySelector('#editor-inner');
      const out: Record<string, number> = {};
      if (!host) return out;
      /** 统计某个选择器在编辑区内出现的次数 */
      const count = (sel: string): number => host.querySelectorAll(sel).length;
      out['加粗'] = count('.hsm-strong');
      out['斜体'] = count('.hsm-em');
      out['行内代码'] = count('.hsm-code');
      out['标题行'] = count('[class*="hsm-line-h"]');
      out['引用行'] = count('.hsm-line-quote');
      out['代码块'] = count('.hsm-codeblock');
      out['表格'] = count('.hsm-table-widget');
      out['公式'] = count('.katex');
      out['图片'] = count('.hsm-image-widget');
      out['分割线'] = count('.hsm-hr-widget');
      out['图表'] = count('.hsm-mermaid-host');
      out['列表圆点'] = count('.hsm-bullet-widget');
      out['复选框'] = count('.hsm-task-checkbox');
      out['隐藏语法标记'] = count('.hsm-hidden');
      return out;
    },
  };

  (window as unknown as { __HSM__: HsmDebugApi }).__HSM__ = api;
}

/* ==================================================================
 * 十七、启动应用
 * ================================================================== */

// 订阅标签变化以刷新标签栏
on('tabs-changed', () => renderTabs());
on('dirty-changed', () => {
  renderTabs();
  refreshWindowTitle();
  updateStatusbar();
});

void bootstrap();
