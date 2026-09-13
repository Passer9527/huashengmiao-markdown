/**
 * 花生苗 Markdown 编辑器 —— 日志服务
 * ------------------------------------------------------------------
 * 负责把运行日志与错误写入用户数据目录下的 logs/ 文件夹，
 * 便于用户反馈问题时附带日志；同时输出到开发控制台。
 *
 * 日志文件按天切分，最多保留 7 天，避免无限增长。
 *
 * 作者：何飞    联系方式：微信 6731663
 * 开源协议：MIT
 */

import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

/** 日志目录 */
let logDir = '';

/** 当前日志文件路径 */
let currentLogFile = '';

/** 保留的最大日志天数 */
const MAX_LOG_DAYS = 7;

/** 单条日志最大长度，避免超长内容撑爆文件 */
const MAX_LINE_LENGTH = 8000;

/** 是否初始化完成 */
let initialized = false;

/** 获取当天的日期字符串 YYYY-MM-DD */
function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 初始化日志目录并清理过期日志 */
function ensureInit(): void {
  if (initialized) return;
  try {
    logDir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    currentLogFile = path.join(logDir, `huashengmiao-${today()}.log`);
    cleanupOldLogs();
    initialized = true;
  } catch {
    // 日志不可用时静默失败，绝不能因为写日志导致主流程崩溃
    initialized = true;
    logDir = '';
  }
}

/** 删除超过保留天数的日志文件 */
function cleanupOldLogs(): void {
  try {
    const files = fs.readdirSync(logDir).filter((f) => f.startsWith('huashengmiao-') && f.endsWith('.log'));
    if (files.length <= MAX_LOG_DAYS) return;
    // 文件名包含日期，按字典序排序即为按时间排序
    files.sort();
    for (const f of files.slice(0, files.length - MAX_LOG_DAYS)) {
      fs.unlinkSync(path.join(logDir, f));
    }
  } catch {
    /* 清理失败可忽略 */
  }
}

/** 把任意值安全地转换为可读文本 */
function stringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Error) {
    return `${value.name}: ${value.message}${value.stack ? '\n' + value.stack : ''}`;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** 写入一行日志 */
function write(level: string, message: string, extra: unknown[]): void {
  ensureInit();
  const time = new Date().toISOString();
  const parts = [message, ...extra.map(stringify)].filter(Boolean);
  let line = `[${time}] [${level}] ${parts.join(' | ')}`;
  if (line.length > MAX_LINE_LENGTH) line = line.slice(0, MAX_LINE_LENGTH) + '…(已截断)';

  // 控制台输出便于开发调试
  if (level === 'ERROR') console.error(line);
  else if (level === 'WARN') console.warn(line);
  else console.log(line);

  if (!logDir) return;
  try {
    fs.appendFileSync(currentLogFile, line + '\n', 'utf8');
  } catch {
    /* 写日志失败可忽略 */
  }
}

/** 记录普通信息 */
export function logInfo(message: string, ...extra: unknown[]): void {
  write('INFO', message, extra);
}

/** 记录警告 */
export function logWarn(message: string, ...extra: unknown[]): void {
  write('WARN', message, extra);
}

/** 记录错误 */
export function logError(message: string, ...extra: unknown[]): void {
  write('ERROR', message, extra);
}

/** 获取日志目录路径（"打开日志目录"菜单使用） */
export function getLogDir(): string {
  ensureInit();
  return logDir;
}

/** 安装全局异常捕获，把未处理异常写入日志 */
export function installGlobalErrorHandlers(): void {
  process.on('uncaughtException', (err) => {
    logError('主进程未捕获异常', err);
  });
  process.on('unhandledRejection', (reason) => {
    logError('主进程未处理的 Promise 拒绝', reason);
  });
}
