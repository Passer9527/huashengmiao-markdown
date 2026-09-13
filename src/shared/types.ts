/**
 * 花生苗 Markdown 编辑器 —— 主进程与渲染进程共享的类型定义
 * ------------------------------------------------------------------
 * 本文件定义 IPC 契约、数据结构与常量，主进程与渲染进程均引用，
 * 保证两端接口一致、类型安全。
 *
 * 作者：何飞    联系方式：微信 6731663
 * 开源协议：MIT
 */

/* ============================ 应用信息 ============================ */

/** 应用基本信息（关于对话框使用） */
export interface AppInfo {
  /** 软件名称 */
  name: string;
  /** 版本号 */
  version: string;
  /** Electron 版本 */
  electron: string;
  /** Chromium 版本 */
  chrome: string;
  /** Node 版本 */
  node: string;
  /** 作者 */
  author: string;
  /** 联系方式 */
  contact: string;
  /** 开源协议 */
  license: string;
  /** 项目主页 */
  homepage: string;
  /** 构建时间 */
  buildTime: string;
  /** 当前平台 */
  platform: NodeJS.Platform;
  /** 用户数据目录 */
  userDataPath: string;
}

/* ============================ 文件系统 ============================ */

/** 目录树节点 */
export interface FileNode {
  /** 文件或文件夹名称 */
  name: string;
  /** 绝对路径 */
  path: string;
  /** 节点类型 */
  type: 'file' | 'folder';
  /** 文件字节数 */
  size?: number;
  /** 最后修改时间（毫秒时间戳） */
  mtime?: number;
  /** 子节点（仅文件夹） */
  children?: FileNode[];
  /** 是否为 Markdown 文件 */
  isMarkdown?: boolean;
}

/** 打开文件的结果 */
export interface OpenedFile {
  /** 绝对路径 */
  path: string;
  /** 文件内容 */
  content: string;
  /** 文件编码 */
  encoding: string;
  /** 换行符类型 */
  eol: 'LF' | 'CRLF';
  /** 字节数 */
  size: number;
  /** 最后修改时间 */
  mtime: number;
}

/** 工作区信息 */
export interface WorkspaceInfo {
  /** 工作区根目录绝对路径 */
  root: string;
  /** 根目录名称 */
  name: string;
  /** 目录树 */
  tree: FileNode;
}

/** 最近打开的文件记录 */
export interface RecentFile {
  /** 文件绝对路径 */
  path: string;
  /** 文件标题 */
  title: string;
  /** 最近打开时间（ISO 字符串） */
  openedAt: string;
  /** 累计打开次数 */
  openCount: number;
  /** 文件是否仍然存在 */
  exists?: boolean;
}

/* ============================ 设置项 ============================ */

/** 应用设置（键值对，value 类型由 SETTING_DEFS 决定） */
export type SettingsMap = Record<string, string | number | boolean>;

/** 单个设置的元信息定义 */
export interface SettingDef {
  /** 设置键名 */
  key: string;
  /** 显示名称 */
  label: string;
  /** 说明文字 */
  description?: string;
  /** 值类型 */
  type: 'string' | 'number' | 'boolean' | 'select' | 'color';
  /** 默认值 */
  default: string | number | boolean;
  /** 取值范围（数字型） */
  min?: number;
  max?: number;
  step?: number;
  /** 可选值（select 型） */
  options?: Array<{ value: string; label: string }>;
  /** 所属分组 */
  group: '通用' | '外观' | '编辑器' | '图片' | '导出' | '高级';
}

/* ============================ 快捷键 ============================ */

/** 快捷键绑定记录 */
export interface ShortcutBinding {
  /** 命令唯一标识，如 editor.bold */
  commandId: string;
  /** 命令显示名称 */
  commandName: string;
  /** 所属分类 */
  category: string;
  /** 当前绑定的按键组合，如 Ctrl+B；空字符串表示未绑定 */
  keybinding: string;
  /** 默认按键组合 */
  defaultKeybinding: string;
  /** 是否为用户自定义 */
  customized: boolean;
}

/** 快捷键冲突信息 */
export interface ShortcutConflict {
  /** 冲突的按键组合 */
  keybinding: string;
  /** 占用该组合的命令列表 */
  commandIds: string[];
}

/* ============================ 导出 ============================ */

/** 支持的导出格式 */
export type ExportFormat = 'html' | 'html-plain' | 'pdf' | 'png' | 'docx' | 'latex' | 'epub' | 'rtf';

