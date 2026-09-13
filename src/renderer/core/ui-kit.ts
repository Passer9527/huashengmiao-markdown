/**
 * 花生苗 Markdown 编辑器 —— 界面基础组件库
 * ------------------------------------------------------------------
 * 提供一套轻量的、无框架依赖的界面构件：
 *   · DOM 创建与查询工具
 *   · 提示条 Toast
 *   · 模态对话框 Modal
 *   · 右键菜单 ContextMenu
 *   · 输入对话框 prompt
 *
 * 全应用统一通过这些函数弹出界面，保证风格与交互一致。
 *
 * 作者：何飞    联系方式：微信 6731663
 * 开源协议：MIT
 */

/* ==================================================================
 * 一、DOM 工具
 * ================================================================== */

/** 创建元素并设置属性与子节点 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, unknown>,
  ...children: Array<Node | string | null | undefined | false>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) continue;

      if (key === 'class' || key === 'className') {
        node.className = String(value);
      } else if (key === 'style' && typeof value === 'object') {
        Object.assign(node.style, value as Partial<CSSStyleDeclaration>);
      } else if (key === 'dataset' && typeof value === 'object') {
        Object.assign(node.dataset, value as Record<string, string>);
      } else if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      } else if (key === 'text') {
        node.textContent = String(value);
      } else if (key === 'html') {
        node.innerHTML = String(value);
      } else if (value === true) {
        node.setAttribute(key, '');
      } else {
        node.setAttribute(key, String(value));
      }
    }
  }

  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  return node;
}

/** 按 ID 获取元素（找不到时抛出，便于尽早暴露问题） */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`界面上找不到元素 #${id}`);
  return node as T;
}

/** 按选择器获取元素（可能为 null） */
export function qs<T extends Element = Element>(selector: string, root: ParentNode = document): T | null {
  return root.querySelector<T>(selector);
}

/** 按选择器获取全部元素 */
export function qsa<T extends Element = Element>(selector: string, root: ParentNode = document): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}

/** 清空元素的全部子节点 */
export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** 防抖：在停止调用 delay 毫秒后执行 */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, delay: number): (...args: A) => void {
  let timer: number | null = null;
  return (...args: A) => {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      fn(...args);
    }, delay);
  };
}

/** 节流：在 limit 毫秒内最多执行一次 */
export function throttle<A extends unknown[]>(fn: (...args: A) => void, limit: number): (...args: A) => void {
  let last = 0;
  let timer: number | null = null;
  return (...args: A) => {
    const now = Date.now();
    const remain = limit - (now - last);
    if (remain <= 0) {
      last = now;
      fn(...args);
    } else if (timer === null) {
      timer = window.setTimeout(() => {
        last = Date.now();
        timer = null;
        fn(...args);
      }, remain);
    }
  };
}

/** 转义 HTML，用于把纯文本安全地插入 innerHTML */
export function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ==================================================================
 * 二、提示条 Toast
 * ================================================================== */

/** 提示类型 */
export type ToastKind = 'info' | 'success' | 'warning' | 'error';

/**
 * 弹出一条提示
 * @param message 提示文字
 * @param kind 类型，决定配色与图标
 * @param duration 显示时长（毫秒），传 0 表示需要手动关闭
 */
export function toast(message: string, kind: ToastKind = 'info', duration = 2600): void {
  const root = document.getElementById('toast-root');
  if (!root) return;

  const icons: Record<ToastKind, string> = {
    info: 'ℹ',
    success: '✓',
    warning: '⚠',
    error: '✕',
  };

  const node = el(
    'div',
    { class: `toast toast--${kind}` },
    el('span', { class: 'toast__icon', text: icons[kind] }),
    el('span', { class: 'toast__text', text: message }),
  );

  // 点击可提前关闭
  node.addEventListener('click', () => dismiss());

  let timer: number | null = null;
  const dismiss = (): void => {
    if (timer !== null) window.clearTimeout(timer);
    node.classList.add('toast--leaving');
    window.setTimeout(() => node.remove(), 180);
  };

  root.appendChild(node);
  // 动画由 CSS 的 @keyframes 自动播放，无需依赖 requestAnimationFrame
  node.classList.add('toast--enter');

  if (duration > 0) timer = window.setTimeout(dismiss, duration);

  // 同时只保留最近 5 条，避免堆满屏幕
  while (root.children.length > 5) root.firstElementChild?.remove();
}

