/**
 * 花生苗 Markdown 编辑器 —— 侧边栏
 * ------------------------------------------------------------------
 * 包含三个可切换的面板：
 *   · 文件树：展示工作区目录结构，支持展开/折叠与右键菜单
 *   · 大纲：实时展示文档标题层级，点击可跳转
 *   · 全局搜索：基于 SQLite FTS5 的跨文件全文检索
 * 另外还负责"最近打开文件"列表与侧边栏宽度拖拽。
 *
 * 作者：何飞    联系方式：微信 6731663
 * 开源协议：MIT
 */

import { byId, clear, contextMenu, debounce, el, esc, formatTime, toast } from '../core/ui-kit';
import { emit, on, state, type SidebarPanel } from '../core/store';
import { basename, dirname, stem } from '../../shared/path-utils';
import type { FileNode, RecentFile, SearchHit } from '../../shared/types';
import { scrollToLine } from '../editor/editor';
import type { HeadingInfo } from '../editor/markdown';

/** 侧边栏对外回调 */
export interface SidebarCallbacks {
  /** 打开某个文件 */
  openFile: (path: string) => void;
  /** 新建文件后打开 */
  onTreeChanged: () => void;
  /** 点击大纲项，跳转到指定行 */
  jumpToLine: (line: number) => void;
  /** 打开搜索结果 */
  openSearchHit: (hit: SearchHit) => void;
}

/** 回调集合 */
let cb: SidebarCallbacks;

/** 文件树中已展开的目录路径集合 */
const expandedDirs = new Set<string>();

/** 当前选中的文件路径（用于高亮） */
let selectedPath = '';

/** 当前大纲标题列表 */
let currentHeadings: HeadingInfo[] = [];

/** 当前激活的大纲条目索引 */
let activeHeadingIndex = -1;

/* ==================================================================
 * 一、初始化
 * ================================================================== */

/**
 * 初始化侧边栏
 * @param callbacks 外部回调
 */
export function initSidebar(callbacks: SidebarCallbacks): void {
  cb = callbacks;

  // 顶部面板切换
  for (const tab of Array.from(document.querySelectorAll<HTMLButtonElement>('.sidebar__tab'))) {
    tab.addEventListener('click', () => {
      const panel = tab.dataset.panel as SidebarPanel | undefined;
      if (panel) showPanel(panel);
    });
  }

  // 文件树工具按钮
  byId<HTMLButtonElement>('btn-open-folder').addEventListener('click', () => {
    void openWorkspace();
  });

  byId<HTMLButtonElement>('btn-new-file').addEventListener('click', () => {
    void createNewFile();
  });

  byId<HTMLButtonElement>('btn-refresh-tree').addEventListener('click', () => {
    void refreshTree();
  });

  byId<HTMLButtonElement>('btn-refresh-outline').addEventListener('click', () => {
    renderOutline(currentHeadings);
  });

  byId<HTMLButtonElement>('btn-clear-recent').addEventListener('click', () => {
    void (async () => {
      await window.hsm.recent.clear();
      state.recent = [];
      renderRecent();
      toast('已清空最近打开记录', 'success');
    })();
  });

  // 全局搜索
  const searchInput = byId<HTMLInputElement>('search-input');
  searchInput.addEventListener(
    'input',
    debounce(() => {
      void runSearch(searchInput.value);
    }, 260),
  );
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void runSearch(searchInput.value);
  });

  // 侧边栏宽度拖拽
  initResizer();

  // 响应状态变化
  on('workspace-changed', () => {
    renderFileTree();
  });
  on('headings-changed', (payload) => {
    renderOutline((payload as HeadingInfo[]) ?? []);
  });
  on('active-tab-changed', () => {
    const tab = state.tabs.find((t) => t.id === state.activeTabId);
    selectedPath = tab?.path ?? '';
    renderFileTree();
    void refreshRecent();
    if (state.sidebarPanel === 'outline') renderOutline(currentHeadings);
  });
  on('settings-changed', (payload) => {
    const p = payload as { key?: string } | undefined;
    if (p?.key === 'appearance.sidebarWidth') {
      const w = Number(state.settings['appearance.sidebarWidth'] ?? 240);
      document.documentElement.style.setProperty('--sidebar-width', `${w}px`);
    }
  });

  renderFileTree();
  void refreshRecent();
}

/* ==================================================================
 * 二、面板与显示控制
 * ================================================================== */

/**
 * 切换侧边栏面板
 * @param panel 目标面板
 */
