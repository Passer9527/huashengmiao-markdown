/**
 * 花生苗 Markdown 编辑器 —— 设置服务
 * ------------------------------------------------------------------
 * 设置的读写、校验与重置。设置以键值对形式存放在 SQLite 的 settings 表，
 * 读取时与代码中的默认值合并，保证新增设置项在旧数据库上也能生效。
 *
 * 作者：何飞    联系方式：微信 6731663
 * 开源协议：MIT
 */

import { all, run } from './database';
import { SETTING_DEFS, SETTING_MAP, defaultSettings, coerceSetting } from '../../shared/settings-defs';
import type { SettingDef, SettingsMap } from '../../shared/types';
import { logError } from './logger';

/** 数据库中的一行设置 */
interface SettingRow {
  key: string;
  value: string | null;
  value_type: string | null;
}

/** 内存缓存：避免每次读取都查询数据库 */
let cache: SettingsMap | null = null;

/**
 * 读取全部设置（默认值 + 用户自定义值合并）
 */
export function getAllSettings(): SettingsMap {
  if (cache) return { ...cache };

  const result = defaultSettings();
  const rows = all<SettingRow>('SELECT key, value, value_type FROM settings');

  for (const row of rows) {
    const def = SETTING_MAP.get(row.key);
    if (def) {
      // 已知设置项：按类型定义转换
      result[row.key] = coerceSetting(def, row.value);
    } else {
      // 未知键（可能来自未来的版本）：原样保留字符串
      result[row.key] = row.value ?? '';
    }
  }

  cache = result;
  return { ...result };
}

/**
 * 读取单个设置项
 * @param key 设置键名
 * @param fallback 未定义时的兜底值
 */
export function getSetting<T extends string | number | boolean>(key: string, fallback: T): T {
  const def = SETTING_MAP.get(key);
  const all0 = getAllSettings();
  const value = all0[key];
  if (value === undefined || value === null) return fallback;
  return value as T;
}

/** 把值序列化为数据库中的字符串形式 */
function serialize(def: SettingDef | undefined, value: string | number | boolean): string {
  if (def?.type === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

/** 推断值的类型标签，存入 value_type 字段 */
function typeName(def: SettingDef | undefined): string {
  if (!def) return 'string';
  if (def.type === 'boolean') return 'bool';
  if (def.type === 'number') return 'float';
  return 'string';
}

/**
 * 写入单个设置项
 * @param key 设置键名
 * @param value 设置值
 * @returns 是否写入成功
 */
export function setSetting(key: string, value: string | number | boolean): boolean {
  const def = SETTING_MAP.get(key);

  // 数值型做范围钳制，避免用户输入越界导致界面异常
  let normalized = value;
  if (def?.type === 'number' && typeof value === 'number') {
    if (def.min !== undefined && value < def.min) normalized = def.min;
    if (def.max !== undefined && value > def.max) normalized = def.max;
  }

  const ok = run(
    `INSERT INTO settings (key, value, value_type, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value,
                                    value_type = excluded.value_type,
                                    updated_at = CURRENT_TIMESTAMP`,
    key,
    serialize(def, normalized),
    typeName(def),
  );

  if (ok) {
    if (!cache) cache = defaultSettings();
    cache[key] = normalized;
  } else {
    logError(`设置写入失败：${key} = ${String(value)}`);
  }
  return ok !== null;
}

/**
 * 批量写入设置
 * @param values 键值对集合
 */
export function setSettings(values: SettingsMap): void {
  for (const [key, value] of Object.entries(values)) {
    setSetting(key, value);
  }
}

/**
 * 重置全部设置为出厂默认值
 * @returns 重置后的设置集合
 */
export function resetSettings(): SettingsMap {
  run('DELETE FROM settings');
  cache = defaultSettings();

  // 把默认值显式写回数据库，便于用户直接查看/修改数据库文件
  for (const [key, value] of Object.entries(cache)) {
    setSetting(key, value);
  }
  return { ...cache };
}

/** 获取全部设置项定义（渲染进程用于生成设置界面） */
export function getSettingDefs(): SettingDef[] {
  return SETTING_DEFS;
}

/** 清空内存缓存（数据库被外部修改后调用） */
export function invalidateSettingsCache(): void {
  cache = null;
}
