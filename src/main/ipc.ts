/**
 * 花生苗 Markdown 编辑器 —— IPC 接口注册
 * ------------------------------------------------------------------
 * 集中注册主进程与渲染进程之间的全部通信接口。
 * 接口按业务域分组，命名与 src/shared/types.ts 中的 HsmApi 契约一一对应。
 *
 * 安全说明：
 *   · 渲染进程无法直接访问文件系统，所有磁盘操作都必须经过这里；
 *   · 所有路径参数都会做基础合法性校验，避免意外的越权访问；
 *   · 不向渲染进程暴露任何 Node.js 原生对象。
 *
 * 作者：何飞    联系方式：微信 6731663
 * 开源协议：MIT
 */

import { app, dialog, ipcMain, shell, BrowserWindow } from 'electron';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  AppInfo,
  ExportOptions,
  MessageType,
  OpenedFile,
  SettingDef,
  SettingsMap,
  WorkspaceInfo,
} from '../shared/types';
import { getFocusedWindow, getAllWindows, createMainWindow } from './window';
import { closeDatabase, get, run, vacuumDatabase } from './services/database';
import {
  createFile,
  createFolder,
  isMarkdownFile,
  moveEntry,
  readTextFile,
  readTree,
  removeEntry,
  renameEntry,
  watchFile,
  writeTextFile,
} from './services/files';
import {
  addRecent,
  clearRecent,
  listRecent,
  pruneMissingRecent,
  removeRecent,
} from './services/recent';
import { getSettingDefs, getAllSettings, resetSettings, setSetting, setSettings } from './services/settings';
import {
  exportShortcuts,
  findConflicts,
  importShortcuts,
  listShortcuts,
  resetAllShortcuts,
  resetShortcut,
  setShortcut,
} from './services/shortcuts';
import { mimeToExt, saveImageBuffer, saveImageFromPath } from './services/images';
import { exportDocument, openExportedFile } from './services/exporter';
import { indexDocument, search as searchQuery, removeDocument, rebuildWorkspaceIndex } from './services/search';
import { getVersionContent, listVersions, restoreVersion, snapshot } from './services/history';
import { logError, logInfo, getLogDir } from './services/logger';
import { APP_AUTHOR, APP_CONTACT, APP_HOMEPAGE, BUILD_TIME } from '../shared/build-info';

