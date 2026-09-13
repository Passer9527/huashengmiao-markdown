/**
 * 花生苗 Markdown 编辑器 —— 全文检索服务
 * ------------------------------------------------------------------
 * 为工作区文档建立索引，支持跨文件搜索。
 *
 * 检索策略（双通道，取并集）：
 *   1. FTS5 通道：对英文/数字等以空格分词的内容使用 SQLite 全文索引，速度快；
 *   2. LIKE 通道：FTS5 的 unicode61 分词对中文连写支持有限，
 *      因此额外保留原文用 LIKE 做子串匹配，保证中文搜索准确。
 * 命中结果统一在 JS 侧生成带高亮标记的片段。
 *
 * 作者：何飞    联系方式：微信 6731663
 * 开源协议：MIT
 */

import fs from 'node:fs';
import path from 'node:path';
import { all, run } from './database';
import { getSetting } from './settings';
import type { SearchHit } from '../../shared/types';
import { logError } from './logger';

/** search_content 表的一行 */
interface ContentRow {
  doc_path: string;
  title: string | null;
  content: string | null;
  mtime: number | null;
}

/** 单个文件命中结果的中间结构 */
interface FileHit {
  docPath: string;
  title: string;
  line: number;
  lineText: string;
  score: number;
}

/** 片段上下文长度（命中原行前后额外展示的字符数） */
const SNIPPET_PAD = 60;

/** 单次搜索最多扫描的文件数，防止超大工作区卡顿 */
const MAX_SCAN_FILES = 5000;

/**
 * 为文档建立/更新索引
 * @param docPath 文档绝对路径
 * @param title 文档标题
 * @param content 文档内容
 */
export function indexDocument(docPath: string, title: string, content: string): void {
  if (!getSetting<boolean>('advanced.enableIndex', true)) return;
  if (!docPath) return;

  let mtime = 0;
  try {
    mtime = fs.statSync(docPath).mtimeMs;
  } catch {
    /* 文件尚未落盘时忽略 */
  }

  // 1) 原文表：用于中文子串匹配
  run(
    `INSERT INTO search_content (doc_path, title, content, mtime, updated_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(doc_path) DO UPDATE SET title = excluded.title,
                                         content = excluded.content,
                                         mtime = excluded.mtime,
                                         updated_at = CURRENT_TIMESTAMP`,
    docPath,
    title,
    content,
    mtime,
  );

  // 2) FTS5 表：用于英文全文检索。先删后插，保持与原文一致
  try {
    run('DELETE FROM search_index WHERE doc_path = ?', docPath);
    run('INSERT INTO search_index (doc_path, title, content) VALUES (?, ?, ?)', docPath, title, content);
  } catch (e) {
    // FTS5 不可用时静默跳过，LIKE 通道仍可正常工作
    logError('FTS5 索引写入失败（不影响搜索）', e);
  }
}

/**
 * 从索引中移除某个文档
 * @param docPath 文档绝对路径
 */
export function removeDocument(docPath: string): void {
  run('DELETE FROM search_content WHERE doc_path = ?', docPath);
  try {
    run('DELETE FROM search_index WHERE doc_path = ?', docPath);
  } catch {
    /* 忽略 */
  }
}

/** 清空全部索引 */
export function clearIndex(): void {
  run('DELETE FROM search_content');
  try {
    run('DELETE FROM search_index');
  } catch {
    /* 忽略 */
  }
}

/**
 * 判断查询串是否适合走 FTS5 通道（纯 ASCII 且不含特殊符号）
 * @param keyword 查询关键词
 */
function canUseFts(keyword: string): boolean {
  return /^[\x20-\x7e]+$/.test(keyword) && !/[":*^()\-]/.test(keyword);
}

/**
 * 执行全文搜索
 * @param keyword 查询关键词
 * @param limit 最多返回条数
 * @returns 命中结果列表，按相关度与文件排序
 */
export function search(keyword: string, limit = 50): SearchHit[] {
  const kw = keyword.trim();
  if (!kw) return [];

  const hitMap = new Map<string, FileHit[]>();

  // ---------- 通道一：FTS5 全文匹配（英文优先） ----------
  if (canUseFts(kw)) {
    try {
      const rows = all<{ doc_path: string; title: string | null; content: string | null }>(
        `SELECT doc_path, title, content FROM search_index WHERE search_index MATCH ? LIMIT ?`,
        `${kw}*`,
        limit * 4,
      );
      for (const r of rows) {
        collectHits(r.doc_path, r.title ?? '', r.content ?? '', kw, hitMap, 10);
      }
    } catch {
      /* FTS5 语法不兼容时忽略，交给 LIKE 通道 */
    }
  }

  // ---------- 通道二：LIKE 子串匹配（中文必需） ----------
  const likeRows = all<ContentRow>(
    `SELECT doc_path, title, content, mtime FROM search_content
     WHERE content LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\'
     LIMIT ?`,
    `%${escapeLike(kw)}%`,
    `%${escapeLike(kw)}%`,
    MAX_SCAN_FILES,
  );
  for (const r of likeRows) {
    collectHits(r.doc_path, r.title ?? '', r.content ?? '', kw, hitMap, 20);
  }

  // ---------- 汇总并按相关度排序 ----------
  const results: SearchHit[] = [];
  for (const [docPath, hits] of hitMap) {
    for (const h of hits) {
      results.push({
        docPath,
        title: h.title,
        line: h.line,
        snippet: buildSnippet(h.lineText, kw),
      });
    }
  }

  results.sort((a, b) => {
    if (a.docPath !== b.docPath) return a.docPath.localeCompare(b.docPath);
    return a.line - b.line;
  });

  return results.slice(0, limit);
}

/** 转义 LIKE 通配符，避免用户输入 % 或 _ 被当作通配符 */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => '\\' + m);
}

