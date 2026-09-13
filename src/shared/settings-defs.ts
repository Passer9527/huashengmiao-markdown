/**
 * 花生苗 Markdown 编辑器 —— 设置项定义
 * ------------------------------------------------------------------
 * 集中定义所有可配置项，主进程用它来初始化默认值并校验取值范围，
 * 渲染进程用它自动生成设置界面（无需手写表单）。
 *
 * 作者：何飞    联系方式：微信 6731663
 * 开源协议：MIT
 */

import type { SettingDef, SettingsMap } from './types';

/** 内置主题清单（文档主题） */
export const BUILTIN_THEMES = [
  { value: 'github', label: 'GitHub（默认）' },
  { value: 'newsprint', label: 'Newsprint（报刊）' },
  { value: 'night', label: 'Night（夜色）' },
  { value: 'pixyll', label: 'Pixyll（简约）' },
  { value: 'whitey', label: 'Whitey（纯白）' },
  { value: 'vue', label: 'Vue（青绿）' },
  { value: 'custom', label: '自定义主题…' },
];

/** 内置代码块高亮主题清单 */
export const CODE_THEMES = [
  { value: 'github', label: 'GitHub' },
  { value: 'dracula', label: 'Dracula' },
  { value: 'monokai', label: 'Monokai' },
  { value: 'one-dark', label: 'One Dark' },
  { value: 'solarized-light', label: 'Solarized Light' },
];

