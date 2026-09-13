/**
 * 花生苗 Markdown 编辑器 —— 应用菜单
 * ------------------------------------------------------------------
 * 菜单策略说明：
 *   · macOS：必须提供应用菜单，否则 ⌘Q、⌘C/⌘V 等系统级快捷键不可用，
 *            因此这里构建完整的原生菜单（中文）；
 *   · Windows / Linux：界面采用自绘标题栏，不显示系统菜单栏。
 *            所有功能快捷键由渲染进程统一处理（便于用户自定义），
 *            因此这里把应用菜单置空，避免出现多余的菜单栏。
 *
 * 作者：何飞    联系方式：微信 6731663
 * 开源协议：MIT
 */

import { Menu, app, shell, dialog, type MenuItemConstructorOptions } from 'electron';
import { isMac, getAllWindows } from './window';
import { getLogDir } from './services/logger';

/** 应用名称 */
const APP_NAME = '花生苗 Markdown 编辑器';

/** 作者信息 */
const AUTHOR_INFO = {
  name: '花生苗 Markdown 编辑器',
  author: '何飞',
  contact: '微信：6731663',
  license: 'MIT 开源协议',
  desc: '一款开源免费、所见即所得（Typora 类）的跨平台 Markdown 编辑器',
};

/**
 * 安装应用菜单
 * @param onCommand 菜单项被点击时的回调，参数为命令 ID
 */
