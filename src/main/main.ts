/**
 * 花生苗 Markdown 编辑器 —— 主进程入口
 * ------------------------------------------------------------------
 * 职责：
 *   1. 应用生命周期管理（单实例、二次启动、退出清理）；
 *   2. 初始化数据库、日志、菜单与 IPC 接口；
 *   3. 创建主窗口，并处理来自命令行 / 文件关联的打开请求。
 *
 * 作者：何飞    联系方式：微信 6731663
 * 开源协议：MIT
 */

import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { createMainWindow, getFocusedWindow, getAllWindows } from './window';
import { installApplicationMenu } from './menu';
import { registerIpcHandlers, broadcastCommand } from './ipc';
import { closeDatabase, initDatabase } from './services/database';
import { installGlobalErrorHandlers, logError, logInfo } from './services/logger';
import { unwatchAll } from './services/files';
import { pruneMissingRecent } from './services/recent';

/* ------------------------------------------------------------------
 * 应用基础配置（必须在 app ready 之前设置）
 * ------------------------------------------------------------------ */

// 应用名会影响 userData 目录位置，必须最早设置
app.setName('花生苗Markdown编辑器');

// Windows 任务栏图标分组标识
if (process.platform === 'win32') {
  app.setAppUserModelId('com.huashengmiao.markdown');
}

// 关闭 Chromium 的沙箱警告刷屏（打包后仍保留沙箱能力）
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox');
}

// 提升高分屏下的渲染质量
app.commandLine.appendSwitch('high-dpi-support', '1');
app.commandLine.appendSwitch('force-device-scale-factor', '1');

/* ------------------------------------------------------------------
 * 单实例控制：第二次启动时把参数交给已有实例，避免打开多个进程
 * ------------------------------------------------------------------ */

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  // 已有实例在运行：本进程直接退出
  logInfo('检测到已有实例在运行，本次启动退出');
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    // 聚焦已有窗口，并把命令行里的文件路径交给渲染进程打开
    const win = getFocusedWindow() ?? getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
    const file = extractFileFromArgv(argv);
    if (file && win) win.webContents.send('app:open-file-request', file);
  });

  bootstrap();
}

/**
 * 从命令行参数中提取要打开的文件路径
 * @param argv 命令行参数数组
 */
function extractFileFromArgv(argv: string[]): string | null {
  // 跳过可执行文件本身与各类开关参数
  for (let i = 1; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a || a.startsWith('-')) continue;
    // 开发模式下第一个参数是项目目录，需要跳过
    if (path.resolve(a) === path.resolve(app.getAppPath())) continue;
    try {
      if (fs.statSync(a).isFile()) return path.resolve(a);
    } catch {
      /* 不是有效文件则继续 */
    }
  }
  return null;
}

/**
 * 应用主流程
 */
function bootstrap(): void {
  // 全局异常捕获：任何未处理异常都写入日志，便于用户反馈
  installGlobalErrorHandlers();

  app.whenReady().then(() => {
    logInfo('========================================');
    logInfo(`花生苗 Markdown 编辑器 启动中…`);
    logInfo(`版本：${app.getVersion()} | Electron：${process.versions.electron} | Node：${process.versions.node}`);
    logInfo(`平台：${process.platform} ${process.arch}`);

    // 1) 初始化数据库
    const dbOk = initDatabase();
    logInfo(dbOk ? '本地数据库就绪' : '本地数据库不可用，已降级运行');

    // 2) 清理最近文件中已不存在的记录
    try {
      pruneMissingRecent();
    } catch (e) {
      logError('清理最近文件记录失败', e);
    }

    // 3) 注册 IPC 接口
    registerIpcHandlers();

    // 4) 安装应用菜单（macOS 原生菜单；其他平台不显示菜单栏）
    installApplicationMenu((commandId, payload) => broadcastCommand(commandId, payload));

    // 5) 创建主窗口
    const startFile = extractFileFromArgv(process.argv) ?? undefined;
    createMainWindow(startFile);

    // macOS：点击 Dock 图标且没有窗口时重新创建
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });

  /* ------------------------- macOS 文件关联 ------------------------- */
  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    const win = getFocusedWindow() ?? getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
      win.webContents.send('app:open-file-request', filePath);
    } else {
      app.whenReady().then(() => createMainWindow(filePath));
    }
  });

  /* ------------------------- 退出处理 ------------------------- */
  // 除 macOS 外，关闭所有窗口即退出应用
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    logInfo('应用正在退出，开始清理资源…');
    try {
      unwatchAll();
    } catch (e) {
      logError('取消文件监视失败', e);
    }
    try {
      closeDatabase();
    } catch (e) {
      logError('关闭数据库失败', e);
    }
  });

  /* ------------------------- 安全策略 ------------------------- */
  // 拒绝一切权限请求（摄像头、麦克风、地理位置等），本软件无需这些能力
  app.on('web-contents-created', (_event, contents) => {
    contents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  });

  // 禁止创建额外的 webview
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });

  logInfo('主进程初始化完成');
}
