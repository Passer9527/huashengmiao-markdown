/**
 * 花生苗 Markdown 编辑器 —— 版本历史服务
 * ------------------------------------------------------------------
 * 定期为文档生成本地快照，用户可以查看历史版本并一键恢复。
 * 快照存放在 SQLite 的 document_versions 表，按文档路径分组、版本号递增。
 *
 * 作者：何飞    联系方式：微信 6731663
 * 开源协议：MIT
 */

import crypto from 'node:crypto';
import { all, get, run } from './database';
import { getSetting } from './settings';
import type { VersionSummary } from '../../shared/types';
import { logError } from './logger';

/** document_versions 表的一行 */
interface VersionRow {
  id: number;
  doc_path: string;
  version_no: number;
  size_bytes: number | null;
  created_at: string | null;
  content_hash: string | null;
}

/**
 * 计算内容的 SHA-256 摘要
 * @param content 文本内容
 */
export function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * 为文档生成一次快照
 * 若与上一次快照内容完全相同则跳过，避免产生大量无意义记录。
 *
 * @param docPath 文档绝对路径
 * @param content 文档内容
 * @returns 是否真正写入了新快照
 */
export function snapshot(docPath: string, content: string): boolean {
  if (!docPath) return false;
  if (!getSetting<boolean>('advanced.historyEnabled', true)) return false;

  const hash = hashContent(content);

  // 与最近一条快照比较，内容未变则跳过
  const last = get<VersionRow>(
    'SELECT id, content_hash FROM document_versions WHERE doc_path = ? ORDER BY version_no DESC LIMIT 1',
    docPath,
  );
  if (last && last.content_hash === hash) return false;

  // 计算新版本号
  const maxRow = get<{ max_no: number | null }>(
    'SELECT MAX(version_no) AS max_no FROM document_versions WHERE doc_path = ?',
    docPath,
  );
  const nextNo = (maxRow?.max_no ?? 0) + 1;

  const ok = run(
    `INSERT INTO document_versions (document_id, doc_path, content, content_hash, version_no, size_bytes)
     VALUES (0, ?, ?, ?, ?, ?)`,
    docPath,
    content,
    hash,
    nextNo,
    Buffer.byteLength(content, 'utf8'),
  );
  if (!ok) {
    logError(`生成版本快照失败：${docPath}`);
    return false;
  }

  pruneVersions(docPath);
  return true;
}

/**
 * 裁剪某个文档的历史快照，只保留最近的 N 条
 * @param docPath 文档绝对路径
 */
function pruneVersions(docPath: string): void {
  const max = getSetting<number>('advanced.historyMax', 50);
  run(
    `DELETE FROM document_versions
     WHERE doc_path = ?
       AND id NOT IN (
         SELECT id FROM document_versions WHERE doc_path = ? ORDER BY version_no DESC LIMIT ?
       )`,
    docPath,
    docPath,
    max,
  );
}

/**
 * 查询某个文档的版本历史
 * @param docPath 文档绝对路径
 * @param limit 最多返回条数
 */
export function listVersions(docPath: string, limit = 50): VersionSummary[] {
  const rows = all<VersionRow>(
    `SELECT id, doc_path, version_no, size_bytes, created_at
     FROM document_versions
     WHERE doc_path = ?
     ORDER BY version_no DESC
     LIMIT ?`,
    docPath,
    limit,
  );

  return rows.map((r) => ({
    id: r.id,
    docPath: r.doc_path,
    versionNo: r.version_no,
    sizeBytes: r.size_bytes ?? 0,
    createdAt: r.created_at ?? '',
  }));
}

/**
 * 读取某个快照的完整内容
 * @param id 快照主键
 */
export function getVersionContent(id: number): string | null {
  const row = get<{ content: string }>('SELECT content FROM document_versions WHERE id = ?', id);
  return row?.content ?? null;
}

/**
 * 恢复某个快照：返回快照内容，由调用方写回文件，
 * 并在恢复前对当前内容再做一次快照，避免误操作丢失数据。
 *
 * @param id 快照主键
 * @param currentContent 文档当前内容
 * @returns 快照内容；失败返回 null
 */
export function restoreVersion(id: number, currentContent: string): string | null {
  const row = get<VersionRow>('SELECT id, doc_path, content_hash FROM document_versions WHERE id = ?', id);
  if (!row) return null;

  // 恢复前先给当前内容留个"后悔药"
  snapshot(row.doc_path, currentContent);

  const content = getVersionContent(id);
  return content;
}

/**
 * 清理某个文档的全部历史
 * @param docPath 文档绝对路径
 */
export function clearVersions(docPath: string): void {
  run('DELETE FROM document_versions WHERE doc_path = ?', docPath);
}