/** 导出参数 */
export interface ExportOptions {
  /** 目标格式 */
  format: ExportFormat;
  /** 文档绝对路径（用于解析相对图片） */
  docPath: string;
  /** 文档标题 */
  title: string;
  /** 已渲染好的 HTML 片段（正文） */
  html: string;
  /** PDF 纸张尺寸 */
  pageSize?: string;
  /** PDF 页边距 */
  margin?: string;
  /** 是否导出页眉页脚 */
  withHeaderFooter?: boolean;
  /** 是否内联样式 */
  withStyle?: boolean;
  /** 使用的主题名 */
  theme?: string;
}

/** 导出结果 */
export interface ExportResult {
  /** 是否成功 */
  ok: boolean;
  /** 输出文件绝对路径 */
  outputPath?: string;
  /** 输出文件大小 */
  fileSize?: number;
  /** 失败原因 */
  error?: string;
}

/* ============================ 图片 ============================ */

/** 图片保存结果 */
export interface ImageSaveResult {
  /** 是否成功 */
  ok: boolean;
  /** 相对于文档目录的路径（用于写入 Markdown） */
  relativePath?: string;
  /** 绝对路径 */
  absolutePath?: string;
  /** 图片宽度 */
  width?: number;
  /** 图片高度 */
  height?: number;
  /** 是否命中已存在的相同图片（去重） */
  deduplicated?: boolean;
  /** 失败原因 */
  error?: string;
}

/* ============================ 版本历史 ============================ */

/** 版本快照摘要 */
export interface VersionSummary {
  /** 快照主键 */
  id: number;
  /** 所属文档路径 */
  docPath: string;
  /** 版本序号 */
  versionNo: number;
  /** 内容字节数 */
  sizeBytes: number;
  /** 创建时间 */
  createdAt: string;
}

/* ============================ 全文搜索 ============================ */

/** 搜索结果条目 */
export interface SearchHit {
  /** 文档路径 */
  docPath: string;
  /** 文档标题 */
  title: string;
  /** 命中片段（含高亮标记） */
  snippet: string;
  /** 命中的行号 */
  line: number;
}

/* ============================ 对话框 ============================ */

/** 消息对话框类型 */
export type MessageType = 'info' | 'warning' | 'error' | 'question';

/** 消息对话框返回的按钮索引 */
export type MessageResult = number;

/* ============================ 主题 ============================ */

/** 自定义主题文件 */
export interface CustomTheme {
  /** 主题名称（文件名去扩展名） */
  name: string;
  /** CSS 内容 */
  css: string;
  /** 文件路径 */
  path: string;
}

/* ============================ Tauri/Electron 桥接 API ============================ */

