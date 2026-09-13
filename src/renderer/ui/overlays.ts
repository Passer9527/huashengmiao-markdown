/**
 * 花生苗 Markdown 编辑器 —— 弹层类界面模块
 * ------------------------------------------------------------------
 * 作者：何飞    联系方式：微信 6731663    开源协议：MIT
 *
 * 本文件职责：
 *   集中实现应用里所有"弹层/对话框"界面，全部基于 core/ui-kit 的 openModal 构建，
 *   不自行创建遮罩层，保证层级、动画、Esc 关闭、嵌套等行为完全一致。包含：
 *
 *     · openSettings()        设置面板（按 SETTING_DEFS 自动生成表单 + 主题管理）
 *     · openShortcutDialog()  快捷键设置（录制、冲突检测、重置、导入导出）
 *     · openAboutDialog()     关于（版本、作者、运行环境、目录入口）
 *     · openCheatsheet()      Markdown 语法速查表（可搜索）
 *     · openQuickOpen()       快速打开文件（模糊匹配 + 键盘操作）
 *     · openVersionHistory()  版本历史（快照列表 + 预览 + 恢复）
 *     · openExportDialog()    导出格式选择
 *     · openInfoDialog()      通用纯展示模态框
 *
 * 约定：
 *   · 所有异步调用均包裹 try/catch，失败一律用 toast 告知用户；
 *   · 只使用约定的 CSS 类名，样式由样式表负责，本文件不写 CSS；
 *   · 不使用 any，必要时用 unknown + 类型收窄。
 */

import {
  clear,
  copyText,
  el,
  formatSize,
  formatTime,
  openModal,
  toast,
} from '../core/ui-kit';
import {
  applySettings,
  emit,
  rebuildKeyIndex,
  setSetting,
  setSettings,
  state,
} from '../core/store';
import {
  COMMANDS,
  COMMAND_MAP,
  eventToCombo,
  formatCombo,
  isBindableCombo,
} from '../../shared/commands';
import { SETTING_DEFS, SETTING_GROUPS } from '../../shared/settings-defs';
import { DOC_THEMES } from '../../shared/themes';
import {
  APP_AUTHOR,
  APP_CONTACT,
  APP_HOMEPAGE,
  APP_LICENSE,
  APP_NAME,
  APP_SLOGAN,
  APP_VERSION,
  BUILD_TIME,
} from '../../shared/build-info';
import type {
  AppInfo,
  HsmApi,
  SettingDef,
  ShortcutBinding,
  ShortcutConflict,
  VersionSummary,
} from '../../shared/types';

/* ==================================================================
 * 零、内部通用小工具
 * ================================================================== */

/** 把未知异常转换成可读文本 */
function errText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return '未知错误';
}

/** 创建一个不会触发表单提交的普通按钮 */
function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  return el('button', { class: className, type: 'button', text: label, onclick: onClick });
}

/** 设置项左侧的"名称 + 说明"单元格 */
function settingsLabel(label: string, desc?: string): HTMLElement {
  return el(
    'div',
    { class: 'settings__label' },
    el('span', { text: label }),
    desc ? el('div', { class: 'settings__desc', text: desc }) : null,
  );
}

/**
 * 简易二次确认框（同样基于 openModal，不自己造遮罩）
 * @param title 标题
 * @param message 主要提示文字
 * @param detail 次要说明
 * @returns 用户是否点击了"确定"
 */
function confirmDialog(title: string, message: string, detail = ''): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    openModal({
      title,
      width: 420,
      content: el(
        'div',
        {},
        el('div', { text: message }),
        detail ? el('div', { class: 'text-dim', text: detail }) : null,
      ),
      buttons: [
        { label: '取消', onClick: () => finish(false) },
        { label: '确定', kind: 'primary', onClick: () => finish(true) },
      ],
      onClose: () => finish(false),
    });
  });
}

/**
 * preload 中已经实现、但 shared/types.ts 的 HsmApi 声明尚未同步的方法。
 * 这里用 unknown 做一次显式收窄，既拿到真实能力又不使用 any。
 */
type AppApiExtended = HsmApi['app'] & {
  /** 在系统文件管理器中打开日志目录 */
  openLogDir(): Promise<void>;
};

/** 取到带 openLogDir 的应用 API */
function appApi(): AppApiExtended {
  return window.hsm.app as unknown as AppApiExtended;
}

/** 版本历史 API 的完整签名（restore 的第二参数用于恢复前的自动备份） */
type HistoryApiExtended = HsmApi['history'] & {
  restore(id: number, currentContent: string): Promise<string | null>;
};

/** 取到带备份能力的版本历史 API */
function historyApi(): HistoryApiExtended {
  return window.hsm.history as unknown as HistoryApiExtended;
}

/* ==================================================================
 * 一、设置面板
 * ================================================================== */

/**
 * 打开设置面板
 * 左侧为分组导航，右侧表单完全由 state.settingDefs（兜底 SETTING_DEFS）自动生成，
 * "外观"分组额外提供文档主题下拉、主题预览与自定义主题管理。
 */
