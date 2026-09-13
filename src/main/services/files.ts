/**
 * 花生苗 Markdown 编辑器 —— 文件系统服务
 * ------------------------------------------------------------------
 * 封装所有与磁盘交互的操作：读写文件、目录树、增删改名、
 * 编码与换行符识别、外部修改监视等。
 *
 * 编码策略：优先 UTF-8（含 BOM）；若检测到非法 UTF-8 序列，
 * 则回退用 GBK 解码，保证 Windows 上遗留的中文文档也能正确打开。
 *
 * 作者：何飞    联系方式：微信 6731663
 * 开源协议：MIT
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { BrowserWindow } from 'electron';
import type { FileNode, OpenedFile } from '../../shared/types';
import { logError, logInfo } from './logger';

/** 识别为 Markdown 的扩展名 */
const MARKDOWN_EXTS = new Set(['.md', '.markdown', '.mdx', '.txt', '.mdown', '.mkd']);

/** 目录树中默认忽略的文件夹 */
const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '.idea',
  '.vscode',
  '$RECYCLE.BIN',
  'System Volume Information',
]);

/** 目录树中忽略的文件名 */
const IGNORED_FILES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);

/** 文件监视器集合：路径 -> FSWatcher */
const watchers = new Map<string, fs.FSWatcher>();

/** 判断是否为 Markdown 文件 */
export function isMarkdownFile(p: string): boolean {
  return MARKDOWN_EXTS.has(path.extname(p).toLowerCase());
}

/**
 * 读取文本文件，自动识别 BOM、换行符与编码
 * @param filePath 文件绝对路径
 * @returns 文件内容与元信息；失败抛出异常
 */
export async function readTextFile(filePath: string): Promise<OpenedFile> {
  const buf = await fsp.readFile(filePath);

  // 1) BOM 检测
  let hasBom = false;
  let body = buf;
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    hasBom = true;
    body = buf.subarray(3);
  }

  // 2) 编码判定：先尝试严格 UTF-8 解码，失败则回退 GBK
  let content: string;
  let encoding = hasBom ? 'UTF-8 BOM' : 'UTF-8';
  const strict = new TextDecoder('utf-8', { fatal: true });
  try {
    content = strict.decode(body);
  } catch {
    try {
      content = new TextDecoder('gbk').decode(body);
      encoding = 'GBK';
      logInfo(`检测到非 UTF-8 编码，已按 GBK 读取：${filePath}`);
    } catch {
      // 极端情况：按有损 UTF-8 解码，保证内容能打开
      content = new TextDecoder('utf-8', { fatal: false }).decode(body);
      encoding = 'UTF-8（有损）';
    }
  }

  // 3) 换行符识别：CRLF 占多数则判定为 Windows 换行
  const crlf = (content.match(/\r\n/g) || []).length;
  const lf = (content.match(/(?<!\r)\n/g) || []).length;
  const eol: 'LF' | 'CRLF' = crlf > lf ? 'CRLF' : 'LF';

  const stat = await fsp.stat(filePath);

  return {
    path: filePath,
    content,
    encoding,
    eol,
    size: stat.size,
    mtime: stat.mtimeMs,
  };
}

/**
 * 写入文本文件（自动创建父目录）
 * @param filePath 文件绝对路径
 * @param content 文件内容
 */
export async function writeTextFile(
  filePath: string,
  content: string,
): Promise<{ ok: boolean; mtime: number; error?: string }> {
  try {
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    // 保留原文件的换行风格：如果原文件是 CRLF，则写回时也转成 CRLF
    let out = content;
    try {
      const old = await fsp.readFile(filePath, 'utf8');
      const crlfOld = (old.match(/\r\n/g) || []).length;
      const lfOld = (old.match(/(?<!\r)\n/g) || []).length;
      if (crlfOld > lfOld) out = content.replace(/\r?\n/g, '\r\n');
    } catch {
      /* 新文件无需处理 */
    }
    await fsp.writeFile(filePath, out, 'utf8');
    const stat = await fsp.stat(filePath);
    return { ok: true, mtime: stat.mtimeMs };
  } catch (e) {
    logError(`写入文件失败：${filePath}`, e);
    return { ok: false, mtime: 0, error: (e as Error).message };
  }
}

/**
 * 递归读取目录树
 * @param root 根目录
 * @param depth 递归深度，0 表示不展开子目录
 * @returns 目录树根节点
 */
export async function readTree(root: string, depth = 4): Promise<FileNode> {
  return buildNode(root, depth, true);
}

