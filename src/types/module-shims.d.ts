/**
 * 花生苗 Markdown 编辑器 —— 第三方模块类型补充声明
 * ------------------------------------------------------------------
 * 部分 markdown-it 插件未自带 TypeScript 类型声明，
 * 这里统一补充，避免在业务代码中到处写类型断言。
 *
 * 作者：何飞    联系方式：微信 6731663
 * 开源协议：MIT
 */

declare module 'markdown-it-footnote' {
  import type MarkdownIt from 'markdown-it';
  const plugin: MarkdownIt.PluginSimple;
  export default plugin;
}

declare module 'markdown-it-task-lists' {
  import type MarkdownIt from 'markdown-it';
  interface TaskListsOptions {
    /** 是否将复选框渲染为可点击的 input */
    enabled?: boolean;
    /** 是否在复选框外包裹 label */
    label?: boolean;
    /** label 是否位于复选框之后 */
    labelAfter?: boolean;
  }
  const plugin: MarkdownIt.PluginWithOptions<TaskListsOptions>;
  export default plugin;
}

declare module 'markdown-it-mark' {
  import type MarkdownIt from 'markdown-it';
  const plugin: MarkdownIt.PluginSimple;
  export default plugin;
}

declare module 'markdown-it-sub' {
  import type MarkdownIt from 'markdown-it';
  const plugin: MarkdownIt.PluginSimple;
  export default plugin;
}

declare module 'markdown-it-sup' {
  import type MarkdownIt from 'markdown-it';
  const plugin: MarkdownIt.PluginSimple;
  export default plugin;
}

declare module 'markdown-it-deflist' {
  import type MarkdownIt from 'markdown-it';
  const plugin: MarkdownIt.PluginSimple;
  export default plugin;
}

declare module 'markdown-it-emoji' {
  import type MarkdownIt from 'markdown-it';
  /** 完整表情集合 */
  export const full: MarkdownIt.PluginSimple;
  /** 精简表情集合（仅常用表情短代码） */
  export const light: MarkdownIt.PluginSimple;
  /** 裸表情（不经短代码，直接把 Unicode 表情转为节点） */
  export const bare: MarkdownIt.PluginSimple;
}