export function openSettings(): void {
  /** 当前激活的分组 */
  let activeGroup: SettingDef['group'] = SETTING_GROUPS[0] ?? '通用';

  const navEl = el('div', { class: 'settings__nav' });
  const panelsEl = el('div', { class: 'settings__panels' });
  const container = el('div', { class: 'settings' }, navEl, panelsEl);

  /** 与文档主题绑定的下拉框（自动生成的 + 外观分组额外提供的），需要互相同步 */
  const themeSelects: HTMLSelectElement[] = [];

  /** 主题变化后重绘预览卡片，由 buildAppearanceExtras 赋值 */
  let repaintPreview: () => void = () => undefined;

  /** 设置项定义：优先使用主进程下发的，为空时用共享常量兜底 */
  const allDefs = (): SettingDef[] => (state.settingDefs.length > 0 ? state.settingDefs : SETTING_DEFS);

  /** 读取设置项当前生效值 */
  const valueOf = (def: SettingDef): string | number | boolean => state.settings[def.key] ?? def.default;

  /** 写入设置项（store 内部会立即应用外观相关设置） */
  const commit = async (key: string, value: string | number | boolean): Promise<void> => {
    try {
      await setSetting(key, value);
    } catch (e) {
      toast(`设置保存失败：${errText(e)}`, 'error');
    }
  };

  /** 把当前主题同步到所有主题下拉框 */
  const syncThemeSelects = (themeId: string): void => {
    for (const sel of themeSelects) sel.value = themeId;
  };

  /** 当前自定义主题名集合 */
  const customThemeNames = (): string[] => state.customThemes.map((t) => t.name);

  /** 从主题 CSS 文本里读取一个 CSS 变量的值 */
  const readVar = (css: string, name: string): string | null => {
    const matched = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(css);
    return matched ? matched[1].trim() : null;
  };

  /** 生成一行自动表单 */
  const buildRow = (def: SettingDef): HTMLElement => {
    const current = valueOf(def);
    let control: HTMLElement;

    switch (def.type) {
      /* ---------------------------- 开关 ---------------------------- */
      case 'boolean': {
        const box = el('input', { class: 'switch', type: 'checkbox' });
        // 数据库里布尔值可能以 'true' / 1 的形式存在，这里一并兼容
        box.checked = current === true || current === 'true' || current === 1;
        box.addEventListener('change', () => {
          void commit(def.key, box.checked);
        });
        control = box;
        break;
      }

      /* ---------------------------- 数值 ---------------------------- */
      case 'number': {
        // 数值项统一用"滑块 + 只读数值显示"，拖动结束（change）时写入，避免频繁落库
        const wrap = el('div', {});
        const range = el('input', { class: 'range', type: 'range' });
        const value = Number(current);
        range.min = String(def.min ?? 0);
        range.max = String(def.max ?? 100);
        range.step = String(def.step ?? 1);
        range.value = String(Number.isFinite(value) ? value : Number(def.default));

        const display = el('input', { class: 'input input--sm', type: 'number', readonly: true });
        display.value = range.value;

        range.addEventListener('input', () => {
          display.value = range.value;
        });
        range.addEventListener('change', () => {
          void commit(def.key, Number(range.value));
        });

        wrap.append(range, display);
        control = wrap;
        break;
      }

      /* ---------------------------- 下拉 ---------------------------- */
      case 'select': {
        const sel = el('select', { class: 'select' });
        for (const opt of def.options ?? []) {
          sel.appendChild(el('option', { value: opt.value, text: opt.label }));
        }
        sel.value = String(current);
        if (sel.selectedIndex < 0) {
          // 当前值不在候选里（例如自定义主题名被删掉了），补一个占位项避免显示空白
          sel.appendChild(el('option', { value: String(current), text: String(current) }));
          sel.value = String(current);
        }

        if (def.key === 'appearance.theme') {
          // 文档主题需要联动预览卡片与外观分组里的另一个下拉框
          themeSelects.push(sel);
          sel.addEventListener('change', () => {
            const next = sel.value;
            void commit(def.key, next).then(() => {
              syncThemeSelects(next);
              repaintPreview();
            });
          });
        } else {
          sel.addEventListener('change', () => {
            void commit(def.key, sel.value);
          });
        }
        control = sel;
        break;
      }

      /* ---------------------------- 颜色 ---------------------------- */
      case 'color': {
        const picker = el('input', { type: 'color' });
        const text = String(current);
        picker.value = /^#[0-9a-fA-F]{6}$/.test(text) ? text : '#1f883d';
        const readout = el('span', { class: 'settings__desc', text: picker.value });
        picker.addEventListener('change', () => {
          readout.textContent = picker.value;
          void commit(def.key, picker.value);
        });
        control = el('div', {}, picker, readout);
        break;
      }

      /* ---------------------------- 文本 ---------------------------- */
      default: {
        const input = el('input', { class: 'input', type: 'text' });
        input.value = String(current);
        input.addEventListener('change', () => {
          void commit(def.key, input.value);
        });
        control = input;
        break;
      }
    }

    return el('div', { class: 'settings__row' }, settingsLabel(def.label, def.description), el('div', { class: 'settings__control' }, control));
  };

  /* ---------------------------- 自定义主题 ---------------------------- */

  /** 导入自定义 CSS 主题并立即启用 */
  const importCustomTheme = async (): Promise<void> => {
    try {
      const imported = await window.hsm.theme.importCss();
      if (!imported) return; // 用户取消

      const list = await window.hsm.theme.customList();
      state.customThemes = Array.isArray(list) ? list : [];
      await setSettings({ 'appearance.theme': 'custom', 'appearance.customTheme': imported.name });
      toast(`已导入并启用自定义主题「${imported.name}」`, 'success');
      renderPanels();
    } catch (e) {
      toast(`导入自定义主题失败：${errText(e)}`, 'error');
    }
  };

  /** 删除一个自定义主题 */
  const removeCustomTheme = async (name: string): Promise<void> => {
    const sure = await confirmDialog(
      '删除自定义主题',
      `确定要删除自定义主题「${name}」吗？`,
      '对应的 CSS 文件会从主题目录中移除，此操作不可撤销。',
    );
    if (!sure) return;

    try {
      await window.hsm.theme.remove(name);
      const list = await window.hsm.theme.customList();
      state.customThemes = Array.isArray(list) ? list : [];

      const inUse =
        String(state.settings['appearance.theme'] ?? '') === 'custom' &&
        String(state.settings['appearance.customTheme'] ?? '') === name;

      if (inUse) {
        await setSettings({ 'appearance.theme': 'github', 'appearance.customTheme': '' });
        toast('当前使用的自定义主题已被删除，已切换回 GitHub 主题', 'warning');
      } else {
        toast(`已删除自定义主题「${name}」`, 'success');
      }
      renderPanels();
    } catch (e) {
      toast(`删除自定义主题失败：${errText(e)}`, 'error');
    }
  };

  /** "外观"分组额外内容：主题下拉 + 预览卡片 + 自定义主题管理 */
  const buildAppearanceExtras = (): HTMLElement => {
    const group = el('div', { class: 'settings__group' }, el('div', { class: 'settings__group-title', text: '文档主题' }));

    /* 1. 文档主题下拉（内置主题 + 自定义主题…） */
    const sel = el('select', { class: 'select' });
    for (const t of DOC_THEMES) sel.appendChild(el('option', { value: t.id, text: t.label }));
    sel.appendChild(el('option', { value: 'custom', text: '自定义主题…' }));
    const activeTheme = String(state.settings['appearance.theme'] ?? 'github');
    sel.value = activeTheme;
    if (sel.selectedIndex < 0) sel.value = 'github';
    themeSelects.push(sel);

    /* 2. 预览卡片（只用色块模拟，不真渲染 Markdown） */
    const preview = el('div', { class: 'theme-preview' });
    const previewDesc = el('div', { class: 'settings__desc' });
    const paintPreview = (): void => {
      clear(preview);
      const themeId = String(state.settings['appearance.theme'] ?? 'github');
      const customName = String(state.settings['appearance.customTheme'] ?? '');
      const builtin = DOC_THEMES.find((t) => t.id === themeId);
      const css =
        themeId === 'custom'
          ? state.customThemes.find((t) => t.name === customName)?.css ?? ''
          : builtin?.css ?? '';
      const label =
        themeId === 'custom'
          ? customName
            ? `自定义：${customName}`
            : '自定义主题（尚未选择具体主题）'
          : builtin?.label ?? themeId;

      // 用主题里的几个关键颜色画色块，直观展示配色
      const swatches: Array<[string, string]> = [
        ['--doc-bg', '背景'],
        ['--doc-text', '正文'],
        ['--doc-link', '链接'],
        ['--doc-accent', '强调'],
        ['--doc-mark-bg', '高亮'],
      ];
      const fallback: Record<string, string> = {
        '--doc-bg': '#ffffff',
        '--doc-text': '#1f2328',
        '--doc-link': '#0969da',
        '--doc-accent': '#1f883d',
        '--doc-mark-bg': '#fff8c5',
      };
      for (const [key, title] of swatches) {
        const color = readVar(css, key) ?? fallback[key] ?? '#d0d0d0';
        const swatch = el('span', { class: 'theme-preview__swatch', title: `${title} ${color}` });
        swatch.style.background = color;
        preview.appendChild(swatch);
      }
      preview.appendChild(el('span', { class: 'theme-preview__label', text: label }));
      previewDesc.textContent = `当前文档主题：${label}`;
    };
    repaintPreview = paintPreview;
    paintPreview();

    sel.addEventListener('change', () => {
      const next = sel.value;
      if (next === 'custom' && customThemeNames().length === 0) {
        toast('请先点击下方"导入自定义主题…"导入一个 CSS 主题', 'warning');
        sel.value = String(state.settings['appearance.theme'] ?? 'github');
        return;
      }
      void commit('appearance.theme', next).then(() => {
        syncThemeSelects(next);
        paintPreview();
      });
    });

    group.appendChild(
      el(
        'div',
        { class: 'settings__row' },
        settingsLabel('文档主题', '内置主题与自定义主题都在这里切换，切换后立即生效'),
        el('div', { class: 'settings__control' }, sel),
      ),
    );
    group.appendChild(preview);
    group.appendChild(previewDesc);

    /* 3. 导入按钮 + 已导入主题列表 */
    const listBox = el('div', { class: 'theme-list' });
    const paintCustomList = (): void => {
      clear(listBox);
      if (state.customThemes.length === 0) {
        listBox.appendChild(el('div', { class: 'settings__desc', text: '尚未导入任何自定义主题。' }));
        return;
      }
      for (const theme of state.customThemes) {
        const inUse =
          String(state.settings['appearance.theme'] ?? '') === 'custom' &&
          String(state.settings['appearance.customTheme'] ?? '') === theme.name;

        const useBtn = button(
          inUse ? `${theme.name}（使用中）` : theme.name,
          'linkbtn',
          () => {
            void commit('appearance.theme', 'custom')
              .then(() => commit('appearance.customTheme', theme.name))
              .then(() => {
                syncThemeSelects('custom');
                paintPreview();
                renderPanels();
              });
          },
        );

        const delBtn = button('✕', 'iconbtn iconbtn--sm', () => {
          void removeCustomTheme(theme.name);
        });
        delBtn.title = `删除自定义主题 ${theme.name}`;

        listBox.appendChild(el('div', { class: 'settings__row' }, useBtn, delBtn));
      }
    };
    paintCustomList();

    group.appendChild(
      el(
        'div',
        { class: 'settings__row' },
        settingsLabel('自定义主题', '导入 .css 文件后，点击主题名即可启用'),
        el(
          'div',
          { class: 'settings__control' },
          button('导入自定义主题…', 'btn btn--sm', () => {
            void importCustomTheme();
          }),
        ),
      ),
    );
    group.appendChild(listBox);

    return group;
  };

  /* ---------------------------- 渲染 ---------------------------- */

  const renderNav = (): void => {
    clear(navEl);
    for (const group of SETTING_GROUPS) {
      navEl.appendChild(
        button(group, `settings__navitem${group === activeGroup ? ' is-active' : ''}`, () => {
          activeGroup = group;
          renderNav();
          renderPanels();
        }),
      );
    }
  };

  const renderPanels = (): void => {
    clear(panelsEl);
    themeSelects.length = 0;

    for (const group of SETTING_GROUPS) {
      const panel = el('div', { class: `settings__panel${group === activeGroup ? ' is-active' : ''}` });
      const rows = allDefs()
        .filter((d) => d.group === group)
        .map((d) => buildRow(d));

      panel.appendChild(
        el('div', { class: 'settings__group' }, el('div', { class: 'settings__group-title', text: group }), ...rows),
      );

      if (group === '外观') panel.appendChild(buildAppearanceExtras());

      panelsEl.appendChild(panel);
    }
  };

  /* ---------------------------- 恢复默认设置 ---------------------------- */

  const resetAllSettings = async (): Promise<void> => {
    const sure = await confirmDialog(
      '恢复默认设置',
      '确定要把全部设置恢复为默认值吗？',
      '自定义主题文件、版本历史与统计记录不会被删除。',
    );
    if (!sure) return;

    try {
      const defaults = await window.hsm.settings.reset();
      if (defaults) Object.assign(state.settings, defaults);
      applySettings();
      emit('settings-changed', defaults ?? {});
      renderPanels();
      toast('已恢复默认设置，建议重启软件以确保全部生效', 'success');
    } catch (e) {
      toast(`恢复默认设置失败：${errText(e)}`, 'error');
    }
  };

  renderNav();
  renderPanels();

  openModal({
    title: '设置',
    className: 'modal--wide',
    width: 760,
    content: container,
    buttons: [
      {
        label: '恢复默认设置',
        onClick: () => {
          void resetAllSettings();
          return false; // 保持设置面板打开，方便用户查看恢复后的值
        },
      },
      { label: '关闭', kind: 'primary' },
    ],
  });

  // 异步拉取已导入的自定义主题，失败不影响面板使用
  void (async () => {
    try {
      const list = await window.hsm.theme.customList();
      state.customThemes = Array.isArray(list) ? list : [];
      renderPanels();
    } catch (e) {
      toast(`读取自定义主题列表失败：${errText(e)}`, 'warning');
    }
  })();
}