/** 构建单个目录树节点 */
async function buildNode(target: string, depth: number, isRoot: boolean): Promise<FileNode> {
  const name = path.basename(target) || target;

  let stat: fs.Stats;
  try {
    stat = await fsp.stat(target);
  } catch {
    return { name, path: target, type: 'file', children: undefined, isMarkdown: isMarkdownFile(target) };
  }

  if (!stat.isDirectory()) {
    return {
      name,
      path: target,
      type: 'file',
      size: stat.size,
      mtime: stat.mtimeMs,
      isMarkdown: isMarkdownFile(target),
    };
  }

  const node: FileNode = { name, path: target, type: 'folder', children: [], mtime: stat.mtimeMs };
  if (depth <= 0) return node;

  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(target, { withFileTypes: true });
  } catch (e) {
    logError(`读取目录失败：${target}`, e);
    return node;
  }

  // 排序规则：文件夹在前，同类按名称的本地化顺序
  const dirs: string[] = [];
  const files: string[] = [];
  for (const e of entries) {
    if (IGNORED_FILES.has(e.name)) continue;
    if (e.isDirectory()) {
      if (IGNORED_DIRS.has(e.name)) continue;
      if (e.name.startsWith('.')) continue;
      dirs.push(e.name);
    } else if (e.isFile()) {
      files.push(e.name);
    }
  }
  dirs.sort((a, b) => a.localeCompare(b, 'zh-CN'));
  files.sort((a, b) => {
    // Markdown 文件排在前面，其余按名称排序
    const am = isMarkdownFile(a) ? 0 : 1;
    const bm = isMarkdownFile(b) ? 0 : 1;
    if (am !== bm) return am - bm;
    return a.localeCompare(b, 'zh-CN');
  });

  const children: FileNode[] = [];
  // 限制单层节点数量，避免超大目录把界面拖死
  const MAX_CHILDREN = 2000;
  for (const d of dirs.slice(0, MAX_CHILDREN)) {
    children.push(await buildNode(path.join(target, d), depth - 1, false));
  }
  for (const f of files.slice(0, MAX_CHILDREN)) {
    children.push(await buildNode(path.join(target, f), depth - 1, false));
  }

  node.children = children;
  void isRoot;
  return node;
}

/**
 * 新建文件
 * @param dir 所在目录
 * @param name 文件名
 * @returns 新建文件的绝对路径
 */
export async function createFile(dir: string, name: string): Promise<{ ok: boolean; path?: string; error?: string }> {
  try {
    // 若用户没写扩展名，自动补 .md
    let fileName = name.trim();
    if (!fileName) return { ok: false, error: '文件名不能为空' };
    if (!path.extname(fileName)) fileName += '.md';

    const target = path.join(dir, fileName);

    // 若已存在，自动追加序号，避免覆盖用户文件
    const finalPath = await uniquePath(target);
    await fsp.writeFile(finalPath, '', { encoding: 'utf8', flag: 'wx' });
    return { ok: true, path: finalPath };
  } catch (e) {
    logError(`新建文件失败：${dir}/${name}`, e);
    return { ok: false, error: describeFsError(e) };
  }
}

/**
 * 新建文件夹
 * @param dir 父目录
 * @param name 文件夹名
 */
export async function createFolder(dir: string, name: string): Promise<{ ok: boolean; path?: string; error?: string }> {
  try {
    const folderName = name.trim();
    if (!folderName) return { ok: false, error: '文件夹名不能为空' };
    const target = await uniquePath(path.join(dir, folderName));
    await fsp.mkdir(target, { recursive: false });
    return { ok: true, path: target };
  } catch (e) {
    logError(`新建文件夹失败：${dir}/${name}`, e);
    return { ok: false, error: describeFsError(e) };
  }
}

/**
 * 重命名（同目录内）
 * @param oldPath 原路径
 * @param newName 新名称（不含目录）
 */
