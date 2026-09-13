/**
 * 花生苗 Markdown 编辑器 —— 窗口管理
 * ------------------------------------------------------------------
 * 负责创建主窗口、管理多窗口、记忆窗口位置与尺寸。
 *
 * 界面采用"自绘标题栏"方案（frame: false）：
 *   · Windows / Linux：由渲染进程绘制最小化 / 最大化 / 关闭按钮；
 *   · macOS：使用 titleBarStyle: 'hiddenInset'，保留系统红黄绿交通灯。
 * 为保证窗口仍可拖拽缩放，Windows 下保留 thickFrame 的缩放边框。
 *
 * 作者：何飞    联系方式：微信 6731663
 * 开源协议：MIT
 */

import { BrowserWindow, screen, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { getSetting, setSetting } from './services/settings';
import { logError, logInfo } from './services/logger';

/** 当前已打开的全部窗口 */
const windows = new Set<BrowserWindow>();

/** 默认窗口尺寸 */
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 820;
/** 最小窗口尺寸，低于此尺寸界面元素会重叠 */
const MIN_WIDTH = 760;
const MIN_HEIGHT = 480;

/** 判断当前是否 macOS */
export function isMac(): boolean {
  return process.platform === 'darwin';
}

/**
 * 计算新窗口的初始位置与尺寸
 * 会读取上次保存的窗口状态，并确保窗口落在可见屏幕范围内。
 */
function resolveWindowBounds(): { x?: number; y?: number; width: number; height: number } {
  // 注意：window.* 属于"内部状态"而非用户可配置项，不在 SETTING_DEFS 中，
  //       因此数据库取回的是字符串，必须显式用 Number() 转换后再校验。
  let width = toFiniteNumber(getSetting<number>('window.width', DEFAULT_WIDTH), DEFAULT_WIDTH);
  let height = toFiniteNumber(getSetting<number>('window.height', DEFAULT_HEIGHT), DEFAULT_HEIGHT);
  let x = toFiniteNumber(getSetting<number>('window.x', -1), -1);
  let y = toFiniteNumber(getSetting<number>('window.y', -1), -1);

  // 尺寸合法性兜底
  if (width < MIN_WIDTH) width = DEFAULT_WIDTH;
  if (height < MIN_HEIGHT) height = DEFAULT_HEIGHT;

  // 检查坐标是否落在某块屏幕内（用户可能拔掉了外接显示器）
  if (Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0) {
    const displays = screen.getAllDisplays();
    const visible = displays.some((d) => {
      const b = d.workArea;
      return x >= b.x - 50 && y >= b.y - 50 && x < b.x + b.width && y < b.y + b.height;
    });
    if (!visible) {
      x = -1;
      y = -1;
    }
  } else {
    x = -1;
    y = -1;
  }

  const bounds: { x?: number; y?: number; width: number; height: number } = { width, height };
  if (x >= 0 && y >= 0) {
    bounds.x = x;
    bounds.y = y;
  }
  return bounds;
}

/**
 * 把任意值安全地转换为有限数字
 * @param value 原始值（可能是字符串）
 * @param fallback 无法转换时的兜底值
 */
function toFiniteNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** 保存窗口状态（位置与尺寸），用于下次启动恢复 */
function saveWindowState(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  try {
    // 全屏或最大化时不记录尺寸，避免下次启动得到一个占满屏幕的窗口
    if (win.isMaximized() || win.isFullScreen()) return;
    const b = win.getBounds();
    setSetting('window.width', b.width);
    setSetting('window.height', b.height);
    setSetting('window.x', b.x);
    setSetting('window.y', b.y);
  } catch (e) {
    logError('保存窗口状态失败', e);
  }
}

/**
 * 创建主窗口
 * @param openFile 启动时要打开的文件路径（可选）
 */
export function createMainWindow(openFile?: string): BrowserWindow {
  const bounds = resolveWindowBounds();
  const maximized = getSetting<boolean>('window.maximized', false);

  const win = new BrowserWindow({
    ...bounds,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
    // 自绘标题栏：Windows / Linux 完全无边框，macOS 只保留交通灯
    frame: isMac(),
    titleBarStyle: isMac() ? 'hiddenInset' : 'default',
    // 保留 Windows 的缩放边框，无边框窗口依然可以从边缘拖拽改变大小
    thickFrame: true,
    backgroundColor: '#ffffff',
    title: '花生苗 Markdown 编辑器',
    // 应用图标（打包时由 electron-builder 注入，这里用于开发期窗口图标）
    icon: resolveIconPath(),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true,
      // 允许在编辑器内使用 web 组件（Mermaid 渲染需要）
      webgl: false,
      backgroundThrottling: false,
      // 离屏渲染开关：供无图形界面的 CI / 服务器环境自动截图使用。
      // 普通用户运行时不设置该环境变量，界面渲染方式不受影响。
      offscreen: process.env.HSM_OFFSCREEN === '1',
    },
  });

  // 把文件路径通过 URL hash 传给渲染进程，由渲染进程自行决定如何打开
  const indexPath = path.join(__dirname, '../renderer/index.html');
  const query: Record<string, string> = {};
  if (openFile) query.file = openFile;
  void win.loadFile(indexPath, { query });

  win.once('ready-to-show', () => {
    if (maximized) win.maximize();
    win.show();
    logInfo('主窗口已显示');
  });

  // 拦截窗口关闭：先询问渲染进程是否有未保存内容
  let allowClose = false;
  win.on('close', (e) => {
    if (allowClose) return;
    e.preventDefault();
    win.webContents.send('win:close-request');
  });

  /** 允许窗口真正关闭（渲染进程确认后调用） */
  (win as BrowserWindow & { hsmConfirmClose?: () => void }).hsmConfirmClose = () => {
    allowClose = true;
    saveWindowState(win);
    win.close();
  };

  // 记录窗口状态变化
  let saveTimer: NodeJS.Timeout | null = null;
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveWindowState(win), 600);
  };
  win.on('resize', scheduleSave);
  win.on('move', scheduleSave);
  win.on('maximize', () => {
    setSetting('window.maximized', true);
    win.webContents.send('win:maximize-changed', true);
  });
  win.on('unmaximize', () => {
    setSetting('window.maximized', false);
    win.webContents.send('win:maximize-changed', false);
  });
  win.on('enter-full-screen', () => win.webContents.send('win:fullscreen-changed', true));
  win.on('leave-full-screen', () => win.webContents.send('win:fullscreen-changed', false));

  win.on('closed', () => {
    windows.delete(win);
  });

  // 安全策略：所有新窗口请求一律拒绝，外部链接交给系统浏览器
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => undefined);
    return { action: 'deny' };
  });

  // 阻止页面被导航到外部地址（防止意外跳转）
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://') && !url.startsWith('devtools://')) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => undefined);
    }
  });

  // 渲染进程崩溃时记录日志，便于排查
  win.webContents.on('render-process-gone', (_e, details) => {
    logError(`渲染进程异常退出：${details.reason}（exitCode=${details.exitCode}）`);
  });

  windows.add(win);
  return win;
}

/** 解析应用图标路径（开发期用 PNG，打包后用 exe/icns 内嵌图标） */
function resolveIconPath(): string | undefined {
  const candidates = [
    path.join(__dirname, '../resources/icon.png'),
    path.join(__dirname, '../../resources/icon.png'),
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* 路径不可访问时继续尝试下一个候选 */
    }
  }
  return undefined;
}

/** 获取当前聚焦的窗口；没有则返回第一个窗口 */
export function getFocusedWindow(): BrowserWindow | null {
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && !focused.isDestroyed()) return focused;
  for (const w of windows) if (!w.isDestroyed()) return w;
  return null;
}

/** 获取全部窗口 */
export function getAllWindows(): BrowserWindow[] {
  return [...windows].filter((w) => !w.isDestroyed());
}