export function installApplicationMenu(onCommand: (commandId: string, payload?: unknown) => void): void {
  if (!isMac()) {
    // Windows / Linux：不显示菜单栏，快捷键由渲染进程接管
    Menu.setApplicationMenu(null);
    return;
  }

  const send = (id: string) => () => onCommand(id);

  const template: MenuItemConstructorOptions[] = [
    {
      label: APP_NAME,
      submenu: [
        {
          label: `关于 ${APP_NAME}`,
          click: () => showAboutDialog(),
        },
        { type: 'separator' },
        { label: '偏好设置…', accelerator: 'Cmd+,', click: send('file.settings') },
        { label: '快捷键设置…', click: send('help.shortcuts') },
        { type: 'separator' },
        { role: 'services', label: '服务' },
        { type: 'separator' },
        { role: 'hide', label: `隐藏 ${APP_NAME}` },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '全部显示' },
        { type: 'separator' },
        { role: 'quit', label: `退出 ${APP_NAME}` },
      ],
    },
    {
      label: '文件',
      submenu: [
        { label: '新建文件', accelerator: 'Cmd+N', click: send('file.new') },
        { label: '新建窗口', accelerator: 'Cmd+Shift+N', click: send('file.newWindow') },
        { type: 'separator' },
        { label: '打开文件…', accelerator: 'Cmd+O', click: send('file.open') },
        { label: '打开文件夹…', accelerator: 'Cmd+Shift+O', click: send('file.openFolder') },
        { label: '快速打开…', accelerator: 'Cmd+P', click: send('file.quickOpen') },
        { type: 'separator' },
        { label: '保存', accelerator: 'Cmd+S', click: send('file.save') },
        { label: '另存为…', accelerator: 'Cmd+Shift+S', click: send('file.saveAs') },
        { type: 'separator' },
        { label: '导出为 HTML…', click: send('file.exportHtml') },
        { label: '导出为 PDF…', click: send('file.exportPdf') },
        { label: '导出为图片（长图）…', click: send('file.exportPng') },
        { type: 'separator' },
        { role: 'close', label: '关闭标签' },
        { role: 'close', label: '关闭窗口' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        // 使用系统角色，保证输入框内的剪切复制粘贴行为符合 macOS 规范
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'pasteAndMatchStyle', label: '粘贴为纯文本' },
        { role: 'delete', label: '删除' },
        { role: 'selectAll', label: '全选' },
        { type: 'separator' },
        { label: '查找…', accelerator: 'Cmd+F', click: send('edit.find') },
        { label: '替换…', accelerator: 'Cmd+H', click: send('edit.replace') },
      ],
    },
    {
      label: '格式',
      submenu: [
        { label: '加粗', accelerator: 'Cmd+B', click: send('format.bold') },
        { label: '斜体', accelerator: 'Cmd+I', click: send('format.italic') },
        { label: '删除线', click: send('format.strike') },
        { label: '行内代码', click: send('format.inlineCode') },
        { label: '高亮', click: send('format.highlight') },
        { type: 'separator' },
        { label: '一级标题', accelerator: 'Cmd+1', click: send('format.h1') },
        { label: '二级标题', accelerator: 'Cmd+2', click: send('format.h2') },
        { label: '三级标题', accelerator: 'Cmd+3', click: send('format.h3') },
        { label: '普通段落', accelerator: 'Cmd+0', click: send('format.paragraph') },
        { type: 'separator' },
        { label: '引用', click: send('format.quote') },
        { label: '代码块', click: send('format.codeBlock') },
        { label: '公式块', click: send('format.mathBlock') },
        { label: '表格', click: send('format.table') },
        { label: '分割线', click: send('format.hr') },
        { type: 'separator' },
        { label: '插入链接…', accelerator: 'Cmd+K', click: send('format.link') },
        { label: '插入图片…', accelerator: 'Cmd+Shift+I', click: send('format.image') },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '切换源码 / 实时预览', accelerator: 'Cmd+/', click: send('view.toggleSource') },
        { type: 'separator' },
        { label: '专注模式', click: send('view.focusMode') },
        { label: '打字机模式', click: send('view.typewriter') },
        { role: 'togglefullscreen', label: '全屏' },
        { type: 'separator' },
        { label: '显示 / 隐藏侧边栏', click: send('view.toggleSidebar') },
        { label: '大纲', click: send('view.outline') },
        { label: '文件树', click: send('view.fileTree') },
        { label: '全局搜索', click: send('view.searchPanel') },
        { type: 'separator' },
        { label: '放大字号', click: send('view.zoomIn') },
        { label: '缩小字号', click: send('view.zoomOut') },
        { label: '恢复默认字号', click: send('view.zoomReset') },
        { type: 'separator' },
        { role: 'resetZoom', label: '重置界面缩放' },
        { role: 'zoomIn', label: '界面放大' },
        { role: 'zoomOut', label: '界面缩小' },
        { type: 'separator' },
        { role: 'toggleDevTools', label: '开发者工具' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        { type: 'separator' },
        { role: 'front', label: '前置全部窗口' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: '快捷键查询', accelerator: 'F1', click: send('help.shortcuts') },
        { label: 'Markdown 语法速查', click: send('help.markdown') },
        { label: '用户手册', click: send('help.userManual') },
        { type: 'separator' },
        { label: '打开日志目录', click: () => shell.openPath(getLogDir()).catch(() => undefined) },
        { label: '打开数据目录', click: () => shell.openPath(app.getPath('userData')).catch(() => undefined) },
        { type: 'separator' },
        { label: `关于 ${APP_NAME}`, click: () => showAboutDialog() },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** 弹出"关于"对话框（macOS 菜单使用；Windows / Linux 由渲染进程自绘关于窗口） */
export function showAboutDialog(): void {
  const win = getAllWindows()[0] ?? null;
  const detail = [
    AUTHOR_INFO.desc,
    '',
    `版本：${app.getVersion()}`,
    `作者：${AUTHOR_INFO.author}`,
    `联系方式：${AUTHOR_INFO.contact}`,
    `开源协议：${AUTHOR_INFO.license}`,
    '',
    `Electron：${process.versions.electron}`,
    `Chromium：${process.versions.chrome}`,
    `Node.js：${process.versions.node}`,
  ].join('\n');

  const opts = {
    type: 'info' as const,
    title: '关于',
    message: AUTHOR_INFO.name,
    detail,
    buttons: ['确定'],
    noLink: true,
  };

  if (win) void dialog.showMessageBox(win, opts);
  else void dialog.showMessageBox(opts);
}