/* ==================================================================
 * 二、快捷键设置面板
 * ================================================================== */

/** 分类展示顺序 */
const CATEGORY_ORDER: string[] = ['文件', '编辑', '格式', '视图', '表格', '帮助'];

/**
 * 打开快捷键设置面板
 * 支持按名称搜索、点击录制新按键、单条/全部重置、方案导入导出与冲突统计。
 */
export function openShortcutDialog(): void {
  /** 渲染数据源（与 state.shortcuts 保持同步） */
  let bindings: ShortcutBinding[] = state.shortcuts.map((b) => ({ ...b }));
  /** 搜索关键词 */
  let keyword = '';
  /** 面板是否已关闭（关闭后不再刷新界面） */
  let closed = false;
  /** 正在录制的行 */
  let recording: { commandId: string; cancel: () => void } | null = null;

  /** state.shortcuts 为空时用命令表兜底，保证面板始终可用 */
  if (bindings.length === 0) {
    bindings = COMMANDS.map((c) => ({
      commandId: c.id,
      commandName: c.name,
      category: c.category,
      keybinding: c.defaultKey,
      defaultKeybinding: c.defaultKey,
      customized: false,
    }));
  }

  const searchInput = el('input', {
    class: 'input',
    type: 'search',
    placeholder: '搜索命令名称或分类…',
  });
  const listBox = el('div', { class: 'shortcut-list' });
  const footBox = el('div', { class: 'shortcut-foot' });

  /** 取消当前录制 */
  const cancelRecording = (): void => {
    if (!recording) return;
    const current = recording;
    recording = null;
    current.cancel();
  };

  /** 把一份绑定列表写入本地状态 */
  const applyList = (list: ShortcutBinding[]): void => {
    bindings = list.map((b) => ({ ...b }));
    state.shortcuts = list.map((b) => ({ ...b }));
    state.keybindings = new Map(bindings.map((b) => [b.commandId, b.keybinding]));
    rebuildKeyIndex();
    emit('shortcuts-changed');
  };

  /** 只更新某一条绑定 */
  const updateBinding = (commandId: string, combo: string): void => {
    bindings = bindings.map((b) =>
      b.commandId === commandId ? { ...b, keybinding: combo, customized: combo !== b.defaultKeybinding } : b,
    );
    state.shortcuts = bindings.map((b) => ({ ...b }));
    state.keybindings.set(commandId, combo);
    rebuildKeyIndex();
    emit('shortcuts-changed');
  };

  /** 取某条命令当前绑定的显示文本 */
  const keyTextOf = (commandId: string): string => {
    const found = bindings.find((b) => b.commandId === commandId);
    return formatCombo(found?.keybinding ?? '');
  };

  /** 刷新底部冲突统计 */
  const refreshConflicts = async (): Promise<void> => {
    try {
      const conflicts = await window.hsm.shortcuts.conflicts();
      if (closed) return;
      clear(footBox);
      const list: ShortcutConflict[] = Array.isArray(conflicts) ? conflicts : [];
      if (list.length === 0) {
        footBox.appendChild(el('span', { class: 'text-dim', text: '未检测到快捷键冲突' }));
        return;
      }
      const detail = list
        .map((c) => {
          const names = c.commandIds.map((id) => COMMAND_MAP.get(id)?.name ?? id).join('、');
          return `${formatCombo(c.keybinding)} → ${names}`;
        })
        .join('；');
      footBox.appendChild(el('span', { class: 'badge', text: `存在 ${list.length} 处冲突` }));
      footBox.appendChild(el('span', { class: 'text-dim', text: detail }));
    } catch (e) {
      toast(`冲突检测失败：${errText(e)}`, 'error');
    }
  };

  /** 把新组合写入主进程并同步本地状态 */
  const applyCombo = async (
    commandId: string,
    combo: string,
    rowEl: HTMLElement,
    finish: () => void,
  ): Promise<void> => {
    try {
      const result = await window.hsm.shortcuts.set(commandId, combo);
      const name = COMMAND_MAP.get(commandId)?.name ?? commandId;

      if (result.conflict) {
        // 冲突：主进程不会写入，这里只做提示并标记该行
        const other = result.conflict.commandIds.find((id) => id !== commandId) ?? '';
        const otherName = other ? COMMAND_MAP.get(other)?.name ?? other : '其它命令';
        rowEl.classList.add('shortcut-conflict');
        toast(`该快捷键已被「${otherName}」占用`, 'warning');
        finish();
        return;
      }

      if (!result.ok) {
        toast('该快捷键无法绑定，请换一个组合', 'warning');
        finish();
        return;
      }

      rowEl.classList.remove('shortcut-conflict');
      updateBinding(commandId, combo);
      finish();
      render();
      toast(`「${name}」已设置为 ${formatCombo(combo)}`, 'success');
      void refreshConflicts();
    } catch (e) {
      finish();
      toast(`快捷键保存失败：${errText(e)}`, 'error');
    }
  };

  /** 进入录制状态 */
  const startRecording = (commandId: string, keyEl: HTMLButtonElement, rowEl: HTMLElement): void => {
    cancelRecording();

    keyEl.classList.add('is-recording');
    keyEl.textContent = '请按下新快捷键…';

    /**
     * 结束录制：移除监听、清理标记，并恢复按键显示。
     * 成功绑定时会先更新本地状态，因此这里显示的就是新的组合；取消或冲突时显示原组合。
     */
    const finish = (): void => {
      window.removeEventListener('keydown', onKey, true);
      if (recording?.commandId === commandId) recording = null;
      keyEl.classList.remove('is-recording');
      keyEl.textContent = keyTextOf(commandId);
    };

    const onKey = (e: KeyboardEvent): void => {
      // 录制期间吞掉所有按键，避免同时触发编辑器或全局快捷键
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        finish();
        return;
      }

      const combo = eventToCombo(e);
      if (!combo) return; // 只按了修饰键，继续等待主键

      if (!isBindableCombo(combo)) {
        toast('快捷键必须包含 Ctrl/Cmd、Alt 或为功能键', 'warning');
        return;
      }

      void applyCombo(commandId, combo, rowEl, finish);
    };

    // 使用 window 的捕获阶段，尽早于其它全局按键处理拿到事件
    window.addEventListener('keydown', onKey, true);
    recording = { commandId, cancel: finish };
  };

  /** 单条重置 */
  const resetOne = async (commandId: string): Promise<void> => {
    try {
      await window.hsm.shortcuts.resetOne(commandId);
      const def = COMMAND_MAP.get(commandId);
      updateBinding(commandId, def?.defaultKey ?? '');
      render();
      toast(`已恢复「${def?.name ?? commandId}」的默认快捷键`, 'success');
      void refreshConflicts();
    } catch (e) {
      toast(`重置快捷键失败：${errText(e)}`, 'error');
    }
  };

  /** 全部重置 */
  const resetAll = async (): Promise<void> => {
    const sure = await confirmDialog('全部重置', '确定要把所有快捷键恢复为默认值吗？', '你自定义的全部绑定都会被清除。');
    if (!sure) return;

    try {
      const list = await window.hsm.shortcuts.resetAll();
      if (Array.isArray(list) && list.length > 0) applyList(list);
      render();
      toast('已恢复全部默认快捷键', 'success');
      void refreshConflicts();
    } catch (e) {
      toast(`全部重置失败：${errText(e)}`, 'error');
    }
  };

  /** 导出方案 */
  const exportPlan = async (): Promise<void> => {
    try {
      const file = await window.hsm.shortcuts.exportFile();
      if (!file) return; // 用户取消
      toast(`快捷键方案已导出：${file}`, 'success');
    } catch (e) {
      toast(`导出方案失败：${errText(e)}`, 'error');
    }
  };

  /** 导入方案 */
  const importPlan = async (): Promise<void> => {
    try {
      const result = await window.hsm.shortcuts.importFile();
      if (!result || !result.ok) {
        if (result && result.error === 'cancelled') return;
        toast(`导入方案失败：${result?.error ?? '未知错误'}`, 'error');
        return;
      }

      const list = await window.hsm.shortcuts.list();
      if (Array.isArray(list) && list.length > 0) applyList(list);
      render();
      void refreshConflicts();
      toast(
        result.error
          ? `已导入 ${result.count ?? 0} 条绑定；${result.error}`
          : `已导入 ${result.count ?? 0} 条绑定，已立即生效`,
        result.error ? 'warning' : 'success',
      );
    } catch (e) {
      toast(`导入方案失败：${errText(e)}`, 'error');
    }
  };

  /** 渲染一行快捷键 */
  const buildRow = (binding: ShortcutBinding): HTMLElement => {
    const row = el('div', { class: 'shortcut-row' });

    const keyEl = el('button', {
      class: `shortcut-row__key${binding.customized ? ' is-custom' : ''}`,
      type: 'button',
      text: formatCombo(binding.keybinding),
      title: '点击后按下新的快捷键（Esc 取消）',
    });
    keyEl.addEventListener('click', () => {
      if (recording?.commandId === binding.commandId) {
        cancelRecording();
        return;
      }
      startRecording(binding.commandId, keyEl, row);
    });

    const resetEl = el('button', {
      class: 'shortcut-row__reset',
      type: 'button',
      text: '重置',
      title: `恢复默认：${formatCombo(binding.defaultKeybinding)}`,
    });
    resetEl.addEventListener('click', () => {
      cancelRecording();
      void resetOne(binding.commandId);
    });

    row.append(
      el('div', { class: 'shortcut-row__name', text: binding.commandName }),
      el('div', { class: 'shortcut-row__cat', text: binding.category }),
      keyEl,
      resetEl,
    );
    return row;
  };

  /** 渲染列表 */
  function render(): void {
    cancelRecording();
    clear(listBox);

    const kw = keyword.trim().toLowerCase();
    const filtered = bindings.filter((b) => {
      if (!kw) return true;
      return (
        b.commandName.toLowerCase().includes(kw) ||
        b.category.toLowerCase().includes(kw) ||
        b.commandId.toLowerCase().includes(kw)
      );
    });

    if (filtered.length === 0) {
      listBox.appendChild(el('div', { class: 'empty-hint', text: '没有匹配的命令' }));
      return;
    }

    const order = [...CATEGORY_ORDER];
    for (const b of filtered) if (!order.includes(b.category)) order.push(b.category);

    for (const category of order) {
      const group = filtered.filter((b) => b.category === category);
      if (group.length === 0) continue;

      const groupEl = el(
        'div',
        { class: 'shortcut-group' },
        el('div', { class: 'shortcut-group__title', text: category }),
      );
      for (const binding of group) groupEl.appendChild(buildRow(binding));
      listBox.appendChild(groupEl);
    }
  }

  searchInput.addEventListener('input', () => {
    keyword = searchInput.value;
    render();
  });

  const toolbar = el(
    'div',
    { class: 'shortcut-toolbar' },
    button('全部重置', 'btn btn--sm', () => {
      void resetAll();
    }),
    button('导出方案', 'btn btn--sm', () => {
      void exportPlan();
    }),
    button('导入方案', 'btn btn--sm', () => {
      void importPlan();
    }),
  );

  const content = el('div', { class: 'shortcut-dialog' }, searchInput, toolbar, listBox, footBox);

  render();
  footBox.appendChild(el('span', { class: 'text-dim', text: '正在检测快捷键冲突…' }));

  openModal({
    title: '快捷键设置',
    className: 'modal--wide',
    width: 820,
    content,
    buttons: [{ label: '关闭', kind: 'primary' }],
    onClose: () => {
      closed = true;
      cancelRecording();
    },
  });

  // 用主进程的真实数据刷新一次（state.shortcuts 可能尚未加载）
  void (async () => {
    try {
      const list = await window.hsm.shortcuts.list();
      if (closed) return;
      if (Array.isArray(list) && list.length > 0) {
        applyList(list);
        render();
      }
    } catch (e) {
      if (!closed) toast(`读取快捷键失败：${errText(e)}`, 'error');
    }
  })();

  void refreshConflicts();
}