/* ==================================================================
 * 三、模态对话框
 * ================================================================== */

/** 模态框配置 */
export interface ModalOptions {
  /** 标题 */
  title: string;
  /** 内容元素或 HTML 字符串 */
  content: Node | string;
  /** 底部按钮 */
  buttons?: Array<{
    label: string;
    kind?: 'primary' | 'danger' | 'default';
    /** 点击回调；返回 false 可阻止关闭 */
    onClick?: () => boolean | void;
  }>;
  /** 宽度，默认 480px */
  width?: number;
  /** 是否显示右上角关闭按钮 */
  closable?: boolean;
  /** 关闭时的回调 */
  onClose?: () => void;
  /** 额外的类名，例如 modal--wide */
  className?: string;
}

/** 已打开的模态框栈，支持嵌套（Esc 只关闭最上层） */
const modalStack: Array<{ close: () => void }> = [];

/**
 * 打开一个模态对话框
 * @param options 配置
 * @returns 用于关闭对话框的函数
 */
export function openModal(options: ModalOptions): () => void {
  const root = document.getElementById('overlay-root');
  if (!root) return () => undefined;

  const bodyChildren: Node[] = [];
  if (typeof options.content === 'string') {
    const div = el('div');
    div.innerHTML = options.content;
    bodyChildren.push(...Array.from(div.childNodes));
  } else {
    bodyChildren.push(options.content);
  }

  const footChildren: Node[] = [];
  const close = (): void => {
    overlay.classList.remove('is-open');
    const idx = modalStack.findIndex((m) => m.close === close);
    if (idx >= 0) modalStack.splice(idx, 1);
    window.setTimeout(() => {
      overlay.remove();
      options.onClose?.();
    }, 150);
  };

  if (options.buttons && options.buttons.length > 0) {
    for (const b of options.buttons) {
      const btn = el('button', {
        class: `btn${b.kind === 'primary' ? ' btn--primary' : b.kind === 'danger' ? ' btn--danger' : ''}`,
        text: b.label,
        onclick: () => {
          const result = b.onClick?.();
          if (result === false) return;
          close();
        },
      });
      footChildren.push(btn);
    }
  }

  const headChildren: Node[] = [el('div', { class: 'modal__title', text: options.title })];
  if (options.closable !== false) {
    headChildren.push(
      el('button', { class: 'iconbtn modal__close', text: '✕', title: '关闭 (Esc)', onclick: close }),
    );
  }

  const modal = el(
    'div',
    {
      class: `modal${options.className ? ' ' + options.className : ''}`,
      style: options.width ? { width: `${options.width}px` } : undefined,
      role: 'dialog',
      'aria-modal': 'true',
    },
    el('div', { class: 'modal__head' }, ...headChildren),
    el('div', { class: 'modal__body' }, ...bodyChildren),
    footChildren.length > 0 ? el('div', { class: 'modal__foot' }, ...footChildren) : null,
  );

  const overlay = el(
    'div',
    {
      class: 'overlay',
      onclick: (e: MouseEvent) => {
        // 点击遮罩空白处关闭
        if (e.target === overlay) close();
      },
    },
    modal,
  );

  // 立即加上 is-open：显示与否绝不能依赖 requestAnimationFrame
  // （窗口被遮挡或后台运行时 rAF 可能不触发，会造成"面板打不开"）
  root.appendChild(overlay);
  overlay.classList.add('is-open');

  modalStack.push({ close });

  // 若模态框内有输入框，自动聚焦第一个
  const firstInput = modal.querySelector<HTMLElement>('input, textarea, select');
  window.setTimeout(() => firstInput?.focus(), 60);

  return close;
}