/** 全部设置项定义 */
export const SETTING_DEFS: SettingDef[] = [
  /* ---------------------------- 通用 ---------------------------- */
  {
    key: 'general.language',
    label: '界面语言',
    type: 'select',
    default: 'zh-CN',
    group: '通用',
    options: [
      { value: 'zh-CN', label: '简体中文' },
      { value: 'en-US', label: 'English' },
    ],
  },
  {
    key: 'general.autoSave',
    label: '自动保存',
    type: 'boolean',
    default: true,
    group: '通用',
    description: '在停止输入一段时间后自动写入磁盘',
  },
  {
    key: 'general.autoSaveInterval',
    label: '自动保存间隔（秒）',
    type: 'number',
    default: 5,
    min: 1,
    max: 600,
    step: 1,
    group: '通用',
    description: '数值越小越安全，写入也越频繁',
  },
  {
    key: 'general.restoreSession',
    label: '启动时恢复上次会话',
    type: 'boolean',
    default: true,
    group: '通用',
    description: '自动重新打开上次关闭时的标签页与工作区',
  },
  {
    key: 'general.confirmOnExit',
    label: '退出前提示未保存内容',
    type: 'boolean',
    default: true,
    group: '通用',
  },
  {
    key: 'general.recentLimit',
    label: '最近文件保留数量',
    type: 'number',
    default: 30,
    min: 5,
    max: 200,
    step: 5,
    group: '通用',
  },

  /* ---------------------------- 外观 ---------------------------- */
  {
    key: 'appearance.colorMode',
    label: '明暗模式',
    type: 'select',
    default: 'system',
    group: '外观',
    options: [
      { value: 'light', label: '浅色' },
      { value: 'dark', label: '深色' },
      { value: 'system', label: '跟随系统' },
    ],
  },
  {
    key: 'appearance.theme',
    label: '文档主题',
    type: 'select',
    default: 'github',
    group: '外观',
    options: BUILTIN_THEMES,
  },
  {
    key: 'appearance.customTheme',
    label: '自定义主题名称',
    type: 'string',
    default: '',
    group: '外观',
    description: '选择"自定义主题"后生效，填写已导入的 CSS 主题名',
  },
  {
    key: 'appearance.codeTheme',
    label: '代码块高亮主题',
    type: 'select',
    default: 'github',
    group: '外观',
    options: CODE_THEMES,
  },
  {
    key: 'appearance.fontFamily',
    label: '正文字体',
    type: 'string',
    default: '-apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Source Han Sans SC", sans-serif',
    group: '外观',
  },
  {
    key: 'appearance.codeFontFamily',
    label: '代码字体',
    type: 'string',
    default: '"JetBrains Mono", "Fira Code", "Cascadia Code", Consolas, "Courier New", monospace',
    group: '外观',
  },
  {
    key: 'appearance.fontSize',
    label: '正文字号（px）',
    type: 'number',
    default: 16,
    min: 10,
    max: 40,
    step: 1,
    group: '外观',
  },
  {
    key: 'appearance.lineHeight',
    label: '行高',
    type: 'number',
    default: 1.7,
    min: 1,
    max: 3,
    step: 0.05,
    group: '外观',
  },
  {
    key: 'appearance.pageWidth',
    label: '正文页宽（px）',
    type: 'number',
    default: 800,
    min: 480,
    max: 2400,
    step: 20,
    group: '外观',
  },
  {
    key: 'appearance.fullWidth',
    label: '全宽模式',
    type: 'boolean',
    default: false,
    group: '外观',
    description: '开启后正文占满编辑区宽度，不再限制页宽',
  },
  {
    key: 'appearance.paragraphSpacing',
    label: '段落间距（em）',
    type: 'number',
    default: 1,
    min: 0,
    max: 3,
    step: 0.1,
    group: '外观',
  },
  {
    key: 'appearance.showLineNumbers',
    label: '显示行号',
    type: 'boolean',
    default: true,
    group: '外观',
  },
  {
    key: 'appearance.showStatusBar',
    label: '显示状态栏',
    type: 'boolean',
    default: true,
    group: '外观',
  },
  {
    key: 'appearance.sidebarWidth',
    label: '侧边栏宽度（px）',
    type: 'number',
    default: 240,
    min: 180,
    max: 480,
    step: 10,
    group: '外观',
  },

  /* ---------------------------- 编辑器 ---------------------------- */
  {
    key: 'editor.livePreview',
    label: '实时渲染',
    type: 'boolean',
    default: true,
    group: '编辑器',
    description: '关闭后即为纯源码模式，等同于"源码模式"',
  },
  {
    key: 'editor.highlightActiveLine',
    label: '高亮当前行',
    type: 'boolean',
    default: true,
    group: '编辑器',
  },
  {
    key: 'editor.typewriter',
    label: '打字机模式',
    type: 'boolean',
    default: false,
    group: '编辑器',
    description: '当前编辑行始终居中显示',
  },
  {
    key: 'editor.focusMode',
    label: '专注模式',
    type: 'boolean',
    default: false,
    group: '编辑器',
    description: '隐藏侧边栏与状态栏，淡化非当前段落',
  },
  {
    key: 'editor.focusDim',
    label: '专注模式淡化强度',
    type: 'number',
    default: 0.3,
    min: 0.1,
    max: 1,
    step: 0.05,
    group: '编辑器',
    description: '数值越小，非当前段落越淡',
  },
  {
    key: 'editor.autoPair',
    label: '成对符号自动配对',
    type: 'boolean',
    default: true,
    group: '编辑器',
    description: '输入 * ( [ " 等符号时自动补全另一半',
  },
  {
    key: 'editor.smartLists',
    label: '列表智能续写',
    type: 'boolean',
    default: true,
    group: '编辑器',
    description: '回车自动续接列表项，空项回车退出列表',
  },
  {
    key: 'editor.tabSize',
    label: 'Tab 缩进宽度',
    type: 'number',
    default: 4,
    min: 1,
    max: 8,
    step: 1,
    group: '编辑器',
  },
  {
    key: 'editor.softWrap',
    label: '自动换行',
    type: 'boolean',
    default: true,
    group: '编辑器',
  },
  {
    key: 'editor.spellCheck',
    label: '拼写检查',
    type: 'boolean',
    default: false,
    group: '编辑器',
  },
  {
    key: 'editor.showInvisibles',
    label: '显示不可见字符',
    type: 'boolean',
    default: false,
    group: '编辑器',
    description: '显示空格与制表符标记',
  },
  {
    key: 'editor.watchExternalChange',
    label: '监视文件外部改动',
    type: 'boolean',
    default: true,
    group: '编辑器',
    description: '文件被其他程序修改时给出提示',
  },

  /* ---------------------------- 图片 ---------------------------- */
  {
    key: 'image.saveMode',
    label: '图片保存方式',
    type: 'select',
    default: 'relative',
    group: '图片',
    options: [
      { value: 'relative', label: '保存到文档同级的 assets 目录（相对路径）' },
      { value: 'docDir', label: '保存到文档同级目录（相对路径）' },
      { value: 'absolute', label: '保存到指定目录（绝对路径）' },
      { value: 'url', label: '仅插入网络地址，不上传' },
    ],
  },
  {
    key: 'image.savePath',
    label: '图片目录名 / 绝对目录',
    type: 'string',
    default: 'assets',
    group: '图片',
    description: '选择"相对路径"时填写目录名；选择"绝对路径"时填写完整目录',
  },
  {
    key: 'image.nameTemplate',
    label: '图片命名模板',
    type: 'string',
    default: 'image-{yyyy}{MM}{dd}-{hhmmss}-{rand}',
    group: '图片',
    description: '可用占位符：{yyyy} {MM} {dd} {hhmmss} {rand} {name}',
  },
  {
    key: 'image.dedupe',
    label: '相同图片自动去重',
    type: 'boolean',
    default: true,
    group: '图片',
    description: '按 SHA-256 内容哈希判断，重复图片直接复用已有文件',
  },
  {
    key: 'image.defaultAlign',
    label: '插入图片默认对齐',
    type: 'select',
    default: 'center',
    group: '图片',
    options: [
      { value: 'left', label: '左对齐' },
      { value: 'center', label: '居中' },
      { value: 'right', label: '右对齐' },
    ],
  },
  {
    key: 'image.maxWidth',
    label: '图片最大宽度（%）',
    type: 'number',
    default: 100,
    min: 10,
    max: 100,
    step: 5,
    group: '图片',
  },

  /* ---------------------------- 导出 ---------------------------- */
  {
    key: 'export.pageSize',
    label: 'PDF 纸张尺寸',
    type: 'select',
    default: 'A4',
    group: '导出',
    options: [
      { value: 'A4', label: 'A4' },
      { value: 'A3', label: 'A3' },
      { value: 'A5', label: 'A5' },
      { value: 'Letter', label: 'Letter' },
      { value: 'Legal', label: 'Legal' },
      { value: 'Tabloid', label: 'Tabloid' },
    ],
  },
  {
    key: 'export.margin',
    label: 'PDF 页边距',
    type: 'string',
    default: '20mm',
    group: '导出',
    description: '可填写 20mm、1in 等 CSS 长度值',
  },
  {
    key: 'export.withHeaderFooter',
    label: '导出 PDF 时添加页眉页脚',
    type: 'boolean',
    default: false,
    group: '导出',
    description: '页眉显示文档标题，页脚显示页码',
  },
  {
    key: 'export.withStyle',
    label: '导出 HTML 时内联样式',
    type: 'boolean',
    default: true,
    group: '导出',
    description: '关闭后输出纯净的语义化 HTML',
  },
  {
    key: 'export.openAfterExport',
    label: '导出完成后打开文件',
    type: 'boolean',
    default: true,
    group: '导出',
  },
  {
    key: 'export.pngScale',
    label: '导出长图倍率',
    type: 'number',
    default: 2,
    min: 1,
    max: 4,
    step: 1,
    group: '导出',
    description: '数值越大图片越清晰，文件也越大',
  },

  /* ---------------------------- 高级 ---------------------------- */
  {
    key: 'advanced.historyEnabled',
    label: '启用版本历史',
    type: 'boolean',
    default: true,
    group: '高级',
    description: '定期为文档生成本地快照，可随时回滚',
  },
  {
    key: 'advanced.historyInterval',
    label: '快照间隔（分钟）',
    type: 'number',
    default: 5,
    min: 1,
    max: 120,
    step: 1,
    group: '高级',
  },
  {
    key: 'advanced.historyMax',
    label: '每篇文档最多保留快照数',
    type: 'number',
    default: 50,
    min: 5,
    max: 500,
    step: 5,
    group: '高级',
  },
  {
    key: 'advanced.enableIndex',
    label: '启用全文检索索引',
    type: 'boolean',
    default: true,
    group: '高级',
    description: '使用 SQLite FTS5 为工作区文档建立索引，支持全局搜索',
  },
  {
    key: 'advanced.showDevTools',
    label: '显示开发者工具',
    type: 'boolean',
    default: false,
    group: '高级',
  },
];

/** 设置键 -> 定义 的快速索引 */
export const SETTING_MAP: Map<string, SettingDef> = new Map(SETTING_DEFS.map((d) => [d.key, d]));

/** 全部设置项的默认值集合 */
export function defaultSettings(): SettingsMap {
  const out: SettingsMap = {};
  for (const d of SETTING_DEFS) out[d.key] = d.default;
  return out;
}

/** 设置分组在界面上的显示顺序 */
export const SETTING_GROUPS: Array<SettingDef['group']> = [
  '通用',
  '外观',
  '编辑器',
  '图片',
  '导出',
  '高级',
];

/**
 * 把字符串值按定义转换为正确的运行时类型
 * @param def 设置项定义
 * @param raw 原始字符串（来自数据库）
 */
export function coerceSetting(def: SettingDef, raw: string | null | undefined): string | number | boolean {
  if (raw === null || raw === undefined) return def.default;
  switch (def.type) {
    case 'boolean':
      return raw === 'true' || raw === '1';
    case 'number': {
      const n = Number(raw);
      return Number.isFinite(n) ? n : (def.default as number);
    }
    default:
      return raw;
  }
}