/* ==================================================================
 * 三、关于对话框
 * ================================================================== */

/** 生成"运行环境"信息表格 */
function buildRuntimeTable(info: AppInfo): HTMLElement {
  const table = el('table', { class: 'about__table' });

  const addRow = (label: string, value: string): void => {
    table.appendChild(
      el('tr', {}, el('th', { class: 'about__label', text: label }), el('td', { class: 'about__value', text: value })),
    );
  };

  addRow('Electron', info.electron || '—');
  addRow('Chromium', info.chrome || '—');
  addRow('Node.js', info.node || '—');
  addRow('运行平台', info.platform || '—');
  addRow('构建时间', formatTime(info.buildTime || BUILD_TIME));
  addRow('用户数据目录', info.userDataPath || '—');
  return table;
}

/**
 * 打开关于对话框
 * 展示软件信息、作者联系方式、开源协议、运行环境与常用目录入口。
 */
export function openAboutDialog(): void {
  /* 顶部品牌区 */
  const head = el(
    'div',
    { class: 'about__head' },
    el('div', { class: 'about__logo', text: '🌱' }),
    el('div', { class: 'about__name', text: APP_NAME }),
    el('div', { class: 'about__slogan', text: APP_SLOGAN }),
    el('div', { class: 'about__version', text: `版本 ${APP_VERSION}` }),
  );

  /* 基本信息表 */
  const baseTable = el('table', { class: 'about__table' });
  const addBaseRow = (label: string, value: string): void => {
    baseTable.appendChild(
      el('tr', {}, el('th', { class: 'about__label', text: label }), el('td', { class: 'about__value', text: value })),
    );
  };
  addBaseRow('软件名称', APP_NAME);
  addBaseRow('版本号', APP_VERSION);
  addBaseRow('作者', APP_AUTHOR);
  addBaseRow('联系方式', APP_CONTACT);
  addBaseRow('开源协议', APP_LICENSE);

  /* 项目主页：可点击，交给系统浏览器打开 */
  const homepage = el('a', {
    class: 'about__link',
    href: '#',
    text: APP_HOMEPAGE,
    title: '在浏览器中打开项目主页',
    onclick: (e: MouseEvent) => {
      e.preventDefault();
      void (async () => {
        try {
          await window.hsm.shell.openExternal(APP_HOMEPAGE);
        } catch (err) {
          toast(`打开项目主页失败：${errText(err)}`, 'error');
        }
      })();
    },
  });
  baseTable.appendChild(
    el('tr', {}, el('th', { class: 'about__label', text: '项目主页' }), el('td', { class: 'about__value' }, homepage)),
  );

  /* 运行环境（异步填充） */
  const runtimeBox = el(
    'div',
    { class: 'about__runtime' },
    el('div', { class: 'text-dim', text: '正在读取运行环境信息…' }),
  );

  const copyright = el('div', {
    class: 'about__copyright',
    text: 'Copyright (c) 2025 何飞 (He Fei) · MIT License',
  });

  const content = el('div', { class: 'about' }, head, baseTable, runtimeBox, copyright);

  /* 目录入口 */
  const openLogDir = async (): Promise<void> => {
    try {
      await appApi().openLogDir();
    } catch (e) {
      toast(`打开日志目录失败：${errText(e)}`, 'error');
    }
  };
  const openUserData = async (): Promise<void> => {
    try {
      await window.hsm.app.openUserData();
    } catch (e) {
      toast(`打开数据目录失败：${errText(e)}`, 'error');
    }
  };

  openModal({
    title: '关于花生苗 Markdown 编辑器',
    width: 620,
    content,
    buttons: [
      {
        label: '打开日志目录',
        onClick: () => {
          void openLogDir();
          return false; // 保持对话框打开
        },
      },
      {
        label: '打开数据目录',
        onClick: () => {
          void openUserData();
          return false;
        },
      },
      { label: '确定', kind: 'primary' },
    ],
  });

  void (async () => {
    try {
      const info = await window.hsm.app.info();
      clear(runtimeBox);
      runtimeBox.appendChild(buildRuntimeTable(info));
    } catch (e) {
      clear(runtimeBox);
      runtimeBox.appendChild(el('div', { class: 'text-dim', text: `读取运行环境信息失败：${errText(e)}` }));
      toast('读取运行环境信息失败', 'error');
    }
  })();
}

