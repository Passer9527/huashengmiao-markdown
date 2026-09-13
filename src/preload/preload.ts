/**
 * 花生苗 Markdown 编辑器 —— 预加载脚本
 * ------------------------------------------------------------------
 * 通过 contextBridge 向渲染进程暴露一个受控的、类型化的 API 对象（window.hsm）。
 *
 * 安全要点：
 *   · 渲染进程无法直接 require Node 模块，也无法直接访问 ipcRenderer；
 *   · 只暴露白名单内的通道，杜绝渲染进程任意调用主进程能力；
 *   · 所有返回值都经过结构化克隆，不传递函数与原生对象。
 *
 * 作者：何飞    联系方式：微信 6731663
 * 开源协议：MIT
 */

import { contextBridge, ipcRenderer, webUtils } from 'electron';

/** 生成一个"订阅主进程事件"的函数，返回取消订阅的回调 */
function subscribe<T = unknown>(channel: string) {
  return (cb: (payload: T) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: T) => cb(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  };
}

/** 暴露给渲染进程的 API */
const api = {
  /* ---------------------------- 应用 ---------------------------- */
  app: {
    info: () => ipcRenderer.invoke('app:info'),
    quit: () => ipcRenderer.invoke('app:quit'),
    relaunch: () => ipcRenderer.invoke('app:relaunch'),
    toggleDevTools: () => ipcRenderer.invoke('app:toggle-devtools'),
    openUserData: () => ipcRenderer.invoke('app:open-user-data'),
    openLogDir: () => ipcRenderer.invoke('app:open-log-dir'),
    newWindow: (file?: string) => ipcRenderer.invoke('app:new-window', file),
    /** 原生菜单点击后广播的命令 */
    onCommand: subscribe<{ commandId: string; payload?: unknown }>('app:command'),
    /** 外部请求打开文件（文件关联、二次启动、拖到图标上） */
    onOpenFileRequest: subscribe<string>('app:open-file-request'),
  },

  /* ---------------------------- 窗口 ---------------------------- */
  win: {
    minimize: () => ipcRenderer.invoke('win:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('win:toggle-maximize'),
    close: () => ipcRenderer.invoke('win:close'),
    confirmClose: () => ipcRenderer.invoke('win:confirm-close'),
    isMaximized: () => ipcRenderer.invoke('win:is-maximized'),
    setTitle: (title: string) => ipcRenderer.invoke('win:set-title', title),
    setFullScreen: (flag: boolean) => ipcRenderer.invoke('win:set-fullscreen', flag),
    isFullScreen: () => ipcRenderer.invoke('win:is-fullscreen'),
    onMaximizeChange: subscribe<boolean>('win:maximize-changed'),
    onFullScreenChange: subscribe<boolean>('win:fullscreen-changed'),
    onCloseRequest: subscribe<void>('win:close-request'),
  },

  /* ---------------------------- 文件系统 ---------------------------- */
  fs: {
    openFile: () => ipcRenderer.invoke('fs:open-file'),
    openFileByPath: (p: string) => ipcRenderer.invoke('fs:open-file-by-path', p),
    openFolder: () => ipcRenderer.invoke('fs:open-folder'),
    openFolderByPath: (p: string) => ipcRenderer.invoke('fs:open-folder-by-path', p),
    readTree: (root: string, depth?: number) => ipcRenderer.invoke('fs:read-tree', root, depth),
    readFile: (p: string) => ipcRenderer.invoke('fs:read-file', p),
    writeFile: (p: string, content: string) => ipcRenderer.invoke('fs:write-file', p, content),
    saveAsDialog: (defaultPath: string) => ipcRenderer.invoke('fs:save-as-dialog', defaultPath),
    createFile: (dir: string, name: string) => ipcRenderer.invoke('fs:create-file', dir, name),
    createFolder: (dir: string, name: string) => ipcRenderer.invoke('fs:create-folder', dir, name),
    rename: (oldPath: string, newName: string) => ipcRenderer.invoke('fs:rename', oldPath, newName),
    remove: (p: string) => ipcRenderer.invoke('fs:remove', p),
    move: (from: string, toDir: string) => ipcRenderer.invoke('fs:move', from, toDir),
    exists: (p: string) => ipcRenderer.invoke('fs:exists', p),
    showInFolder: (p: string) => ipcRenderer.invoke('fs:show-in-folder', p),
    isMarkdown: (p: string) => ipcRenderer.invoke('fs:is-markdown', p),
    watch: (p: string) => ipcRenderer.invoke('fs:watch', p),
    unwatch: (p: string) => ipcRenderer.invoke('fs:unwatch', p),
    onFileChanged: subscribe<string>('fs:file-changed'),
    /**
     * 获取拖拽进来的文件的真实磁盘路径
     * Electron 32+ 移除了 File.path，必须通过 webUtils 获取
     */
    getPathForFile: (file: File): string => {
      try {
        return webUtils.getPathForFile(file);
      } catch {
        return '';
      }
    },
  },

  /* ---------------------------- 最近文件 ---------------------------- */
  recent: {
    list: () => ipcRenderer.invoke('recent:list'),
    add: (p: string) => ipcRenderer.invoke('recent:add', p),
    remove: (p: string) => ipcRenderer.invoke('recent:remove', p),
    clear: () => ipcRenderer.invoke('recent:clear'),
  },

  /* ---------------------------- 设置 ---------------------------- */
  settings: {
    all: () => ipcRenderer.invoke('settings:all'),
    defs: () => ipcRenderer.invoke('settings:defs'),
    set: (key: string, value: string | number | boolean) => ipcRenderer.invoke('settings:set', key, value),
    setMany: (values: Record<string, string | number | boolean>) =>
      ipcRenderer.invoke('settings:set-many', values),
    reset: () => ipcRenderer.invoke('settings:reset'),
  },

  /* ---------------------------- 快捷键 ---------------------------- */
  shortcuts: {
    list: () => ipcRenderer.invoke('shortcuts:list'),
    set: (commandId: string, keybinding: string) =>
      ipcRenderer.invoke('shortcuts:set', commandId, keybinding),
    resetOne: (commandId: string) => ipcRenderer.invoke('shortcuts:reset-one', commandId),
    resetAll: () => ipcRenderer.invoke('shortcuts:reset-all'),
    conflicts: () => ipcRenderer.invoke('shortcuts:conflicts'),
    exportFile: () => ipcRenderer.invoke('shortcuts:export'),
    importFile: () => ipcRenderer.invoke('shortcuts:import'),
  },

  /* ---------------------------- 图片 ---------------------------- */
  image: {
    saveFromBuffer: (data: Uint8Array, ext: string, docPath: string) =>
      ipcRenderer.invoke('image:save-buffer', data, ext, docPath),
    saveFromPath: (srcPath: string, docPath: string) =>
      ipcRenderer.invoke('image:save-path', srcPath, docPath),
    pickAndSave: (docPath: string) => ipcRenderer.invoke('image:pick-and-save', docPath),
    mimeToExt: (mime: string) => ipcRenderer.invoke('image:mime-to-ext', mime),
  },

  /* ---------------------------- 导出 ---------------------------- */
  exporter: {
    /** 传入已渲染的正文 HTML（或 Pandoc 分支的原始 Markdown） */
    run: (options: unknown, outputPath: string) => ipcRenderer.invoke('export:run', options, outputPath),
    pickOutputPath: (format: string, defaultName: string) =>
      ipcRenderer.invoke('export:pick-output', format, defaultName),
  },

  /* ---------------------------- 搜索 ---------------------------- */
  search: {
    index: (docPath: string, title: string, content: string) =>
      ipcRenderer.invoke('search:index', docPath, title, content),
    remove: (docPath: string) => ipcRenderer.invoke('search:remove', docPath),
    query: (keyword: string, limit?: number) => ipcRenderer.invoke('search:query', keyword, limit),
    rebuild: (root: string) => ipcRenderer.invoke('search:rebuild', root),
    onProgress: subscribe<{ done: number; total: number }>('search:progress'),
  },

  /* ---------------------------- 版本历史 ---------------------------- */
  history: {
    snapshot: (docPath: string, content: string) => ipcRenderer.invoke('history:snapshot', docPath, content),
    list: (docPath: string) => ipcRenderer.invoke('history:list', docPath),
    content: (id: number) => ipcRenderer.invoke('history:content', id),
    restore: (id: number, currentContent: string) =>
      ipcRenderer.invoke('history:restore', id, currentContent),
  },

  /* ---------------------------- 对话框 ---------------------------- */
  dialog: {
    message: (type: string, title: string, message: string, buttons: string[]) =>
      ipcRenderer.invoke('dialog:message', type, title, message, buttons),
    confirmUnsaved: (fileName: string) => ipcRenderer.invoke('dialog:confirm-unsaved', fileName),
  },

  /* ---------------------------- 系统交互 ---------------------------- */
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
    openPath: (p: string) => ipcRenderer.invoke('shell:open-path', p),
  },

  /* ---------------------------- 自定义主题 ---------------------------- */
  theme: {
    customList: () => ipcRenderer.invoke('theme:custom-list'),
    importCss: () => ipcRenderer.invoke('theme:import-css'),
    remove: (name: string) => ipcRenderer.invoke('theme:remove', name),
  },

  /* ---------------------------- 会话恢复 ---------------------------- */
  session: {
    get: (key: string) => ipcRenderer.invoke('session:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('session:set', key, value),
  },

  /* ---------------------------- 数据维护 ---------------------------- */
  db: {
    info: () => ipcRenderer.invoke('db:info'),
    vacuum: () => ipcRenderer.invoke('db:vacuum'),
  },

  /* ---------------------------- 自动化调试 ---------------------------- */
  debug: {
    /**
     * 把当前窗口截图写入磁盘。
     * 仅在设置了环境变量 HSM_SHOT_DIR 时有效，用于自动化测试与文档配图。
     */
    capture: (name: string) => ipcRenderer.invoke('debug:capture', name),
  },
};

// 通过 contextBridge 暴露给页面（页面只能看到 window.hsm）
contextBridge.exposeInMainWorld('hsm', api);

/** 预加载脚本自身的类型，供渲染进程 import 使用 */
export type HsmPreloadApi = typeof api;