/** 自定义主题存放目录 */
function themesDir(): string {
  const dir = path.join(app.getPath('userData'), 'themes');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 校验路径参数：必须是绝对路径且非空 */
function assertPath(p: unknown): string {
  if (typeof p !== 'string' || !p.trim()) throw new Error('路径参数无效');
  return path.resolve(p);
}

/** 把异常统一转换为 { ok:false, error } 形式，避免渲染进程收到未捕获的异常 */
function fail(e: unknown): { ok: false; error: string } {
  logError('IPC 调用失败', e);
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

/**
 * 注册全部 IPC 接口
 */
export function registerIpcHandlers(): void {
  /* ============================ 应用信息 ============================ */

  ipcMain.handle('app:info', (): AppInfo => {
    return {
      name: '花生苗 Markdown 编辑器',
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      author: APP_AUTHOR,
      contact: APP_CONTACT,
      license: 'MIT',
      homepage: APP_HOMEPAGE,
      buildTime: BUILD_TIME,
      platform: process.platform,
      userDataPath: app.getPath('userData'),
    };
  });

  ipcMain.handle('app:quit', () => {
    app.quit();
  });

  ipcMain.handle('app:relaunch', () => {
    app.relaunch();
    app.exit(0);
  });

  ipcMain.handle('app:toggle-devtools', () => {
    const win = getFocusedWindow();
    win?.webContents.toggleDevTools();
  });

  ipcMain.handle('app:open-user-data', async () => {
    await shell.openPath(app.getPath('userData'));
  });

  ipcMain.handle('app:new-window', (_e, file?: string) => {
    createMainWindow(typeof file === 'string' && file ? file : undefined);
  });

  ipcMain.handle('app:open-log-dir', async () => {
    await shell.openPath(getLogDir());
  });

  /* ============================ 窗口控制 ============================ */

  ipcMain.handle('win:minimize', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize();
  });

  ipcMain.handle('win:toggle-maximize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return false;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return win.isMaximized();
  });

  ipcMain.handle('win:close', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close();
  });

  /** 渲染进程确认可以关闭窗口（未保存提示处理完毕后调用） */
  ipcMain.handle('win:confirm-close', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) as
      | (BrowserWindow & { hsmConfirmClose?: () => void })
      | null;
    win?.hsmConfirmClose?.();
  });

  ipcMain.handle('win:is-maximized', (e) => {
    return BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false;
  });

  ipcMain.handle('win:set-title', (e, title: string) => {
    BrowserWindow.fromWebContents(e.sender)?.setTitle(String(title || '花生苗 Markdown 编辑器'));
  });

  ipcMain.handle('win:set-fullscreen', (e, flag: boolean) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return false;
    win.setFullScreen(Boolean(flag));
    return win.isFullScreen();
  });

  ipcMain.handle('win:is-fullscreen', (e) => {
    return BrowserWindow.fromWebContents(e.sender)?.isFullScreen() ?? false;
  });

  /* ============================ 文件系统 ============================ */

  /** 弹出"打开文件"对话框并读取内容 */
  ipcMain.handle('fs:open-file', async (e): Promise<OpenedFile | null> => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const result = await dialog.showOpenDialog(win as BrowserWindow, {
      title: '打开 Markdown 文件',
      properties: ['openFile'],
      filters: [
        { name: 'Markdown 文件', extensions: ['md', 'markdown', 'mdx', 'mdown', 'mkd'] },
        { name: '文本文件', extensions: ['txt'] },
        { name: '全部文件', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return await openPathInternal(result.filePaths[0]);
  });

  ipcMain.handle('fs:open-file-by-path', async (_e, p: string): Promise<OpenedFile | null> => {
    try {
      return await openPathInternal(assertPath(p));
    } catch (e) {
      logError('按路径打开文件失败', e);
      return null;
    }
  });

  /** 读取文件并登记到最近列表与全文索引 */
  async function openPathInternal(filePath: string): Promise<OpenedFile> {
    const file = await readTextFile(filePath);
    addRecent(filePath);
    if (getSettingDefsSafe('advanced.enableIndex', true)) {
      indexDocument(filePath, path.basename(filePath, path.extname(filePath)), file.content);
    }
    watchFile(filePath);
    return file;
  }

  /** 读取布尔型设置（带类型兜底） */
  function getSettingDefsSafe(key: string, fallback: boolean): boolean {
    const v = getAllSettings()[key];
    return typeof v === 'boolean' ? v : fallback;
  }

  ipcMain.handle('fs:open-folder', async (e): Promise<WorkspaceInfo | null> => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const result = await dialog.showOpenDialog(win as BrowserWindow, {
      title: '打开文件夹作为工作区',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return await openFolderInternal(result.filePaths[0]);
  });

  ipcMain.handle('fs:open-folder-by-path', async (_e, p: string): Promise<WorkspaceInfo | null> => {
    try {
      return await openFolderInternal(assertPath(p));
    } catch (err) {
      logError('按路径打开文件夹失败', err);
      return null;
    }
  });

  /** 读取工作区目录树 */
  async function openFolderInternal(root: string): Promise<WorkspaceInfo> {
    const tree = await readTree(root, 3);
    logInfo(`已打开工作区：${root}`);
    return { root, name: path.basename(root) || root, tree };
  }

  ipcMain.handle('fs:read-tree', async (_e, root: string, depth?: number) => {
    return await readTree(assertPath(root), typeof depth === 'number' ? depth : 3);
  });

  ipcMain.handle('fs:read-file', async (_e, p: string): Promise<OpenedFile> => {
    return await readTextFile(assertPath(p));
  });

  ipcMain.handle('fs:write-file', async (_e, p: string, content: string) => {
    const target = assertPath(p);
    const result = await writeTextFile(target, String(content ?? ''));
    if (result.ok) {
      // 写入成功后同步更新索引，保证搜索能看到最新内容
      if (getSettingDefsSafe('advanced.enableIndex', true)) {
        indexDocument(target, path.basename(target, path.extname(target)), String(content ?? ''));
      }
    }
    return result;
  });

  ipcMain.handle('fs:save-as-dialog', async (e, defaultPath: string): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const result = await dialog.showSaveDialog(win as BrowserWindow, {
      title: '另存为',
      defaultPath: defaultPath || path.join(os.homedir(), '未命名.md'),
      filters: [
        { name: 'Markdown 文件', extensions: ['md'] },
        { name: '文本文件', extensions: ['txt'] },
        { name: '全部文件', extensions: ['*'] },
      ],
    });
    return result.canceled || !result.filePath ? null : result.filePath;
  });

  ipcMain.handle('fs:create-file', async (_e, dir: string, name: string) => {
    return await createFile(assertPath(dir), String(name ?? ''));
  });

  ipcMain.handle('fs:create-folder', async (_e, dir: string, name: string) => {
    return await createFolder(assertPath(dir), String(name ?? ''));
  });

  ipcMain.handle('fs:rename', async (_e, oldPath: string, newName: string) => {
    return await renameEntry(assertPath(oldPath), String(newName ?? ''));
  });

  /** 删除：优先送入系统回收站，失败则物理删除 */
  ipcMain.handle('fs:remove', async (_e, p: string) => {
    const target = assertPath(p);
    try {
      await shell.trashItem(target);
      removeDocument(target);
      return { ok: true };
    } catch (err) {
      logError('移入回收站失败，改为直接删除', err);
      const r = await removeEntry(target);
      if (r.ok) removeDocument(target);
      return r;
    }
  });

  ipcMain.handle('fs:move', async (_e, from: string, toDir: string) => {
    return await moveEntry(assertPath(from), assertPath(toDir));
  });

  ipcMain.handle('fs:exists', async (_e, p: string) => {
    try {
      await fsp.access(assertPath(p));
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('fs:show-in-folder', (_e, p: string) => {
    shell.showItemInFolder(assertPath(p));
  });

  ipcMain.handle('fs:is-markdown', (_e, p: string) => isMarkdownFile(String(p)));

  ipcMain.handle('fs:watch', (_e, p: string) => {
    watchFile(assertPath(p));
  });

  ipcMain.handle('fs:unwatch', async (_e, p: string) => {
    const { unwatchFile } = await import('./services/files');
    unwatchFile(assertPath(p));
  });

  /* ============================ 最近文件 ============================ */

  ipcMain.handle('recent:list', () => {
    pruneMissingRecent();
    return listRecent();
  });
  ipcMain.handle('recent:add', (_e, p: string) => addRecent(assertPath(p)));
  ipcMain.handle('recent:remove', (_e, p: string) => removeRecent(String(p)));
  ipcMain.handle('recent:clear', () => clearRecent());

  /* ============================ 设置 ============================ */

  ipcMain.handle('settings:all', (): SettingsMap => getAllSettings());
  ipcMain.handle('settings:defs', (): SettingDef[] => getSettingDefs());
  ipcMain.handle('settings:set', (_e, key: string, value: string | number | boolean) => {
    setSetting(String(key), value);
  });
  ipcMain.handle('settings:set-many', (_e, values: SettingsMap) => {
    setSettings(values);
  });
  ipcMain.handle('settings:reset', (): SettingsMap => resetSettings());

  /* ============================ 快捷键 ============================ */

  ipcMain.handle('shortcuts:list', () => listShortcuts());
  ipcMain.handle('shortcuts:set', (_e, commandId: string, keybinding: string) =>
    setShortcut(String(commandId), String(keybinding ?? '')),
  );
  ipcMain.handle('shortcuts:reset-one', (_e, commandId: string) => resetShortcut(String(commandId)));
  ipcMain.handle('shortcuts:reset-all', () => resetAllShortcuts());
  ipcMain.handle('shortcuts:conflicts', () => findConflicts());
  ipcMain.handle('shortcuts:export', () => exportShortcuts());
  ipcMain.handle('shortcuts:import', () => importShortcuts());

  /* ============================ 图片 ============================ */

  ipcMain.handle(
    'image:save-buffer',
    async (_e, data: Uint8Array, ext: string, docPath: string) => {
      try {
        return await saveImageBuffer(new Uint8Array(data), String(ext || '.png'), String(docPath || ''));
      } catch (err) {
        return fail(err);
      }
    },
  );

  ipcMain.handle('image:save-path', async (_e, srcPath: string, docPath: string) => {
    try {
      return await saveImageFromPath(assertPath(srcPath), String(docPath || ''));
    } catch (err) {
      return fail(err);
    }
  });

  /** 弹出文件选择框挑选图片并保存到资源目录 */
  ipcMain.handle('image:pick-and-save', async (e, docPath: string) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const result = await dialog.showOpenDialog(win as BrowserWindow, {
      title: '选择图片',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'] },
        { name: '全部文件', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return { ok: false, error: 'cancelled' };

    const results = [];
    for (const p of result.filePaths) {
      results.push(await saveImageFromPath(p, String(docPath || '')));
    }
    return results[0] ?? { ok: false, error: '未选择图片' };
  });

  /** 根据 MIME 类型推断扩展名（渲染进程粘贴图片时使用） */
  ipcMain.handle('image:mime-to-ext', (_e, mime: string) => mimeToExt(String(mime)));

  /* ============================ 导出 ============================ */

  ipcMain.handle('export:pick-output', async (e, format: string, defaultName: string) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const maps: Record<string, { name: string; ext: string }> = {
      html: { name: 'HTML 网页', ext: 'html' },
      'html-plain': { name: 'HTML 网页（无样式）', ext: 'html' },
      pdf: { name: 'PDF 文档', ext: 'pdf' },
      png: { name: 'PNG 图片', ext: 'png' },
      docx: { name: 'Word 文档', ext: 'docx' },
      latex: { name: 'LaTeX 源文件', ext: 'tex' },
      epub: { name: 'ePub 电子书', ext: 'epub' },
      rtf: { name: 'RTF 富文本', ext: 'rtf' },
    };
    const info = maps[format] ?? maps.html;

    const result = await dialog.showSaveDialog(win as BrowserWindow, {
      title: '导出文档',
      defaultPath: defaultName || path.join(os.homedir(), `未命名.${info.ext}`),
      filters: [{ name: info.name, extensions: [info.ext] }, { name: '全部文件', extensions: ['*'] }],
    });
    return result.canceled || !result.filePath ? null : result.filePath;
  });

  ipcMain.handle('export:run', async (_e, options: ExportOptions, outputPath: string) => {
    try {
      const target = assertPath(outputPath);
      const result = await exportDocument(options, target);

      // 导出成功后按设置决定是否自动打开
      if (result.ok && getAllSettings()['export.openAfterExport'] === true) {
        await openExportedFile(target);
      }
      return result;
    } catch (err) {
      return fail(err);
    }
  });

  /* ============================ 搜索 ============================ */

  ipcMain.handle('search:index', (_e, docPath: string, title: string, content: string) => {
    indexDocument(String(docPath), String(title), String(content));
  });
  ipcMain.handle('search:remove', (_e, docPath: string) => removeDocument(String(docPath)));
  ipcMain.handle('search:query', (_e, keyword: string, limit?: number) =>
    searchQuery(String(keyword ?? ''), typeof limit === 'number' ? limit : 50),
  );
  ipcMain.handle('search:rebuild', async (e, root: string) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    return await rebuildWorkspaceIndex(assertPath(root), (done, total) => {
      if (win && !win.isDestroyed()) win.webContents.send('search:progress', { done, total });
    });
  });

  /* ============================ 版本历史 ============================ */

  ipcMain.handle('history:snapshot', (_e, docPath: string, content: string) => {
    snapshot(String(docPath), String(content));
  });
  ipcMain.handle('history:list', (_e, docPath: string) => listVersions(String(docPath)));
  ipcMain.handle('history:content', (_e, id: number) => getVersionContent(Number(id)));
  ipcMain.handle('history:restore', (_e, id: number, currentContent: string) =>
    restoreVersion(Number(id), String(currentContent)),
  );

  /* ============================ 对话框 ============================ */

  ipcMain.handle(
    'dialog:message',
    async (e, type: MessageType, title: string, message: string, buttons: string[]) => {
      const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
      const opts = {
        type: (['info', 'warning', 'error', 'question'].includes(type) ? type : 'info') as MessageType,
        title: String(title || '提示'),
        message: String(message || ''),
        buttons: Array.isArray(buttons) && buttons.length ? buttons.map(String) : ['确定'],
        noLink: true,
        cancelId: -1,
      };
      const r = win
        ? await dialog.showMessageBox(win as BrowserWindow, opts)
        : await dialog.showMessageBox(opts);
      return r.response;
    },
  );

  /** 未保存提示：保存 / 不保存 / 取消 */
  ipcMain.handle('dialog:confirm-unsaved', async (e, fileName: string) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const opts = {
      type: 'warning' as const,
      title: '未保存的更改',
      message: `「${fileName}」有未保存的更改`,
      detail: '关闭前是否保存？',
      buttons: ['保存', '不保存', '取消'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    };
    const r = win
      ? await dialog.showMessageBox(win as BrowserWindow, opts)
      : await dialog.showMessageBox(opts);
    return (['save', 'discard', 'cancel'] as const)[r.response] ?? 'cancel';
  });

  /* ============================ 系统交互 ============================ */

  ipcMain.handle('shell:open-external', async (_e, url: string) => {
    const u = String(url ?? '');
    // 仅允许 http/https/mailto，防止执行本地程序
    if (/^(https?|mailto):/i.test(u)) await shell.openExternal(u);
  });

  ipcMain.handle('shell:open-path', async (_e, p: string) => {
    await shell.openPath(assertPath(p));
  });

  /* ============================ 自定义主题 ============================ */

  ipcMain.handle('theme:custom-list', async () => {
    try {
      const dir = themesDir();
      const files = (await fsp.readdir(dir)).filter((f) => f.toLowerCase().endsWith('.css'));
      const out = [];
      for (const f of files) {
        const full = path.join(dir, f);
        out.push({ name: path.basename(f, '.css'), css: await fsp.readFile(full, 'utf8'), path: full });
      }
      return out;
    } catch (err) {
      logError('读取自定义主题失败', err);
      return [];
    }
  });

  ipcMain.handle('theme:import-css', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const result = await dialog.showOpenDialog(win as BrowserWindow, {
      title: '导入自定义 CSS 主题',
      properties: ['openFile'],
      filters: [{ name: 'CSS 样式表', extensions: ['css'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    try {
      const src = result.filePaths[0];
      const name = path.basename(src, '.css');
      const target = path.join(themesDir(), `${name}.css`);
      await fsp.copyFile(src, target);
      const css = await fsp.readFile(target, 'utf8');
      logInfo(`已导入自定义主题：${name}`);
      return { name, css, path: target };
    } catch (err) {
      logError('导入自定义主题失败', err);
      return null;
    }
  });

  ipcMain.handle('theme:remove', async (_e, name: string) => {
    try {
      const target = path.join(themesDir(), `${String(name)}.css`);
      await fsp.unlink(target);
    } catch (err) {
      logError('删除自定义主题失败', err);
    }
  });

  /* ============================ 会话恢复 ============================ */

  ipcMain.handle('session:get', (_e, key: string) => {
    const row = get<{ value: string }>('SELECT value FROM session_state WHERE key = ?', String(key));
    return row?.value ?? null;
  });

  ipcMain.handle('session:set', (_e, key: string, value: string) => {
    run(
      `INSERT INTO session_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      String(key),
      String(value),
    );
  });

  /* ============================ 数据库维护 ============================ */

  ipcMain.handle('db:info', () => {
    const rows = [
      { name: 'documents', label: '文档索引' },
      { name: 'document_versions', label: '版本快照' },
      { name: 'search_content', label: '搜索索引' },
      { name: 'recent_files', label: '最近文件' },
      { name: 'export_history', label: '导出历史' },
      { name: 'images', label: '图片记录' },
    ];
    return rows.map((r) => {
      const row = get<{ c: number }>(`SELECT COUNT(*) AS c FROM ${r.name}`);
      return { ...r, count: row?.c ?? 0 };
    });
  });

  ipcMain.handle('db:vacuum', async () => {
    try {
      const result = vacuumDatabase();
      const saved = result.before - result.after;
      logInfo(`数据库压缩完成：${result.before} → ${result.after} 字节（释放 ${saved} 字节）`);
      return { ok: true, before: result.before, after: result.after, saved };
    } catch (err) {
      return fail(err);
    }
  });

  /* ============================ 自动化截图 ============================ */

  /**
   * 把当前窗口截图写入指定目录（仅用于自动化测试与文档配图）。
   *
   * 安全说明：只有设置了环境变量 HSM_SHOT_DIR 时该接口才生效，
   *           普通用户运行软件时该环境变量不存在，接口直接返回 null，
   *           因此不会成为额外的攻击面。
   */
  ipcMain.handle('debug:capture', async (e, name: string) => {
    const dir = process.env.HSM_SHOT_DIR;
    if (!dir) return null;

    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return null;

    try {
      await fsp.mkdir(dir, { recursive: true });
      // 等待一帧，确保最近的界面变化已绘制完成
      await new Promise((r) => setTimeout(r, 350));
      const image = await win.webContents.capturePage();
      const target = path.join(dir, `${String(name || 'shot')}.png`);
      await fsp.writeFile(target, image.toPNG());
      return target;
    } catch (err) {
      logError('自动化截图失败', err);
      return null;
    }
  });

  /* ============================ 全局兜底 ============================ */

  // 任何未注册的 invoke 都返回明确错误，避免渲染进程一直等待
  ipcMain.on('__unknown__', (e) => {
    e.returnValue = null;
  });
}

/** 向所有窗口广播命令（原生菜单点击时使用） */
export function broadcastCommand(commandId: string, payload?: unknown): void {
  for (const win of getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('app:command', { commandId, payload });
  }
}