/* ==================================================================
 * 四、Markdown 语法速查表
 * ================================================================== */

/** 速查表一行 */
interface CheatRow {
  /** 元素名称 */
  element: string;
  /** 语法示例（可含换行） */
  syntax: string;
  /** 效果说明 */
  note: string;
}

/** 速查表数据 */
const CHEAT_ROWS: CheatRow[] = [
  { element: '标题 H1–H6', syntax: '# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6', note: '用 1–6 个 # 加空格表示标题层级' },
  { element: '粗体', syntax: '**粗体文字**', note: '文字加粗显示' },
  { element: '斜体', syntax: '*斜体文字*', note: '文字倾斜显示' },
  { element: '粗斜体', syntax: '***粗斜体文字***', note: '同时加粗并倾斜' },
  { element: '删除线', syntax: '~~删除的文字~~', note: '文字上添加删除线' },
  { element: '下划线', syntax: '<u>下划线文字</u>', note: '用内联 HTML 标签实现下划线' },
  { element: '高亮', syntax: '==高亮文字==', note: '给文字加背景高亮' },
  { element: '行内代码', syntax: '`code`', note: '行内等宽字体，不解析 Markdown' },
  { element: '代码块', syntax: '```js\nconsole.log("hello");\n```', note: '标注语言后自动语法高亮，右上角显示语言名' },
  { element: '引用', syntax: '> 引用内容\n>> 嵌套引用', note: '左侧竖线的引用块，支持多级嵌套' },
  { element: '无序列表', syntax: '- 第一项\n- 第二项\n  - 子项', note: '圆点列表，用缩进表示嵌套' },
  { element: '有序列表', syntax: '1. 第一步\n2. 第二步', note: '数字列表，序号自动维护' },
  { element: '任务列表', syntax: '- [x] 已完成\n- [ ] 未完成', note: '可勾选的待办事项，勾选会同步写回 Markdown' },
  { element: '表格', syntax: '| 表头 | 表头 |\n| --- | --- |\n| 单元格 | 单元格 |', note: '支持对齐设置与整表增删行列' },
  { element: '链接', syntax: '[链接文字](https://example.com "悬停标题")', note: 'Ctrl/Cmd + 点击可在浏览器中打开' },
  { element: '图片', syntax: '![说明文字](assets/image.png)', note: '可设置对齐方式与最大宽度' },
  { element: '分割线', syntax: '---', note: '一条水平分割线' },
  { element: '脚注', syntax: '正文内容[^1]\n\n[^1]: 这里是脚注说明', note: '文末自动汇总脚注列表' },
  { element: '目录', syntax: '[TOC]', note: '根据文档标题自动生成目录' },
  { element: '行内公式', syntax: '$E = mc^2$', note: 'KaTeX 渲染的行内数学公式' },
  { element: '块级公式', syntax: '$$\n\\int_0^1 x^2\\,dx\n$$', note: '独占一行的居中公式块，支持编号' },
  { element: '上下标', syntax: 'H~2~O（下标）\nX^2^（上标）', note: '用 ~ ~ 表示下标，^ ^ 表示上标' },
  { element: 'Mermaid 流程图', syntax: '```mermaid\ngraph TD\n  A[开始] --> B[结束]\n```', note: '用文本绘制流程图、时序图、甘特图等' },
  { element: 'Emoji 短代码', syntax: ':smile: :+1:', note: '输入短代码后自动转换为表情符号' },
  { element: 'YAML Front Matter', syntax: '---\ntitle: 文档标题\nauthor: 何飞\n---', note: '文档元信息，在编辑器中以可折叠面板展示' },
  { element: '自定义容器', syntax: '::: warning\n这里是要强调的内容\n:::', note: '提示框，支持 warning / tip / danger 三种样式' },
  { element: '转义字符', syntax: '\\*不是斜体\\*', note: '用反斜杠转义 Markdown 符号，使其按原样显示' },
];