export async function renameEntry(oldPath: string, newName: string): Promise<{ ok: boolean; path?: string; error?: string }> {
  try {
    const trimmed = newName.trim();
    if (!trimmed) return { ok: false, error: '名称不能为空' };
    if (/[\\/:*?"<>|]/.test(trimmed)) return { ok: false, error: '名称中不能包含 \\ / : * ? " < > | 等字符' };

    const target = path.join(path.dirname(oldPath), trimmed);
    if (target === oldPath) return { ok: true, path: oldPath };
    if (fs.existsSync(target)) return { ok: false, error: '同名文件或文件夹已存在' };

    await fsp.rename(oldPath, target);

    // 重命名会失效已注册的文件监视，需要重新注册
    if (watchers.has(oldPath)) {
      unwatchFile(oldPath);
      watchFile(target);
    }
    return { ok: true, path: target };
  } catch (e) {
    logError(`重命名失败：${oldPath} -> ${newName}`, e);
    return { ok: false, error: describeFsError(e) };
  }
}

/**
 * 移动文件或文件夹到指定目录
 * @param from 源路径
 * @param toDir 目标目录
 */
export async function moveEntry(from: string, toDir: string): Promise<{ ok: boolean; path?: string; error?: string }> {
  try {
    const target = await uniquePath(path.join(toDir, path.basename(from)));
    await fsp.rename(from, target);
    if (watchers.has(from)) {
      unwatchFile(from);
      watchFile(target);
    }
    return { ok: true, path: target };
  } catch (e) {
    // 跨磁盘分区时 rename 会失败，降级为"复制 + 删除"
    try {
      await fsp.cp(from, path.join(toDir, path.basename(from)), { recursive: true });
      await fsp.rm(from, { recursive: true, force: true });
      return { ok: true, path: path.join(toDir, path.basename(from)) };
    } catch (e2) {
      logError(`移动失败：${from} -> ${toDir}`, e2);
      return { ok: false, error: describeFsError(e2) };
    }
  }
}

/**
 * 删除文件或文件夹
 * 优先使用系统回收站（由 Electron shell.trashItem 处理），
 * 本函数提供的是物理删除的兜底实现，见 ipc 层的 trash 分支。
 *
 * @param target 目标路径
 */
export async function removeEntry(target: string): Promise<{ ok: boolean; error?: string }> {
  try {
    if (watchers.has(target)) unwatchFile(target);
    await fsp.rm(target, { recursive: true, force: true });
    return { ok: true };
  } catch (e) {
    logError(`删除失败：${target}`, e);
    return { ok: false, error: describeFsError(e) };
  }
}

/**
 * 生成不冲突的路径：若目标已存在，则在文件名后追加 (1)、(2)…
 * @param target 期望路径
 */
export async function uniquePath(target: string): Promise<string> {
  if (!fs.existsSync(target)) return target;

  const dir = path.dirname(target);
  const ext = path.extname(target);
  const base = path.basename(target, ext);

  for (let i = 1; i < 10000; i += 1) {
    const candidate = path.join(dir, `${base}(${i})${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
  return path.join(dir, `${base}-${Date.now()}${ext}`);
}

/** 把 Node 的文件系统错误翻译成中文提示 */
function describeFsError(e: unknown): string {
  const err = e as NodeJS.ErrnoException;
  switch (err.code) {
    case 'EACCES':
    case 'EPERM':
      return '没有权限访问该位置，请检查文件是否被占用或换个目录';
    case 'ENOENT':
      return '文件或目录不存在';
    case 'EEXIST':
      return '同名文件或文件夹已存在';
    case 'ENOSPC':
      return '磁盘空间不足';
    case 'EBUSY':
      return '文件被其它程序占用，请关闭后重试';
    case 'EISDIR':
      return '目标是一个目录';
    case 'ENOTDIR':
      return '目标不是目录';
    case 'EROFS':
      return '目标位于只读文件系统';
    default:
      return err.message || '未知错误';
  }
}

/**
 * 注册文件外部修改监视
 * @param filePath 文件绝对路径
 */
export function watchFile(filePath: string): void {
  if (watchers.has(filePath)) return;
  try {
    // 部分编辑器采用"删除后重建"的保存方式，这里同时监听 rename 事件
    const watcher = fs.watch(filePath, { persistent: false }, (eventType) => {
      if (eventType !== 'change' && eventType !== 'rename') return;
      broadcastFileChanged(filePath);
    });
    watcher.on('error', () => unwatchFile(filePath));
    watchers.set(filePath, watcher);
  } catch (e) {
    logError(`注册文件监视失败：${filePath}`, e);
  }
}

/**
 * 取消文件外部修改监视
 * @param filePath 文件绝对路径
 */
export function unwatchFile(filePath: string): void {
  const w = watchers.get(filePath);
  if (!w) return;
  try {
    w.close();
  } catch {
    /* 忽略 */
  }
  watchers.delete(filePath);
}

/** 关闭全部监视器（退出时调用） */
export function unwatchAll(): void {
  for (const p of [...watchers.keys()]) unwatchFile(p);
}

/**
 * 向所有窗口广播"文件被外部修改"事件
 * @param filePath 被修改的文件路径
 */
function broadcastFileChanged(filePath: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('fs:file-changed', filePath);
  }
}
