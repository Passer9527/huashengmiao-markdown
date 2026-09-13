/**
 * 花生苗 Markdown 编辑器 —— Shiki 按需加载与渲染调度
 * ------------------------------------------------------------------
 * 职责：
 *   1. 按需注入 shiki.js（首次遇到代码块时才加载，避免拖慢启动）；
 *   2. 缓存渲染结果，滚动时重建 DOM 可直接复用；
 *   3. Shiki 未就绪时先用 highlight.js 渲染，就绪后广播事件让界面升级，
 *      因此用户从第一帧起就能看到高亮，不会出现"先白后彩"的闪烁。
 *
 * 作者：何飞    联系方式：微信 6731663
 * 开源协议：MIT
 */

import hljs from 'highlight.js/lib/common';

/** HTML 转义（本模块自带一份，避免与 markdown.ts 形成循环引用） */
function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Shiki 模块的最小接口 */
interface ShikiLike {
  highlight(code: string, lang: string, themeId: string): string | null;
  loadedLanguages(): string[];
}

/** 全局 Shiki 实例（由 shiki.js 注入） */
let shikiInstance: ShikiLike | null = null;

/** 脚本注入 Promise */
let loadingPromise: Promise<ShikiLike | null> | null = null;

/** 渲染结果缓存：`主题|语言|代码` -> HTML */
const renderCache = new Map<string, string>();

/** 缓存上限 */
const MAX_CACHE = 120;

/** 是否已经加载过（无论成功与否，避免重复注入） */
let loadAttempted = false;

/**
 * 按需加载 Shiki
 * @returns Shiki 实例；加载失败返回 null（调用方回退到 highlight.js）
 */
export function loadShiki(): Promise<ShikiLike | null> {
  if (shikiInstance) return Promise.resolve(shikiInstance);
  if (loadingPromise) return loadingPromise;
  if (loadAttempted) return Promise.resolve(null);
  loadAttempted = true;

  loadingPromise = new Promise<ShikiLike | null>((resolve) => {
    const globalRef = window as unknown as { __HSM_SHIKI__?: ShikiLike };

    // 已经就绪（例如另一个代码块先触发了加载）
    if (globalRef.__HSM_SHIKI__) {
      shikiInstance = globalRef.__HSM_SHIKI__;
      resolve(shikiInstance);
      return;
    }

    const script = document.createElement('script');
    script.src = './shiki.js';
    script.async = true;

    // Shiki 需要初始化语法引擎，给足超时时间；失败则永久回退
    const timeout = window.setTimeout(() => resolve(null), 15000);

    const ready = (): void => {
      window.clearTimeout(timeout);
      window.removeEventListener('hsm:shiki-ready', ready);
      shikiInstance = globalRef.__HSM_SHIKI__ ?? null;
      resolve(shikiInstance);
    };

    window.addEventListener('hsm:shiki-ready', ready);

    script.onload = () => {
      // 脚本已加载但引擎可能仍在初始化，等 hsm:shiki-ready 事件即可
      if (globalRef.__HSM_SHIKI__) {
        // 探测一次：能返回结果说明已就绪
        try {
          if (globalRef.__HSM_SHIKI__.loadedLanguages().length > 0) ready();
        } catch {
          /* 继续等待事件 */
        }
      }
    };

    script.onerror = () => {
      window.clearTimeout(timeout);
      window.removeEventListener('hsm:shiki-ready', ready);
      resolve(null);
    };

    document.head.appendChild(script);
  });

  return loadingPromise;
}

/** Shiki 是否已经就绪 */
export function isShikiReady(): boolean {
  return shikiInstance !== null;
}

/** 清空缓存（切换主题时调用） */
export function clearShikiCache(): void {
  renderCache.clear();
}

/**
 * 渲染代码块为 HTML
 *
 * 优先使用 Shiki 以获得精细的语法分类；Shiki 尚未就绪或语言不支持时，
 * 回退到 highlight.js，保证任何时刻都有高亮结果。
 *
 * @param code 代码内容
 * @param lang 语言标识
 * @param themeId 代码主题标识
 */
export function renderCodeBlockHtml(code: string, lang: string, themeId: string): string {
  const language = (lang || '').trim().split(/\s+/)[0].toLowerCase();

  // Mermaid 交由图表渲染器处理
  if (language === 'mermaid' || language === 'mmd') return '';

  if (shikiInstance) {
    const key = `${themeId}|${language}|${code}`;
    const cached = renderCache.get(key);
    if (cached !== undefined) return cached;

    const shikiHtml = shikiInstance.highlight(code, language, themeId);
    if (shikiHtml) {
      // Shiki 输出的 <pre> 自带样式，这里只取其中的 <code> 内容
      const inner = extractCodeInner(shikiHtml);
      putCache(key, inner);
      return inner;
    }
  }

  // 回退：highlight.js
  return highlightWithHljs(code, language);
}

/** 从 Shiki 的输出中取出 <code> 内部内容 */
function extractCodeInner(html: string): string {
  const m = /<code[^>]*>([\s\S]*?)<\/code>/.exec(html);
  return m ? m[1] : html;
}

/** 写入缓存（超限时清理最早条目） */
function putCache(key: string, value: string): void {
  if (renderCache.size >= MAX_CACHE) {
    const first = renderCache.keys().next().value;
    if (first !== undefined) renderCache.delete(first);
  }
  renderCache.set(key, value);
}

/**
 * 使用 highlight.js 渲染（回退方案）
 * @param code 代码内容
 * @param language 语言标识（小写）
 */
export function highlightWithHljs(code: string, language: string): string {
  if (language && hljs.getLanguage(language)) {
    try {
      return hljs.highlight(code, { language, ignoreIllegals: true }).value;
    } catch {
      return escapeHtml(code);
    }
  }
  if (language) {
    // 语言标识存在但未收录，尝试自动识别
    try {
      return hljs.highlightAuto(code).value;
    } catch {
      return escapeHtml(code);
    }
  }
  return escapeHtml(code);
}