/**
 * 打开 Markdown 语法速查表
 * 顶部可按元素名、语法或说明进行过滤；点击语法可复制到剪贴板。
 */
export function openCheatsheet(): void {
  const searchInput = el('input', {
    class: 'input',
    type: 'search',
    placeholder: '搜索元素、语法或说明，例如"表格""公式"…',
  });

  const tbody = el('tbody');
  const table = el(
    'table',
    { class: 'cheatsheet' },
    el(
      'thead',
      {},
      el('tr', {}, el('th', { text: '元素' }), el('th', { text: '语法' }), el('th', { text: '效果说明' })),
    ),
    tbody,
  );
  const content = el('div', { class: 'cheatsheet-wrap' }, searchInput, table);

  /** 生成语法单元格：多行语法用 <br> 分隔，点击可复制 */
  const buildSyntaxCell = (row: CheatRow): HTMLTableCellElement => {
    const code = el('code', { title: '点击复制语法' });
    const lines = row.syntax.split('\n');
    lines.forEach((line, index) => {
      if (index > 0) code.appendChild(el('br'));
      code.appendChild(document.createTextNode(line));
    });
    code.addEventListener('click', () => {
      void copyText(row.syntax).then((ok) => {
        toast(ok ? '语法已复制到剪贴板' : '复制失败，请手动选择文本', ok ? 'success' : 'warning');
      });
    });
    return el('td', {}, code);
  };

  /** 按关键词渲染表格 */
  const render = (kw: string): void => {
    clear(tbody);
    const key = kw.trim().toLowerCase();
    const rows = CHEAT_ROWS.filter((r) => {
      if (!key) return true;
      return (
        r.element.toLowerCase().includes(key) ||
        r.syntax.toLowerCase().includes(key) ||
        r.note.toLowerCase().includes(key)
      );
    });

    if (rows.length === 0) {
      tbody.appendChild(
        el('tr', {}, el('td', { colspan: 3 }, el('div', { class: 'empty-hint', text: '没有匹配的语法条目' }))),
      );
      return;
    }

    for (const row of rows) {
      tbody.appendChild(
        el('tr', {}, el('td', { text: row.element }), buildSyntaxCell(row), el('td', { text: row.note })),
      );
    }
  };

  searchInput.addEventListener('input', () => render(searchInput.value));
  render('');

  openModal({
    title: 'Markdown 语法速查表',
    className: 'modal--wide',
    width: 880,
    content,
    buttons: [{ label: '关闭', kind: 'primary' }],
  });
}