export function showPanel(panel: SidebarPanel): void {
  state.sidebarPanel = panel;

  for (const tab of Array.from(document.querySelectorAll<HTMLButtonElement>('.sidebar__tab'))) {
    tab.classList.toggle('is-active', tab.dataset.panel === panel);
  }
  for (const p of Array.from(document.querySelectorAll<HTMLElement>('.panel'))) {
    p.classList.toggle('is-active', p.dataset.panel === panel);
  }

  // 打开侧边栏（若当前是收起状态）
  if (!state.sidebarVisible) setSidebarVisible(true);

  if (panel === 'outline') renderOutline(currentHeadings);
  if (panel === 'search') byId<HTMLInputElement>('search-input').focus();
  emit('sidebar-changed', panel);
}

/**
 * 显示或隐藏侧边栏
 * @param visible 是否可见
 */
export function setSidebarVisible(visible: boolean): void {
  state.sidebarVisible = visible;
  const app = byId('app');
  const sidebar = byId('sidebar');
  const resizer = byId('sidebar-resizer');

  app.classList.toggle('is-sidebar-hidden', !visible);
  sidebar.classList.toggle('is-hidden', !visible);
  resizer.classList.toggle('is-hidden', !visible);
  emit('sidebar-changed', visible);
}

/** 切换侧边栏显示状态 */
export function toggleSidebar(): void {
  setSidebarVisible(!state.sidebarVisible);
}

/* ==================================================================
 * 三、文件树
 * ================================================================== */

/** 打开文件夹作为工作区 */
export async function openWorkspace(): Promise<void> {
  const info = await window.hsm.fs.openFolder();
  if (!info) return;
  setWorkspace(info);
}

/**
 * 设置当前工作区
 * @param info 工作区信息
 */
export function setWorkspace(info: { root: string; name: string; tree: FileNode } | null): void {
  state.workspace = info as typeof state.workspace;
  expandedDirs.clear();
  if (info) expandedDirs.add(info.root);
  renderFileTree();
  emit('workspace-changed', info);
}

/** 重新读取工作区目录树 */
export async function refreshTree(): Promise<void> {
  if (!state.workspace) return;
  const tree = await window.hsm.fs.readTree(state.workspace.root, 4);
  state.workspace.tree = tree;
  renderFileTree();
}

/** 渲染文件树 */
export function renderFileTree(): void {
  const host = byId('filetree');
  clear(host);

  const nameEl = byId('workspace-name');
  if (!state.workspace) {
    nameEl.textContent = '未打开工作区';
    host.appendChild(
      el(
        'div',
        { class: 'empty-hint' },
        el('div', { text: '尚未打开文件夹' }),
        el('button', {
          class: 'btn btn--sm',
          text: '打开文件夹',
          style: { marginTop: '12px' },
          onclick: () => void openWorkspace(),
        }),
      ),
    );
    return;
  }

  nameEl.textContent = state.workspace.name;
  nameEl.title = state.workspace.root;

  host.appendChild(buildTreeLevel(state.workspace.tree, 0));
}

/**
 * 递归构建一层目录树 DOM
 * @param node 节点
 * @param depth 层级深度（用于缩进）
 */
function buildTreeLevel(node: FileNode, depth: number): HTMLElement {
  const frag = document.createDocumentFragment();

  for (const child of node.children ?? []) {
    frag.appendChild(buildTreeItem(child, depth));
  }

  const wrap = el('div', { class: 'tree-level' });
  wrap.appendChild(frag);
  return wrap;
}

/** 构建单个树节点 */
function buildTreeItem(node: FileNode, depth: number): HTMLElement {
  const isDir = node.type === 'folder';
  const expanded = isDir && expandedDirs.has(node.path);
  const isSelected = !isDir && node.path === selectedPath;

  const row = el(
    'div',
    {
      class: `tree-item${isSelected ? ' is-selected' : ''}${node.isMarkdown ? ' is-markdown' : ''}`,
      style: { paddingLeft: `${6 + depth * 14}px` },
      title: node.path,
      role: 'treeitem',
    },
    // 展开箭头
    el('span', {
      class: `tree-item__toggle${isDir ? '' : ' is-leaf'}${expanded ? ' is-open' : ''}`,
      text: isDir ? '▶' : '',
    }),
    el('span', { class: 'tree-item__icon', text: isDir ? (expanded ? '📂' : '📁') : iconForFile(node.name) }),
    el('span', { class: 'tree-item__name', text: node.name }),
  );

  // 点击：文件夹展开/折叠，文件打开
  row.addEventListener('click', () => {
    if (isDir) {
      if (expandedDirs.has(node.path)) expandedDirs.delete(node.path);
      else expandedDirs.add(node.path);
      renderFileTree();
    } else {
      selectedPath = node.path;
      renderFileTree();
      cb.openFile(node.path);
    }
  });

  // 右键菜单
  row.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showTreeContextMenu(e.clientX, e.clientY, node);
  });

  const container = el('div', { class: 'tree-node' });
  container.appendChild(row);

  if (isDir && expanded) {
    container.appendChild(buildTreeLevel(node, depth + 1));
  }

  return container;
}