/**
 * 在文件内容中逐行查找关键词，收集命中行
 * @param docPath 文档路径
 * @param title 文档标题
 * @param content 文档内容
 * @param keyword 关键词
 * @param out 结果累加容器
 * @param maxPerFile 单文件最多收集的命中数
 */
function collectHits(
  docPath: string,
  title: string,
  content: string,
  keyword: string,
  out: Map<string, FileHit[]>,
  maxPerFile: number,
): void {
  const arr = out.get(docPath) ?? [];
  if (arr.length >= maxPerFile) return;

  const lowerKw = keyword.toLowerCase();
  const lines = content.split(/\r\n|\r|\n/);
  const titleMatch = title.toLowerCase().includes(lowerKw);

  for (let i = 0; i < lines.length; i += 1) {
    if (arr.length >= maxPerFile) break;
    if (lines[i].toLowerCase().includes(lowerKw)) {
      arr.push({
        docPath,
        title,
        line: i + 1,
        lineText: lines[i],
        // 标题命中的文件整体加权，让"文件名匹配"的结果排前面
        score: (titleMatch ? 1000 : 0) + Math.max(0, 200 - i),
      });
    }
  }

  // 标题命中但正文没有出现在前若干行时，也补一条记录
  if (titleMatch && arr.length === 0) {
    arr.push({ docPath, title, line: 1, lineText: title, score: 500 });
  }

  if (arr.length > 0) out.set(docPath, arr);
}

/**
 * 生成带高亮标记的片段
 * @param lineText 命中的整行文本
 * @param keyword 关键词
 */
function buildSnippet(lineText: string, keyword: string): string {
  const idx = lineText.toLowerCase().indexOf(keyword.toLowerCase());
  if (idx < 0) return escapeHtml(lineText.trim());

  const start = Math.max(0, idx - SNIPPET_PAD);
  const end = Math.min(lineText.length, idx + keyword.length + SNIPPET_PAD);

  const before = escapeHtml((start > 0 ? '…' : '') + lineText.slice(start, idx));
  const match = escapeHtml(lineText.slice(idx, idx + keyword.length));
  const after = escapeHtml(lineText.slice(idx + keyword.length, end) + (end < lineText.length ? '…' : ''));

  // 渲染进程按 <mark> 标签高亮，因此这里直接输出标签
  return `${before}<mark>${match}</mark>${after}`;
}

/** HTML 转义，防止把文件内容当作 HTML 注入界面 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 重建整个工作区的索引
 * @param root 工作区根目录
 * @param onProgress 进度回调
 * @returns 索引的文件数量
 */
export async function rebuildWorkspaceIndex(
  root: string,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const files = collectMarkdownFiles(root);
  let count = 0;
  for (const f of files) {
    try {
      const content = fs.readFileSync(f, 'utf8');
      indexDocument(f, path.basename(f, path.extname(f)), content);
      count += 1;
    } catch (e) {
      logError(`索引文件失败：${f}`, e);
    }
    if (onProgress && count % 20 === 0) onProgress(count, files.length);
  }
  onProgress?.(count, files.length);
  return count;
}

/** 递归收集目录下的 Markdown 文件 */
function collectMarkdownFiles(root: string, acc: string[] = []): string[] {
  const EXTS = new Set(['.md', '.markdown', '.mdx', '.txt']);
  const SKIP = new Set(['node_modules', '.git', '.svn', 'dist', 'build', '.obsidian', '.trash']);

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return acc;
  }

  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.') continue;
    if (SKIP.has(e.name)) continue;
    const full = path.join(root, e.name);
    if (e.isDirectory()) {
      collectMarkdownFiles(full, acc);
    } else if (e.isFile() && EXTS.has(path.extname(e.name).toLowerCase())) {
      acc.push(full);
    }
  }
  return acc;
}