/* ==================================================================
 * 五、快速打开文件（模糊搜索）
 * ================================================================== */

/** 参与模糊匹配的文件条目 */
interface QuickOpenFile {
  name: string;
  path: string;
  rel: string;
}

/**
 * 模糊匹配打分
 * 查询串按字符拆分，要求按顺序出现在"名称 + 相对路径"中（不区分大小写）；
 * 命中位置越靠前、越连续、越偏向文件名，得分越高。
 *
 * @returns 分数；未命中返回 -1
 */
function fuzzyScore(query: string, name: string, rel: string): number {
  const hay = `${name} ${rel}`.toLowerCase();
  const needle = query.toLowerCase();

  let index = 0;
  let score = 0;
  let lastHit = -1;

  for (const ch of needle) {
    const hit = hay.indexOf(ch, index);
    if (hit < 0) return -1;

    score += Math.max(0, 12 - hit * 0.15); // 越靠前分越高
    if (lastHit >= 0 && hit === lastHit + 1) score += 6; // 连续命中额外加分
    if (hit < name.length) score += 3; // 命中文件名（而非目录）再加分

    lastHit = hit;
    index = hit + 1;
  }

  score -= hay.length * 0.01; // 同等条件下路径更短的靠前
  return score;
}

/**
 * 打开"快速打开文件"面板
 *
 * @param files 候选文件列表（名称 / 绝对路径 / 相对路径）
 * @param onPick 选中文件后的回调，参数为绝对路径
 */
export function openQuickOpen(
  files: Array<{ name: string; path: string; rel: string }>,
  onPick: (path: string) => void,
): void {
  /** 当前匹配结果 */
  let matches: QuickOpenFile[] = [];
  /** 当前高亮项下标 */
  let activeIndex = 0;

  const input = el('input', {
    class: 'quickopen__input',
    type: 'text',
    placeholder: '输入文件名或路径，支持模糊匹配…',
  });
  const listBox = el('div', { class: 'quickopen__list' });
  const hint = el('div', { class: 'quickopen__hint', text: '↑ ↓ 选择 · Enter 打开 · Esc 关闭' });
  const content = el('div', { class: 'quickopen' }, input, listBox, hint);

  let closeModal: () => void = () => undefined;

  /** 只更新高亮状态，避免整表重建 */
  const updateActive = (): void => {
    const items = Array.from(listBox.children);
    items.forEach((node, index) => node.classList.toggle('is-active', index === activeIndex));
    const active = items[activeIndex];
    if (active instanceof HTMLElement) active.scrollIntoView({ block: 'nearest' });
  };

  /** 渲染匹配结果 */
  const renderList = (): void => {
    clear(listBox);

    if (matches.length === 0) {
      listBox.appendChild(el('div', { class: 'empty-hint', text: '没有匹配的文件' }));
      return;
    }

    matches.forEach((file, index) => {
      const item = el(
        'div',
        { class: `quickopen__item${index === activeIndex ? ' is-active' : ''}` },
        el('div', { class: 'quickopen__name', text: file.name }),
        el('div', { class: 'quickopen__path', text: file.rel || file.path }),
      );
      item.addEventListener('click', () => pick(index));
      item.addEventListener('mouseenter', () => {
        activeIndex = index;
        updateActive();
      });
      listBox.appendChild(item);
    });
  };

  /** 重新计算匹配结果（最多 50 条） */
  const updateMatches = (): void => {
    const query = input.value.trim();
    if (!query) {
      matches = files.slice(0, 50);
      activeIndex = 0;
      renderList();
      return;
    }

    const scored: Array<{ file: QuickOpenFile; score: number }> = [];
    for (const file of files) {
      const score = fuzzyScore(query, file.name, file.rel || file.path);
      if (score >= 0) scored.push({ file, score });
    }
    scored.sort((a, b) => b.score - a.score);

    matches = scored.slice(0, 50).map((entry) => entry.file);
    activeIndex = 0;
    renderList();
  };

  /** 选中某一项 */
  const pick = (index: number): void => {
    const file = matches[index];
    if (!file) return;
    try {
      onPick(file.path);
    } catch (e) {
      toast(`打开文件失败：${errText(e)}`, 'error');
    }
    closeModal();
  };

  input.addEventListener('input', updateMatches);
  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      if (matches.length === 0) return;
      activeIndex = Math.min(activeIndex + 1, matches.length - 1);
      updateActive();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      if (matches.length === 0) return;
      activeIndex = Math.max(activeIndex - 1, 0);
      updateActive();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      pick(activeIndex);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeModal();
    }
  });

  updateMatches();

  closeModal = openModal({
    title: '快速打开文件',
    width: 620,
    content,
    buttons: [],
  });

  // openModal 会自动聚焦第一个输入框，这里再聚焦一次确保光标就位
  window.setTimeout(() => input.focus(), 60);
}

/* ==================================================================
 * 六、版本历史
 * ================================================================== */

/**
 * 打开版本历史面板
 *
 * @param docPath 文档绝对路径
 * @param currentContent 文档当前内容（用于对比提示与恢复前自动备份）
 * @param onRestore 用户确认恢复时回调，参数为要写回编辑器的历史内容
 */
