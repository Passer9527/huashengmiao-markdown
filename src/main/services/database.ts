/**
 * 花生苗 Markdown 编辑器 —— 数据库服务
 * ------------------------------------------------------------------
 * 使用 Node.js 内置的 node:sqlite（无需任何原生模块编译），
 * 数据库文件位于用户数据目录下的 huashengmiao.db。
 *
 * 设计要点：
 *   1. 保存文档索引、配置、快捷键、最近文件、版本快照、全文索引；
 *   2. 使用 FTS5 虚拟表提供中文友好的全文检索（unicode61 分词）；
 *   3. 所有写操作使用预编译语句，避免 SQL 注入；
 *   4. 数据库不可用时自动降级为内存库，保证软件仍可正常编辑。
 *
 * 作者：何飞    联系方式：微信 6731663
 * 开源协议：MIT
 */

import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { logError, logInfo } from './logger';

/** 数据库单例 */
let database: DatabaseSync | null = null;

/** 数据库文件绝对路径 */
let databasePath = '';

/** 预编译语句缓存，避免重复解析 SQL */
const stmtCache = new Map<string, StatementSync>();

/** 建表语句清单（按依赖顺序执行） */
const SCHEMA_STATEMENTS: string[] = [
  /* 文档索引表：记录每个被打开过的文档的元数据 */
  `CREATE TABLE IF NOT EXISTS documents (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      title          VARCHAR(256) NOT NULL DEFAULT '未命名',
      file_path      VARCHAR(512) UNIQUE,
      content_hash   VARCHAR(64),
      word_count     INTEGER DEFAULT 0,
      char_count     INTEGER DEFAULT 0,
      line_count     INTEGER DEFAULT 0,
      is_favorite    BOOLEAN DEFAULT 0,
      is_deleted     BOOLEAN DEFAULT 0,
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_opened_at DATETIME
  )`,
  `CREATE INDEX IF NOT EXISTS idx_documents_path ON documents(file_path)`,
  `CREATE INDEX IF NOT EXISTS idx_documents_updated ON documents(updated_at DESC)`,

  /* 版本快照表：保存文档的历史内容，支持回滚 */
  `CREATE TABLE IF NOT EXISTS document_versions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id  INTEGER NOT NULL,
      doc_path     VARCHAR(512) NOT NULL,
      content      TEXT    NOT NULL,
      content_hash VARCHAR(64),
      version_no   INTEGER NOT NULL,
      size_bytes   INTEGER,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_versions_doc ON document_versions(doc_path, version_no DESC)`,

  /* 标签表 */
  `CREATE TABLE IF NOT EXISTS tags (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       VARCHAR(64) NOT NULL UNIQUE,
      color      VARCHAR(16) DEFAULT '#22a06b',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS document_tags (
      document_id INTEGER NOT NULL,
      tag_id      INTEGER NOT NULL,
      PRIMARY KEY (document_id, tag_id)
  )`,

  /* 图片资源登记表 */
  `CREATE TABLE IF NOT EXISTS images (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id   INTEGER,
      doc_path      VARCHAR(512),
      original_name VARCHAR(256),
      stored_path   VARCHAR(512) NOT NULL,
      url           VARCHAR(512),
      mime_type     VARCHAR(64),
      size_bytes    INTEGER,
      width         INTEGER,
      height        INTEGER,
      hash          VARCHAR(64),
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_images_hash ON images(hash)`,

  /* 配置表：键值对存储 */
  `CREATE TABLE IF NOT EXISTS settings (
      key        VARCHAR(128) PRIMARY KEY,
      value      TEXT,
      value_type VARCHAR(16) DEFAULT 'string',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  /* 快捷键表 */
  `CREATE TABLE IF NOT EXISTS shortcuts (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      command_id   VARCHAR(128) NOT NULL UNIQUE,
      command_name VARCHAR(128) NOT NULL,
      keybinding   VARCHAR(128),
      is_default   BOOLEAN DEFAULT 1,
      scope        VARCHAR(32) DEFAULT 'global',
      updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  /* 最近文件表 */
  `CREATE TABLE IF NOT EXISTS recent_files (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path  VARCHAR(512) NOT NULL UNIQUE,
      title      VARCHAR(256),
      opened_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      open_count INTEGER DEFAULT 1
  )`,

  /* 文档内容索引表：为中文全文检索提供 LIKE 兜底方案
     （FTS5 的 unicode61 分词对中文连写支持有限，故额外保留原文以便子串匹配） */
  `CREATE TABLE IF NOT EXISTS search_content (
      doc_path   VARCHAR(512) PRIMARY KEY,
      title      VARCHAR(256),
      content    TEXT,
      mtime      INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_search_content_title ON search_content(title)`,

  /* 会话恢复表：记录上次打开的标签页与工作区 */
  `CREATE TABLE IF NOT EXISTS session_state (
      key        VARCHAR(64) PRIMARY KEY,
      value      TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  /* 导出历史表 */
  `CREATE TABLE IF NOT EXISTS export_history (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER,
      doc_path    VARCHAR(512),
      format      VARCHAR(16),
      output_path VARCHAR(512),
      file_size   INTEGER,
      status      VARCHAR(16),
      error_msg   TEXT,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  /* 同步日志表（云同步功能预留） */
  `CREATE TABLE IF NOT EXISTS sync_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_path   VARCHAR(512),
      action     VARCHAR(32),
      provider   VARCHAR(32),
      status     VARCHAR(16),
      message    TEXT,
      synced_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  /* 插件表（插件系统预留） */
  `CREATE TABLE IF NOT EXISTS plugins (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         VARCHAR(128) NOT NULL UNIQUE,
      version      VARCHAR(32),
      enabled      BOOLEAN DEFAULT 1,
      config       TEXT,
      installed_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
];

/**
 * 初始化数据库：创建文件与全部表结构
 * @returns 是否初始化成功
 */
export function initDatabase(): boolean {
  if (database) return true;

  try {
    // 优先写入用户数据目录；该目录在打包后由 Electron 自动创建
    const userData = app.getPath('userData');
    fs.mkdirSync(userData, { recursive: true });
    databasePath = path.join(userData, 'huashengmiao.db');

    database = new DatabaseSync(databasePath);

    // 性能相关配置：WAL 提升并发读写，NORMAL 兼顾安全与速度
    database.exec('PRAGMA journal_mode = WAL');
    database.exec('PRAGMA synchronous = NORMAL');
    database.exec('PRAGMA foreign_keys = ON');
    database.exec('PRAGMA temp_store = MEMORY');

    for (const sql of SCHEMA_STATEMENTS) database.exec(sql);

    // 全文检索虚拟表（FTS5）。部分精简版 SQLite 可能未编译该模块，失败不影响主流程
    try {
      database.exec(
        `CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
            doc_path UNINDEXED,
            title,
            content,
            tokenize = 'unicode61'
         )`,
      );
    } catch (e) {
      logError('FTS5 全文索引不可用，已降级为逐文件搜索', e);
    }

    logInfo(`数据库初始化完成：${databasePath}`);
    return true;
  } catch (e) {
    logError('数据库初始化失败，降级为内存数据库', e);
    try {
      database = new DatabaseSync(':memory:');
      for (const sql of SCHEMA_STATEMENTS) database.exec(sql);
      databasePath = ':memory:';
      return true;
    } catch (e2) {
      logError('内存数据库创建失败，存储功能不可用', e2);
      database = null;
      return false;
    }
  }
}

/** 获取数据库实例（未初始化时自动初始化） */
export function getDb(): DatabaseSync | null {
  if (!database) initDatabase();
  return database;
}

/** 获取数据库文件路径 */
export function getDatabasePath(): string {
  return databasePath;
}

/**
 * 执行写操作（INSERT / UPDATE / DELETE）
 * @param sql SQL 语句，支持 ? 占位符
 * @param params 参数列表
 * @returns 执行结果；失败返回 null
 */
export function run(sql: string, ...params: unknown[]): ReturnType<StatementSync['run']> | null {
  const db = getDb();
  if (!db) return null;
  try {
    let stmt = stmtCache.get(sql);
    if (!stmt) {
      stmt = db.prepare(sql);
      stmtCache.set(sql, stmt);
    }
    return stmt.run(...(params as never[]));
  } catch (e) {
    logError(`SQL 执行失败：${sql}`, e);
    return null;
  }
}

/**
 * 查询单行
 * @param sql SQL 语句
 * @param params 参数列表
 */
export function get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined {
  const db = getDb();
  if (!db) return undefined;
  try {
    let stmt = stmtCache.get(sql);
    if (!stmt) {
      stmt = db.prepare(sql);
      stmtCache.set(sql, stmt);
    }
    return stmt.get(...(params as never[])) as T | undefined;
  } catch (e) {
    logError(`SQL 查询失败：${sql}`, e);
    return undefined;
  }
}

/**
 * 查询多行
 * @param sql SQL 语句
 * @param params 参数列表
 */
export function all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
  const db = getDb();
  if (!db) return [];
  try {
    let stmt = stmtCache.get(sql);
    if (!stmt) {
      stmt = db.prepare(sql);
      stmtCache.set(sql, stmt);
    }
    return stmt.all(...(params as never[])) as T[];
  } catch (e) {
    logError(`SQL 查询失败：${sql}`, e);
    return [];
  }
}

/** 执行原始 SQL（多语句，用于批量初始化） */
export function exec(sql: string): void {
  const db = getDb();
  if (!db) return;
  try {
    db.exec(sql);
  } catch (e) {
    logError('SQL 批量执行失败', e);
  }
}

/**
 * 压缩整理数据库文件
 * 执行 SQLite 的 VACUUM：重建数据库文件，回收删除数据后留下的空洞，
 * 可显著减小 huashengmiao.db 的体积。
 *
 * @returns 压缩前后的文件大小（字节）
 */
export function vacuumDatabase(): { before: number; after: number } {
  const measure = (): number => {
    try {
      return fs.statSync(databasePath).size;
    } catch {
      return 0;
    }
  };

  const before = measure();
  const db = getDb();
  if (!db) return { before, after: before };

  try {
    // VACUUM 不能在事务中执行，这里直接调用即可
    db.exec('VACUUM');
    logInfo('数据库已压缩整理');
  } catch (e) {
    logError('数据库压缩失败', e);
  }

  return { before, after: measure() };
}

/** 关闭数据库连接（退出前调用，确保 WAL 落盘） */
export function closeDatabase(): void {
  if (!database) return;
  try {
    stmtCache.clear();
    database.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    database.close();
    logInfo('数据库已安全关闭');
  } catch (e) {
    logError('数据库关闭时出错', e);
  } finally {
    database = null;
  }
}