/** 暴露给渲染进程的完整 API 契约 */
export interface HsmApi {
  app: {
    info(): Promise<AppInfo>;
    quit(): Promise<void>;
    relaunch(): Promise<void>;
    toggleDevTools(): Promise<void>;
    openUserData(): Promise<void>;
    openLogDir(): Promise<void>;
    newWindow(file?: string): Promise<void>;
    /** 原生菜单点击后广播的命令 */
    onCommand(cb: (payload: { commandId: string; payload?: unknown }) => void): () => void;
    /** 外部请求打开文件（文件关联、二次启动、拖到图标上） */
    onOpenFileRequest(cb: (path: string) => void): () => void;
  };
  win: {
    minimize(): Promise<void>;
    toggleMaximize(): Promise<boolean>;
    close(): Promise<void>;
    isMaximized(): Promise<boolean>;
    setTitle(title: string): Promise<void>;
    setFullScreen(flag: boolean): Promise<boolean>;
    isFullScreen(): Promise<boolean>;
    /** 渲染进程确认可以关闭窗口 */
    confirmClose(): Promise<void>;
    /** 订阅窗口最大化状态变化，返回取消订阅函数 */
    onMaximizeChange(cb: (maximized: boolean) => void): () => void;
    onFullScreenChange(cb: (full: boolean) => void): () => void;
    /** 订阅"请求关闭窗口"事件（用于拦截未保存提示） */
    onCloseRequest(cb: () => void): () => void;
  };
  fs: {
    openFile(): Promise<OpenedFile | null>;
    openFileByPath(path: string): Promise<OpenedFile | null>;
    openFolder(): Promise<WorkspaceInfo | null>;
    openFolderByPath(path: string): Promise<WorkspaceInfo | null>;
    readTree(root: string, depth?: number): Promise<FileNode>;
    readFile(path: string): Promise<OpenedFile>;
    writeFile(path: string, content: string): Promise<{ ok: boolean; mtime: number; error?: string }>;
    saveAsDialog(defaultPath: string): Promise<string | null>;
    createFile(dir: string, name: string): Promise<{ ok: boolean; path?: string; error?: string }>;
    createFolder(dir: string, name: string): Promise<{ ok: boolean; path?: string; error?: string }>;
    rename(oldPath: string, newName: string): Promise<{ ok: boolean; path?: string; error?: string }>;
    remove(path: string): Promise<{ ok: boolean; error?: string }>;
    move(from: string, toDir: string): Promise<{ ok: boolean; path?: string; error?: string }>;
    exists(path: string): Promise<boolean>;
    showInFolder(path: string): Promise<void>;
    isMarkdown(path: string): Promise<boolean>;
    /** 监听文件被外部修改 */
    watch(path: string): Promise<void>;
    unwatch(path: string): Promise<void>;
    onFileChanged(cb: (path: string) => void): () => void;
    /** 获取拖拽进来的文件在磁盘上的真实路径 */
    getPathForFile(file: File): string;
  };
  recent: {
    list(): Promise<RecentFile[]>;
    add(path: string): Promise<void>;
    remove(path: string): Promise<void>;
    clear(): Promise<void>;
  };
  settings: {
    all(): Promise<SettingsMap>;
    defs(): Promise<SettingDef[]>;
    set(key: string, value: string | number | boolean): Promise<void>;
    setMany(values: SettingsMap): Promise<void>;
    reset(): Promise<SettingsMap>;
  };
  shortcuts: {
    list(): Promise<ShortcutBinding[]>;
    set(commandId: string, keybinding: string): Promise<{ ok: boolean; conflict?: ShortcutConflict; error?: string }>;
    resetOne(commandId: string): Promise<void>;
    resetAll(): Promise<ShortcutBinding[]>;
    conflicts(): Promise<ShortcutConflict[]>;
    exportFile(): Promise<string | null>;
    importFile(): Promise<{ ok: boolean; count?: number; error?: string }>;
  };
  image: {
    saveFromBuffer(data: Uint8Array, ext: string, docPath: string): Promise<ImageSaveResult>;
    saveFromPath(srcPath: string, docPath: string): Promise<ImageSaveResult>;
    pickAndSave(docPath: string): Promise<ImageSaveResult>;
    /** 根据 MIME 类型推断图片扩展名 */
    mimeToExt(mime: string): Promise<string>;
  };
  exporter: {
    run(options: ExportOptions, outputPath: string): Promise<ExportResult>;
    pickOutputPath(format: string, defaultName: string): Promise<string | null>;
  };
  search: {
    index(docPath: string, title: string, content: string): Promise<void>;
    remove(docPath: string): Promise<void>;
    query(keyword: string, limit?: number): Promise<SearchHit[]>;
    /** 重建整个工作区的索引 */
    rebuild(root: string): Promise<number>;
    onProgress(cb: (payload: { done: number; total: number }) => void): () => void;
  };
  history: {
    snapshot(docPath: string, content: string): Promise<void>;
    list(docPath: string): Promise<VersionSummary[]>;
    content(id: number): Promise<string | null>;
    restore(id: number, currentContent: string): Promise<string | null>;
  };
  dialog: {
    message(type: MessageType, title: string, message: string, buttons: string[]): Promise<MessageResult>;
    confirmUnsaved(fileName: string): Promise<'save' | 'discard' | 'cancel'>;
  };
  shell: {
    openExternal(url: string): Promise<void>;
    openPath(path: string): Promise<void>;
  };
  theme: {
    customList(): Promise<CustomTheme[]>;
    importCss(): Promise<CustomTheme | null>;
    remove(name: string): Promise<void>;
  };
  session: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
  };
  db: {
    info(): Promise<Array<{ name: string; label: string; count: number }>>;
    vacuum(): Promise<{ ok: boolean }>;
  };
  debug: {
    /** 自动化截图；未设置 HSM_SHOT_DIR 环境变量时返回 null */
    capture(name: string): Promise<string | null>;
  };
}

declare global {
  interface Window {
    /** 由 preload 注入的桥接 API */
    hsm: HsmApi;
    /** 构建期注入的版本号 */
    __APP_VERSION__: string;
    __APP_NAME__: string;
    __APP_AUTHOR__: string;
    __APP_CONTACT__: string;
    __APP_HOMEPAGE__: string;
    __BUILD_TIME__: string;
  }
}