export async function openVersionHistory(
  docPath: string,
  currentContent: string,
  onRestore: (content: string) => void,
): Promise<void> {
  /** 当前选中的快照与其内容 */
  let selected: VersionSummary | null = null;
  let selectedText = '';

  const listBox = el('div', { class: 'version-list' });
  const metaBox = el('div', { class: 'version-meta text-dim', text: '选择左侧的快照即可预览内容' });
  const previewBox = el('pre', { class: 'version-preview', text: '（未选择历史版本）' });
  const content = el(
    'div',
    { class: 'version' },
    el('div', { class: 'version__side' }, listBox),
    el('div', { class: 'version__main' }, metaBox, previewBox),
  );

  let closeModal: () => void = () => undefined;
  let closed = false;

  /** 读取并预览某个快照 */
  const loadVersion = async (version: VersionSummary, item: HTMLElement): Promise<void> => {
    try {
      const text = await window.hsm.history.content(version.id);
      if (closed) return;
      if (text === null || text === undefined) {
        toast('该快照内容已丢失，可能已被清理', 'warning');
        return;
      }

      selected = version;
      selectedText = text;

      for (const node of Array.from(listBox.children)) node.classList.remove('is-active');
      item.classList.add('is-active');

      previewBox.textContent = text;
      const same = text === currentContent;
      metaBox.textContent = `版本 ${version.versionNo} · ${formatTime(version.createdAt)} · ${formatSize(version.sizeBytes)} · ${
        same ? '与当前内容一致' : '与当前内容不同'
      }`;
    } catch (e) {
      toast(`读取历史版本失败：${errText(e)}`, 'error');
    }
  };

  /** 渲染快照列表 */
  const renderList = (items: VersionSummary[]): void => {
    clear(listBox);
    if (items.length === 0) {
      listBox.appendChild(
        el('div', { class: 'empty-hint', text: '暂无历史快照。版本历史会按设置中的间隔自动生成。' }),
      );
      return;
    }

    for (const version of items) {
      const item = el('div', {
        class: 'version-item',
        text: `版本 ${version.versionNo} · ${formatTime(version.createdAt)} · ${formatSize(version.sizeBytes)}`,
        title: `快照 ID ${version.id}`,
      });
      item.addEventListener('click', () => {
        void loadVersion(version, item);
      });
      listBox.appendChild(item);
    }
  };

  /** 恢复选中版本 */
  const doRestore = async (): Promise<void> => {
    const version = selected;
    if (!version) {
      toast('请先在左侧选择一个历史版本', 'warning');
      return;
    }

    const sure = await confirmDialog(
      '恢复历史版本',
      `确定要恢复到版本 ${version.versionNo}（${formatTime(version.createdAt)}）吗？`,
      '当前内容会先自动存成一份新快照，再被所选版本覆盖。',
    );
    if (!sure) return;

    try {
      // 主进程的 restore 会先把"当前内容"存成新快照，避免误操作丢数据
      let text = selectedText;
      const restored = await historyApi().restore(version.id, currentContent);
      if (typeof restored === 'string') text = restored;

      onRestore(text);
      closeModal();
      toast(`已恢复到版本 ${version.versionNo}`, 'success');
    } catch (e) {
      toast(`恢复历史版本失败：${errText(e)}`, 'error');
    }
  };

  listBox.appendChild(el('div', { class: 'empty-hint', text: '正在加载历史快照…' }));

  closeModal = openModal({
    title: '版本历史',
    className: 'modal--wide',
    width: 860,
    content,
    buttons: [
      {
        label: '恢复此版本',
        kind: 'primary',
        onClick: () => {
          void doRestore();
          return false; // 恢复成功时由 doRestore 自行关闭
        },
      },
      { label: '关闭' },
    ],
    onClose: () => {
      closed = true;
    },
  });

  try {
    const items = await window.hsm.history.list(docPath);
    if (closed) return;
    renderList(Array.isArray(items) ? items : []);
  } catch (e) {
    clear(listBox);
    listBox.appendChild(el('div', { class: 'empty-hint', text: `加载历史快照失败：${errText(e)}` }));
    toast('加载版本历史失败', 'error');
  }
}

/* ==================================================================
 * 七、导出对话框
 * ================================================================== */

/** 导出格式选项 */
interface ExportChoice {
  /** 传给 onExport 的格式标识（与 shared/types.ts 的 ExportFormat 一致） */
  format: string;
  /** 卡片标题 */
  label: string;
  /** 卡片说明 */
  desc: string;
  /** 是否依赖 Pandoc */
  needsPandoc: boolean;
}

/** 支持的导出格式 */
const EXPORT_CHOICES: ExportChoice[] = [
  { format: 'html', label: 'HTML（带样式）', desc: '内联主题样式，输出单文件网页，可直接分享', needsPandoc: false },
  { format: 'html-plain', label: 'HTML（无样式）', desc: '只输出语义化标签，便于嵌入其它系统', needsPandoc: false },
  { format: 'pdf', label: 'PDF', desc: '按设置中的纸张、页边距与页眉页脚分页输出', needsPandoc: false },
  { format: 'png', label: 'PNG 长图', desc: '整篇导出为一张长图，适合发朋友圈与聊天窗口', needsPandoc: false },
  { format: 'docx', label: 'Word（.docx）', desc: '生成可继续编辑的 Word 文档', needsPandoc: true },
  { format: 'latex', label: 'LaTeX', desc: '生成 .tex 源文件，便于排版论文', needsPandoc: true },
  { format: 'epub', label: 'ePub', desc: '生成电子书文件，适合阅读器', needsPandoc: true },
  { format: 'rtf', label: 'RTF', desc: '生成富文本格式，兼容多数文字处理软件', needsPandoc: true },
];

/**
 * 打开导出对话框
 *
 * @param docPath 文档绝对路径
 * @param title 文档标题（用于界面提示与默认文件名）
 * @param onExport 用户确认导出时回调，参数为格式标识
 */
export function openExportDialog(docPath: string, title: string, onExport: (format: string) => void): void {
  /** 当前选择的格式 */
  let selected = EXPORT_CHOICES[0].format;

  const cards = new Map<string, HTMLButtonElement>();
  const grid = el('div', { class: 'export-formats' });

  /** 刷新卡片选中态 */
  const syncActive = (): void => {
    for (const [format, card] of cards) card.classList.toggle('is-active', format === selected);
  };

  for (const choice of EXPORT_CHOICES) {
    const card = el(
      'button',
      { class: `export-card${choice.format === selected ? ' is-active' : ''}`, type: 'button' },
      el('div', { class: 'export-card__title', text: choice.label }),
      el('div', { class: 'export-card__desc', text: choice.desc }),
      choice.needsPandoc ? el('span', { class: 'badge', text: '需安装 Pandoc' }) : null,
    );
    card.addEventListener('click', () => {
      selected = choice.format;
      syncActive();
    });
    cards.set(choice.format, card);
    grid.appendChild(card);
  }

  const head = el(
    'div',
    { class: 'export-dialog__head' },
    el('div', { class: 'export-dialog__title', text: `导出「${title || '未命名文档'}」` }),
    el('div', {
      class: 'text-dim',
      text: docPath ? docPath : '当前文档尚未保存，导出前可能需要先选择保存位置。',
    }),
  );

  const content = el(
    'div',
    { class: 'export-dialog' },
    head,
    grid,
    el('div', {
      class: 'text-dim',
      text: 'Word / LaTeX / ePub / RTF 需要系统已安装 Pandoc（免费开源，https://pandoc.org）；HTML、PDF、PNG 无需 Pandoc。',
    }),
  );

  /** 触发导出回调 */
  const doExport = (): void => {
    try {
      // onExport 声明返回 void，但实际实现可能是异步的，这里统一兜住异步失败
      Promise.resolve(onExport(selected)).catch((e: unknown) => {
        toast(`导出失败：${errText(e)}`, 'error');
      });
    } catch (e) {
      toast(`导出失败：${errText(e)}`, 'error');
    }
  };

  openModal({
    title: '导出文档',
    width: 680,
    content,
    buttons: [
      { label: '取消' },
      {
        label: '导出…',
        kind: 'primary',
        onClick: () => {
          doExport();
        },
      },
    ],
  });
}

/* ==================================================================
 * 八、通用纯展示模态框
 * ================================================================== */

/**
 * 打开一个只做展示的模态框（供其它模块复用）
 *
 * @param title 标题
 * @param html 正文 HTML（由调用方保证内容安全）
 */
export function openInfoDialog(title: string, html: string): void {
  openModal({
    title,
    width: 560,
    content: html,
    buttons: [{ label: '确定', kind: 'primary' }],
  });
}