/** 根据扩展名返回文件图标 */
function iconForFile(name: string): string {
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '';
  switch (ext) {
    case '.md':
    case '.markdown':
    case '.mdx':
    case '.mdown':
      return '📄';
    case '.txt':
      return '📃';
    case '.png':
    case '.jpg':
    case '.jpeg':
    case '.gif':
    case '.webp':
    case '.svg':
    case '.bmp':
      return '🖼';
    case '.json':
    case '.yml':
    case '.yaml':
    case '.toml':
      return '⚙';
    default:
      return '📎';
  }
}

/** 文件树右键菜单 */
function showTreeContextMenu(x: number, y: number, node: FileNode): void {
  const isDir = node.type === 'folder';
  const dir = isDir ? node.path : dirname(node.path);

  contextMenu(x, y, [
    {
      label: '打开',
      disabled: isDir,
      onClick: () => {
        selectedPath = node.path;
        renderFileTree();
        cb.openFile(node.path);
      },
    },
    { separator: true },
    { label: '新建文件…', onClick: () => void createNewFile(dir) },
    { label: '新建文件夹…', onClick: () => void createNewFolder(dir) },
    { separator: true },
    {
      label: '重命名…',
      onClick: () => void renameEntry(node.path),
    },
    {
      label: '删除（移入回收站）',
      onClick: () => void deleteEntry(node.path, node.name),
    },
    { separator: true },
    { label: '在文件管理器中显示', onClick: () => void window.hsm.fs.showInFolder(node.path) },
    {
      label: '复制完整路径',
      onClick: () => {
        void navigator.clipboard.writeText(node.path);
        toast('路径已复制到剪贴板', 'success');
      },
    },
    {
      label: '以此为工作区打开',
      disabled: !isDir,
      onClick: () => void window.hsm.fs.openFolderByPath(node.path).then((info) => setWorkspace(info)),
    },
  ]);
}

/** 新建文件 */
async function createNewFile(dir?: string): Promise<void> {
  const targetDir = dir ?? state.workspace?.root;
  if (!targetDir) {
    toast('请先打开一个文件夹作为工作区', 'warning');
    return;
  }

  // 延迟导入，避免与 overlays 形成循环依赖
  const { promptDialog } = await import('../core/ui-kit');
  const name = await promptDialog('新建文件', '未命名.md', '请输入文件名');
  if (!name) return;

  const result = await window.hsm.fs.createFile(targetDir, name);
  if (!result.ok || !result.path) {
    toast(`新建文件失败：${result.error ?? '未知错误'}`, 'error');
    return;
  }
  expandedDirs.add(targetDir);
  await refreshTree();
  selectedPath = result.path;
  renderFileTree();
  cb.openFile(result.path);
  toast(`已创建 ${basename(result.path)}`, 'success');
}

/** 新建文件夹 */
async function createNewFolder(dir: string): Promise<void> {
  const { promptDialog } = await import('../core/ui-kit');
  const name = await promptDialog('新建文件夹', '新建文件夹', '请输入文件夹名');
  if (!name) return;

  const result = await window.hsm.fs.createFolder(dir, name);
  if (!result.ok) {
    toast(`新建文件夹失败：${result.error ?? '未知错误'}`, 'error');
    return;
  }
  expandedDirs.add(dir);
  await refreshTree();
  toast('文件夹已创建', 'success');
}

/** 重命名 */
async function renameEntry(target: string): Promise<void> {
  const { promptDialog } = await import('../core/ui-kit');
  const old = basename(target);
  const name = await promptDialog('重命名', old, '请输入新名称');
  if (!name || name === old) return;

  const result = await window.hsm.fs.rename(target, name);
  if (!result.ok) {
    toast(`重命名失败：${result.error ?? '未知错误'}`, 'error');
    return;
  }
  cb.onTreeChanged();
  await refreshTree();
  toast('重命名成功', 'success');
}