/** 关闭最上层的模态框（Esc 使用） */
export function closeTopModal(): boolean {
  const top = modalStack[modalStack.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

/** 当前是否有模态框打开 */
export function hasModalOpen(): boolean {
  return modalStack.length > 0;
}

/**
 * 简易输入对话框
 * @param title 标题
 * @param defaultValue 默认值
 * @param placeholder 占位提示
 * @returns 用户输入的值；取消返回 null
 */
export function promptDialog(
  title: string,
  defaultValue = '',
  placeholder = '',
): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | null): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const input = el('input', {
      class: 'input',
      type: 'text',
      value: defaultValue,
      placeholder,
    }) as HTMLInputElement;

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(input.value);
        close();
      }
    });

    const close = openModal({
      title,
      width: 420,
      content: input,
      buttons: [
        { label: '取消', onClick: () => finish(null) },
        { label: '确定', kind: 'primary', onClick: () => finish(input.value) },
      ],
      onClose: () => finish(null),
    });

    window.setTimeout(() => {
      input.focus();
      input.select();
    }, 60);
  });
}

/* ==================================================================
 * 四、右键菜单
 * ================================================================== */

/** 菜单项定义 */
export interface MenuItem {
  /** 显示文字（分隔线时可省略） */
  label?: string;
  /** 点击回调 */
  onClick?: () => void;
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否为分隔线 */
  separator?: boolean;
  /** 右侧显示的快捷键 */
  accelerator?: string;
}

/**
 * 在指定位置弹出右键菜单
 * @param x 屏幕横坐标
 * @param y 屏幕纵坐标
 * @param items 菜单项
 */
export function contextMenu(x: number, y: number, items: MenuItem[]): void {
  const root = document.getElementById('contextmenu-root');
  if (!root) return;
  clear(root);

  const menu = el('div', { class: 'ctxmenu', role: 'menu' });

  for (const item of items) {
    if (item.separator) {
      menu.appendChild(el('div', { class: 'ctxmenu__sep' }));
      continue;
    }
    const node = el(
      'div',
      {
        class: `ctxmenu__item${item.disabled ? ' is-disabled' : ''}`,
        role: 'menuitem',
        onclick: () => {
          if (item.disabled) return;
          hide();
          item.onClick?.();
        },
      },
      el('span', { class: 'ctxmenu__label', text: item.label }),
      item.accelerator ? el('span', { class: 'ctxmenu__accel', text: item.accelerator }) : null,
    );
    menu.appendChild(node);
  }

  root.appendChild(menu);

  // 避免菜单超出窗口边界
  const rect = menu.getBoundingClientRect();
  const maxX = window.innerWidth - rect.width - 6;
  const maxY = window.innerHeight - rect.height - 6;
  menu.style.left = `${Math.min(x, Math.max(4, maxX))}px`;
  menu.style.top = `${Math.min(y, Math.max(4, maxY))}px`;

  const hide = (): void => {
    menu.remove();
    document.removeEventListener('mousedown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('blur', hide);
  };

  const onOutside = (e: MouseEvent): void => {
    if (!menu.contains(e.target as Node)) hide();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') hide();
  };

  // 延迟注册，避免当前这次点击立刻把菜单关掉
  window.setTimeout(() => {
    document.addEventListener('mousedown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', hide);
  }, 0);
}

/* ==================================================================
 * 五、其它小工具
 * ================================================================== */

/** 格式化文件大小 */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** 格式化时间：今天显示时分，其余显示日期 */
export function formatTime(input: string | number | Date): string {
  const d = input instanceof Date ? input : new Date(typeof input === 'number' ? input : String(input).replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return String(input);

  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();

  const p = (n: number): string => String(n).padStart(2, '0');
  if (sameDay) return `今天 ${p(d.getHours())}:${p(d.getMinutes())}`;
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 把当前选中的文本复制到剪贴板 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 剪贴板 API 不可用时退回到临时 textarea 方案
    try {
      const ta = el('textarea', { style: { position: 'fixed', opacity: '0' } }) as HTMLTextAreaElement;
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      return true;
    } catch {
      return false;
    }
  }
}
