/**
 * 花生苗 Markdown 编辑器 —— 最近文件服务
 * ------------------------------------------------------------------
 * 记录用户最近打开过的文件，支持去重、计数、限额裁剪与清空。
 * 数据保存在 SQLite 的 recent_files 表。
 *
 * 作者：何飞    联系方式：微信 6731663
 * 开源协议：MIT
 */

import fs from 'node:fs';
import path from 'node:path';
import { all, run } from './database';
import { getSetting } from './settings';
import type { RecentFile } from '../../shared/types';

/** recent_files 表的一行 */
interface RecentRow {
  file_path: string;
  title: string | null;
  opened_at: string | null;
  open_count: number | null;
}

/**
 * 读取最近文件列表
 * @returns 按最近打开时间倒序排列，并标注文件当前是否仍然存在
 */
export function listRecent(): RecentFile[] {
  const rows = all<RecentRow>(
    'SELECT file_path, title, opened_at, open_count FROM recent_files ORDER BY opened_at DESC',
  );

  return rows.map((r) => ({
    path: r.file_path,
    title: r.title || path.basename(r.file_path, path.extname(r.file_path)),
    openedAt: r.opened_at ?? '',
    openCount: r.open_count ?? 1,
    // 文件可能已被移动或删除，界面上需要区别显示
    exists: safeExists(r.file_path),
  }));
}

/** 判断文件是否存在且是文件（不抛异常） */
function safeExists(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * 记录一次文件打开
 * @param filePath 文件绝对路径
 */
export function addRecent(filePath: string): void {
  if (!filePath || !path.isAbsolute(filePath)) return;
  const title = path.basename(filePath, path.extname(filePath));

  run(
    `INSERT INTO recent_files (file_path, title, opened_at, open_count)
     VALUES (?, ?, CURRENT_TIMESTAMP, 1)
     ON CONFLICT(file_path) DO UPDATE SET opened_at = CURRENT_TIMESTAMP,
                                          title = excluded.title,
                                          open_count = open_count + 1`,
    filePath,
    title,
  );

  pruneRecent();
}

/** 按设置中的限额裁剪最近文件列表 */
function pruneRecent(): void {
  const limit = getSetting<number>('general.recentLimit', 30);
  run(
    `DELETE FROM recent_files WHERE id NOT IN (
        SELECT id FROM recent_files ORDER BY opened_at DESC LIMIT ?
     )`,
    limit,
  );
}

/**
 * 从最近列表中移除某个文件
 * @param filePath 文件绝对路径
 */
export function removeRecent(filePath: string): void {
  run('DELETE FROM recent_files WHERE file_path = ?', filePath);
}

/** 清空最近文件列表 */
export function clearRecent(): void {
  run('DELETE FROM recent_files');
}

/**
 * 清理最近列表中已经不存在于磁盘的记录
 * @returns 被清理的条目数量
 */
export function pruneMissingRecent(): number {
  const rows = all<{ file_path: string }>('SELECT file_path FROM recent_files');
  let removed = 0;
  for (const r of rows) {
    if (!safeExists(r.file_path)) {
      run('DELETE FROM recent_files WHERE file_path = ?', r.file_path);
      removed += 1;
    }
  }
  return removed;
}
