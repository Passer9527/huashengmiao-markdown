/**
 * 花生苗 Markdown 编辑器 —— 快捷键服务
 * ------------------------------------------------------------------
 * 负责快捷键绑定的持久化、冲突检测、重置与导入导出。
 * 默认绑定来自共享的命令表（src/shared/commands.ts），
 * 用户自定义绑定保存在 SQLite 的 shortcuts 表。
 *
 * 作者：何飞    联系方式：微信 6731663
 * 开源协议：MIT
 */

import { all, run } from './database';
import { COMMANDS, COMMAND_MAP, DEFAULT_KEYBINDINGS, isBindableCombo } from '../../shared/commands';
import type { ShortcutBinding, ShortcutConflict } from '../../shared/types';
import { logError, logInfo } from './logger';
import { dialog } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

/** shortcuts 表的一行 */
interface ShortcutRow {
  command_id: string;
  keybinding: string | null;
}

/** 内存缓存 */
let cache: ShortcutBinding[] | null = null;

/**
 * 读取全部快捷键绑定（命令表 + 用户自定义合并）
 */
export function listShortcuts(): ShortcutBinding[] {
  if (cache) return cache.map((b) => ({ ...b }));

  const rows = all<ShortcutRow>('SELECT command_id, keybinding FROM shortcuts');
  const userMap = new Map<string, string | null>();
  for (const r of rows) userMap.set(r.command_id, r.keybinding);

  cache = COMMANDS.map((cmd) => {
    const hasCustom = userMap.has(cmd.id);
    const binding = hasCustom ? (userMap.get(cmd.id) ?? '') : cmd.defaultKey;
    return {
      commandId: cmd.id,
      commandName: cmd.name,
      category: cmd.category,
      keybinding: binding,
      defaultKeybinding: cmd.defaultKey,
      customized: hasCustom && binding !== cmd.defaultKey,
    };
  });

  return cache.map((b) => ({ ...b }));
}

/** 清空内存缓存 */
export function invalidateShortcutCache(): void {
  cache = null;
}

/**
 * 检测全部冲突：同一个按键组合被多个命令占用
 * @param bindings 可选，默认使用当前全部绑定
 */
export function findConflicts(bindings?: ShortcutBinding[]): ShortcutConflict[] {
  const list = bindings ?? listShortcuts();
  const map = new Map<string, string[]>();

  for (const b of list) {
    const key = b.keybinding?.trim();
    if (!key) continue; // 未绑定的命令不参与冲突检测
    const arr = map.get(key) ?? [];
    arr.push(b.commandId);
    map.set(key, arr);
  }

  const conflicts: ShortcutConflict[] = [];
  for (const [keybinding, commandIds] of map) {
    if (commandIds.length > 1) conflicts.push({ keybinding, commandIds });
  }
  return conflicts;
}

/**
 * 修改某个命令的快捷键
 * @param commandId 命令 ID
 * @param keybinding 新的按键组合；空串表示解除绑定
 * @returns 结果，若存在冲突则返回冲突详情且不写入
 */
export function setShortcut(
  commandId: string,
  keybinding: string,
): { ok: boolean; conflict?: ShortcutConflict; error?: string } {
  const cmd = COMMAND_MAP.get(commandId);
  if (!cmd) return { ok: false, error: `未知命令：${commandId}` };

  const combo = keybinding.trim();

  // 空串代表解除绑定，直接允许
  if (combo === '') {
    persist(commandId, cmd.name, '');
    return { ok: true };
  }

  // 合法性校验：必须包含修饰键或是功能键
  if (!isBindableCombo(combo)) {
    return { ok: false, error: '快捷键必须包含 Ctrl/Cmd、Alt 或为功能键（F1–F12）' };
  }

  // 冲突检测：同组合是否已被其它命令占用
  const existing = listShortcuts().filter(
    (b) => b.commandId !== commandId && b.keybinding.trim().toLowerCase() === combo.toLowerCase(),
  );
  if (existing.length > 0) {
    return {
      ok: false,
      conflict: { keybinding: combo, commandIds: [commandId, ...existing.map((e) => e.commandId)] },
    };
  }

  persist(commandId, cmd.name, combo);
  return { ok: true };
}