/** 删除（移入回收站） */
async function deleteEntry(target: string, name: string): Promise<void> {
  const choice = await window.hsm.dialog.message(
    'question',
    '确认删除',
    `确定要把「${name}」移入回收站吗？`,
    ['删除', '取消'],
  );
  if (choice !== 0) return;

  const result = await window.hsm.fs.remove(target);
  if (!result.ok) {
    toast(`删除失败：${result.error ?? '未知错误'}`, 'error');
    return;
  }
  if (selectedPath === target) selectedPath = '';
  await refreshTree();
  cb.onTreeChanged();
  toast('已移入回收站', 'success');
}

/* ==================================================================
 * 四、最近文件
 * ================================================================== */

/** 刷新最近文件列表 */
export async function refreshRecent(): Promise<void> {
  try {
    state.recent = await window.hsm.recent.list();
  } catch {
    state.recent = [];
  }
  renderRecent();
}

/** 渲染最近文件列表 */
function renderRecent(): void {
  const host = byId('recent-list');
  clear(host);

  if (state.recent.length === 0) {
    host.appendChild(el('div', { class: 'empty-hint', text: '暂无记录' }));
    return;
  }

  for (const item of state.recent.slice(0, 12)) {
    const node = el(
      'div',
      {
        class: `recent-item${item.exists === false ? ' is-missing' : ''}`,
        title: item.path,
      },
      el('span', { class: 'recent-item__icon', text: '📄' }),
      el(
        'span',
        { class: 'recent-item__body' },
        el('span', { class: 'recent-item__title', text: item.title || stem(basename(item.path)) }),
        el('span', { class: 'recent-item__path', text: compactPath(item.path) }),
      ),
      el('span', { class: 'recent-item__time', text: formatTime(item.openedAt) }),
    );

    node.addEventListener('click', () => {
      if (item.exists === false) {
        toast('该文件已不存在，可能已被移动或删除', 'warning');
        return;
      }
      cb.openFile(item.path);
    });

    node.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      contextMenu(e.clientX, e.clientY, [
        { label: '打开', disabled: item.exists === false, onClick: () => cb.openFile(item.path) },
        { label: '在文件管理器中显示', onClick: () => void window.hsm.fs.showInFolder(item.path) },
        { separator: true },
        {
          label: '从列表中移除',
          onClick: () => {
            void window.hsm.recent.remove(item.path).then(() => refreshRecent());
          },
        },
      ]);
    });

    host.appendChild(node);
  }
}

/** 把长路径压缩显示：保留末尾两级 */
function compactPath(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  if (parts.length <= 2) return p;
  return '…/' + parts.slice(-2).join('/');
}

/* ==================================================================
 * 五、大纲
 * ================================================================== */

/**
 * 渲染大纲
 * @param headings 标题列表
 */
export function renderOutline(headings: HeadingInfo[]): void {
  currentHeadings = headings;
  const host = byId('outline');
  clear(host);

  if (!headings || headings.length === 0) {
    host.appendChild(el('div', { class: 'empty-hint', text: '当前文档没有标题' }));
    return;
  }

  headings.forEach((h, index) => {
    const item = el('div', {
      class: `outline-item outline-item--h${h.level}`,
      title: h.text,
      text: h.text,
    });

    item.addEventListener('click', () => {
      activeHeadingIndex = index;
      highlightOutlineItem(index);
      cb.jumpToLine(h.line);
    });

    host.appendChild(item);
  });

  highlightOutlineItem(activeHeadingIndex);
}

/** 高亮指定的大纲条目 */
function highlightOutlineItem(index: number): void {
  const items = Array.from(document.querySelectorAll<HTMLElement>('.outline-item'));
  items.forEach((item, i) => item.classList.toggle('is-active', i === index));
}

/**
 * 根据当前光标行更新大纲高亮
 * @param line 光标所在行（从 0 开始）
 */
export function syncOutlineWithCursor(line: number): void {
  if (!currentHeadings.length) return;

  let index = -1;
  for (let i = 0; i < currentHeadings.length; i += 1) {
    if (currentHeadings[i].line <= line) index = i;
    else break;
  }

  if (index !== activeHeadingIndex) {
    activeHeadingIndex = index;
    highlightOutlineItem(index);

    // 让当前大纲条目滚动到可见区域
    const active = document.querySelectorAll<HTMLElement>('.outline-item')[index];
    active?.scrollIntoView({ block: 'nearest' });
  }
}

