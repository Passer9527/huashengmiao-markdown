/**
 * 花生苗 Markdown 编辑器 —— Mermaid 加载与渲染调度
 * ------------------------------------------------------------------
 * 职责：
 *   1. 按需注入 mermaid.js（首次遇到图表时才加载，避免拖慢启动）；
 *   2. 缓存渲染结果，滚动时重建 DOM 可直接复用，避免重复渲染；
 *   3. 提供同源渲染去重，同一个图表只渲染一次。
 *
 * 作者：何飞    联系方式：微信 6731663
 * 开源协议：MIT
 */

import { escapeHtml } from './markdown';

/** Mermaid 模块的最小接口定义（避免静态引入导致包体膨胀） */
interface MermaidLike {
  render(id: string, code: string): Promise<{ svg: string; bindFunctions?: (el: Element) => void }>;
}

/** 全局 Mermaid 实例 */
let mermaidInstance: MermaidLike | null = null;

/** 加载 Promise（保证并发调用只注入一次脚本） */
let loadingPromise: Promise<MermaidLike | null> | null = null;

/** 渲染结果缓存：源码 -> SVG 字符串 */
const renderCache = new Map<string, string>();

/** 渲染失败记录：源码 -> 错误信息（避免反复重试） */
const errorCache = new Map<string, string>();

/** 进行中的渲染任务：源码 -> Promise */
const pending = new Map<string, Promise<string>>();

/** 缓存上限，避免长文档累积过多 SVG 占用内存 */
const MAX_CACHE = 80;

/**
 * 按需加载 Mermaid
 * @returns Mermaid 实例；加载失败返回 null
 */
export function loadMermaid(): Promise<MermaidLike | null> {
  if (mermaidInstance) return Promise.resolve(mermaidInstance);
  if (loadingPromise) return loadingPromise;

  loadingPromise = new Promise<MermaidLike | null>((resolve) => {
    const globalRef = window as unknown as { __HSM_MERMAID__?: MermaidLike };

    // 已经加载过（例如另一个图表先触发了加载）
    if (globalRef.__HSM_MERMAID__) {
      mermaidInstance = globalRef.__HSM_MERMAID__;
      resolve(mermaidInstance);
      return;
    }

    const script = document.createElement('script');
    script.src = './mermaid.js';
    script.async = true;

    const timeout = window.setTimeout(() => {
      // 8 秒仍未就绪，判定为加载失败，图表降级为源码展示
      resolve(null);
    }, 8000);

    script.onload = () => {
      window.clearTimeout(timeout);
      mermaidInstance = globalRef.__HSM_MERMAID__ ?? null;
      resolve(mermaidInstance);
    };

    script.onerror = () => {
      window.clearTimeout(timeout);
      resolve(null);
    };

    document.head.appendChild(script);
  });

  return loadingPromise;
}

/**
 * 渲染 Mermaid 图表源码为 SVG
 * @param source 图表源码
 * @returns SVG 字符串；失败时返回错误提示 HTML
 */
export function renderMermaid(source: string): Promise<string> {
  const code = source.trim();

  // 1) 命中缓存
  const cached = renderCache.get(code);
  if (cached) return Promise.resolve(cached);

  const cachedError = errorCache.get(code);
  if (cachedError) return Promise.resolve(cachedError);

  // 2) 复用进行中的渲染
  const inFlight = pending.get(code);
  if (inFlight) return inFlight;

  const task = (async (): Promise<string> => {
    const mermaid = await loadMermaid();
    if (!mermaid) {
      const html = `<div class="hsm-mermaid-error">Mermaid 组件加载失败，图表暂不能渲染</div>`;
      errorCache.set(code, html);
      return html;
    }

    try {
      // 每次渲染使用唯一 ID，避免 Mermaid 内部 DOM 冲突
      const id = 'hsm-mermaid-' + Math.random().toString(36).slice(2, 10);
      const { svg } = await mermaid.render(id, code);
      const html = `<div class="hsm-mermaid">${svg}</div>`;
      putCache(renderCache, code, html);
      return html;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const html =
        `<div class="hsm-mermaid-error" title="${escapeHtml(msg)}">` +
        `<div class="hsm-mermaid-error__title">图表语法有误</div>` +
        `<pre>${escapeHtml(code)}</pre>` +
        `<div class="hsm-mermaid-error__msg">${escapeHtml(msg.split('\n')[0])}</div>` +
        `</div>`;
      putCache(errorCache, code, html);
      return html;
    } finally {
      pending.delete(code);
    }
  })();

  pending.set(code, task);
  return task;
}

/** 写入缓存并在超限时清理最早的条目 */
function putCache(map: Map<string, string>, key: string, value: string): void {
  if (map.size >= MAX_CACHE) {
    const first = map.keys().next().value;
    if (first !== undefined) map.delete(first);
  }
  map.set(key, value);
}

/**
 * 把一个占位容器渲染为 Mermaid 图表
 * 若缓存中有结果则同步填入，否则异步渲染后再填入。
 *
 * @param host 容器元素
 * @param source 图表源码
 */
export function paintMermaid(host: HTMLElement, source: string): void {
  const code = source.trim();
  const cached = renderCache.get(code) ?? errorCache.get(code);
  if (cached) {
    host.innerHTML = cached;
    return;
  }

  host.innerHTML = '<div class="hsm-mermaid-loading">正在渲染图表…</div>';

  void renderMermaid(code).then((html) => {
    // 元素可能已经被 CodeMirror 回收，需要确认仍在文档中
    if (host.isConnected) host.innerHTML = html;
  });
}

/** 清空全部缓存（切换主题时调用，让图表按新主题重新渲染） */
export function clearMermaidCache(): void {
  renderCache.clear();
  errorCache.clear();
}