/** 写库并刷新缓存 */
function persist(commandId: string, commandName: string, keybinding: string): void {
  const ok = run(
    `INSERT INTO shortcuts (command_id, command_name, keybinding, is_default, updated_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(command_id) DO UPDATE SET keybinding = excluded.keybinding,
                                           command_name = excluded.command_name,
                                           is_default = excluded.is_default,
                                           updated_at = CURRENT_TIMESTAMP`,
    commandId,
    commandName,
    keybinding,
    keybinding === (DEFAULT_KEYBINDINGS[commandId] ?? '') ? 1 : 0,
  );
  if (!ok) logError(`快捷键写入失败：${commandId} -> ${keybinding}`);
  invalidateShortcutCache();
}

/**
 * 把单个命令恢复为默认绑定
 * @param commandId 命令 ID
 */
export function resetShortcut(commandId: string): void {
  run('DELETE FROM shortcuts WHERE command_id = ?', commandId);
  invalidateShortcutCache();
}

/**
 * 全部恢复默认绑定
 * @returns 恢复后的绑定列表
 */
export function resetAllShortcuts(): ShortcutBinding[] {
  run('DELETE FROM shortcuts');
  invalidateShortcutCache();
  return listShortcuts();
}

/**
 * 把当前快捷键方案导出为 JSON 文件
 * @returns 导出文件路径；用户取消时返回 null
 */
export async function exportShortcuts(): Promise<string | null> {
  const bindings = listShortcuts();
  const payload = {
    _comment: '花生苗 Markdown 编辑器 快捷键方案。作者：何飞  微信：6731663',
    应用: '花生苗 Markdown 编辑器',
    版本: 1,
    导出时间: new Date().toISOString(),
    快捷键: bindings.map((b) => ({
      命令: b.commandName,
      命令ID: b.commandId,
      分类: b.category,
      按键: b.keybinding,
    })),
  };

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: '导出快捷键方案',
    defaultPath: path.join(
      getHomeDir(),
      `花生苗快捷键方案-${new Date().toISOString().slice(0, 10)}.json`,
    ),
    filters: [{ name: 'JSON 文件', extensions: ['json'] }],
  });
  if (canceled || !filePath) return null;

  try {
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
    logInfo(`快捷键方案已导出：${filePath}`);
    return filePath;
  } catch (e) {
    logError('导出快捷键方案失败', e);
    return null;
  }
}

/** 获取用户主目录 */
function getHomeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || '.';
}

/**
 * 从 JSON 文件导入快捷键方案
 * @returns 导入结果
 */
export async function importShortcuts(): Promise<{ ok: boolean; count?: number; error?: string }> {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: '导入快捷键方案',
    properties: ['openFile'],
    filters: [{ name: 'JSON 文件', extensions: ['json'] }],
  });
  if (canceled || filePaths.length === 0) return { ok: false, error: 'cancelled' };

  try {
    const raw = fs.readFileSync(filePaths[0], 'utf8');
    const data = JSON.parse(raw) as Record<string, unknown>;

    // 兼容两种格式：{快捷键: [...]} 或直接是数组
    const list = (Array.isArray(data) ? data : (data['快捷键'] as unknown[])) ?? [];
    if (!Array.isArray(list)) return { ok: false, error: '文件格式不正确，缺少"快捷键"数组' };

    let count = 0;
    const skipped: string[] = [];

    for (const item of list as Array<Record<string, unknown>>) {
      const id = String(item['命令ID'] ?? item['commandId'] ?? '');
      const key = String(item['按键'] ?? item['keybinding'] ?? '');
      if (!id || !COMMAND_MAP.has(id)) {
        skipped.push(id || '(缺少命令ID)');
        continue;
      }
      // 先解除旧绑定，避免导入过程中自我冲突
      run('DELETE FROM shortcuts WHERE command_id = ?', id);
      const r = setShortcut(id, key);
      if (r.ok) count += 1;
      else skipped.push(COMMAND_MAP.get(id)?.name ?? id);
    }

    logInfo(`快捷键方案导入完成，成功 ${count} 条，跳过 ${skipped.length} 条`);
    return {
      ok: true,
      count,
      error: skipped.length ? `有 ${skipped.length} 条未导入（冲突或非法）：${skipped.join('、')}` : undefined,
    };
  } catch (e) {
    logError('导入快捷键方案失败', e);
    return { ok: false, error: '文件解析失败，请确认是本软件导出的 JSON 文件' };
  }
}