/* ==================================================================
 * 六、全局搜索
 * ================================================================== */

/** 执行一次全局搜索 */
async function runSearch(keyword: string): Promise<void> {
  const host = byId('search-results');
  clear(host);

  const kw = keyword.trim();
  if (!kw) {
    host.appendChild(el('div', { class: 'empty-hint', text: '输入关键词开始搜索' }));
    return;
  }

  // 需要时先重建工作区索引
  if (byId<HTMLInputElement>('search-rebuild').checked) {
    if (!state.workspace) {
      toast('请先打开一个文件夹作为工作区', 'warning');
    } else {
      host.appendChild(el('div', { class: 'empty-hint', text: '正在建立索引…' }));
      try {
        await window.hsm.search.rebuild(state.workspace.root);
      } catch {
        toast('建立索引失败', 'error');
      }
      clear(host);
    }
  }

  host.appendChild(el('div', { class: 'empty-hint', text: '搜索中…' }));

  let hits: SearchHit[] = [];
  try {
    hits = await window.hsm.search.query(kw, 80);
  } catch {
    toast('搜索失败', 'error');
  }

  clear(host);

  if (hits.length === 0) {
    host.appendChild(
      el(
        'div',
        { class: 'empty-hint' },
        el('div', { text: '没有找到匹配内容' }),
        el('div', {
          class: 'empty-hint__sub',
          text: '提示：若刚打开工作区，请勾选"同时重建工作区索引"后重试',
        }),
      ),
    );
    return;
  }

  // 按文件分组展示
  const groups = new Map<string, SearchHit[]>();
  for (const hit of hits) {
    const arr = groups.get(hit.docPath) ?? [];
    arr.push(hit);
    groups.set(hit.docPath, arr);
  }

  host.appendChild(el('div', { class: 'searchresults__count', text: `共 ${hits.length} 处匹配，分布在 ${groups.size} 个文件` }));

  for (const [docPath, list] of groups) {
    const group = el(
      'div',
      { class: 'searchgroup' },
      el(
        'div',
        { class: 'searchgroup__head', title: docPath },
        el('span', { class: 'searchgroup__icon', text: '📄' }),
        el('span', { class: 'searchgroup__name', text: list[0].title || stem(basename(docPath)) }),
        el('span', { class: 'searchgroup__count', text: String(list.length) }),
      ),
    );

    for (const hit of list) {
      const item = el(
        'div',
        { class: 'searchhit', title: `${docPath}:${hit.line}` },
        el('span', { class: 'searchhit__line', text: String(hit.line) }),
        // 片段由主进程生成，已做 HTML 转义，仅 <mark> 为高亮标签
        el('span', { class: 'searchhit__snippet', html: hit.snippet }),
      );
      item.addEventListener('click', () => cb.openSearchHit(hit));
      group.appendChild(item);
    }

    host.appendChild(group);
  }
  void esc;
}

/* ==================================================================
 * 七、侧边栏宽度拖拽
 * ================================================================== */

/** 初始化宽度拖拽把手 */
function initResizer(): void {
  const resizer = byId('sidebar-resizer');
  const sidebar = byId('sidebar');

  let dragging = false;

  resizer.addEventListener('mousedown', (e) => {
    dragging = true;
    resizer.classList.add('is-dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const width = Math.max(180, Math.min(480, e.clientX - sidebar.getBoundingClientRect().left));
    document.documentElement.style.setProperty('--sidebar-width', `${width}px`);
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove('is-dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    // 拖拽结束后把宽度写回设置持久化
    const width = Math.round(sidebar.getBoundingClientRect().width);
    void import('../core/store').then(({ setSetting }) => setSetting('appearance.sidebarWidth', width));
  });
}

/* ==================================================================
 * 八、对外辅助
 * ================================================================== */

/** 设置文件树中高亮的文件 */
export function setSelectedPath(path: string): void {
  selectedPath = path;
  renderFileTree();
}

/** 在编辑器中跳转到指定行（大纲点击） */
export function jumpToLine(line: number): void {
  if (!state.view) return;
  scrollToLine(state.view, line + 1);
  cb.jumpToLine(line);
}

/** 获取当前大纲标题 */
export function getHeadings(): HeadingInfo[] {
  return currentHeadings;
}
