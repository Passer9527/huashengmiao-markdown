/**
 * 花生苗 Markdown 编辑器 —— 跨平台路径工具
 * ------------------------------------------------------------------
 * 渲染进程运行在浏览器环境，无法使用 node:path，因此这里实现一套
 * 精简的路径处理函数，同时兼容 Windows（反斜杠、盘符）与 POSIX 路径。
 *
 * 作者：何飞    联系方式：微信 6731663
 * 开源协议：MIT
 */

/** 判断是否为 Windows 风格绝对路径（如 C:\dir 或 C:/dir） */
export function isWindowsAbsolute(p: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(p);
}

/** 判断是否为绝对路径（POSIX 或 Windows） */
export function isAbsolute(p: string): boolean {
  return p.startsWith('/') || isWindowsAbsolute(p) || p.startsWith('\\\\');
}

/** 统一分隔符为正斜杠 */
export function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

/** 获取父目录 */
export function dirname(p: string): string {
  const s = toPosix(p);
  const i = s.lastIndexOf('/');
  if (i < 0) return '.';
  if (i === 0) return '/';
  // Windows 盘符根目录，如 C:/a -> C:/
  if (/^[a-zA-Z]:$/.test(s.slice(0, i))) return s.slice(0, i + 1);
  return s.slice(0, i);
}

/** 获取文件名（含扩展名） */
export function basename(p: string): string {
  const s = toPosix(p).replace(/\/+$/, '');
  const i = s.lastIndexOf('/');
  return i < 0 ? s : s.slice(i + 1);
}

/** 获取扩展名（含点，小写） */
export function extname(p: string): string {
  const b = basename(p);
  const i = b.lastIndexOf('.');
  return i <= 0 ? '' : b.slice(i).toLowerCase();
}

/** 去掉扩展名的文件名 */
export function stem(p: string): string {
  const b = basename(p);
  const e = extname(p);
  return e ? b.slice(0, b.length - e.length) : b;
}

/**
 * 拼接路径片段
 * @param parts 路径片段
 */
export function join(...parts: string[]): string {
  const filtered = parts.filter((p) => p !== '' && p !== undefined && p !== null);
  if (filtered.length === 0) return '';
  const sep = isWindowsAbsolute(filtered[0]) || filtered[0].startsWith('\\') ? '\\' : '/';
  let out = filtered[0];
  for (let i = 1; i < filtered.length; i += 1) {
    const seg = filtered[i].replace(/^[\\/]+/, '');
    if (!seg) continue;
    out = out.replace(/[\\/]+$/, '') + sep + seg;
  }
  return out;
}

/**
 * 把路径规范化为绝对路径（解析 . 与 ..）
 * @param input 输入路径
 * @param base 相对路径的基准目录；不传则原样返回相对路径
 */
export function resolve(input: string, base?: string): string {
  let p = input;

  // 先把 Windows 盘符或 POSIX 根记下来，最后再拼回去
  let prefix = '';
  if (isWindowsAbsolute(p)) {
    prefix = p.slice(0, 2);
    p = p.slice(2);
  } else if (p.startsWith('/')) {
    prefix = '/';
    p = p.slice(1);
  } else if (base) {
    const b = resolve(base);
    prefix = isWindowsAbsolute(b) ? b.slice(0, 2) : b.startsWith('/') ? '/' : '';
    const rest = isWindowsAbsolute(b) ? b.slice(2) : b.startsWith('/') ? b.slice(1) : b;
    p = rest.replace(/[\\/]+$/, '') + '/' + p;
  }

  const segs = toPosix(p).split('/');
  const out: string[] = [];
  for (const seg of segs) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (out.length > 0 && out[out.length - 1] !== '..') out.pop();
      else if (!prefix) out.push('..');
      continue;
    }
    out.push(seg);
  }

  const joined = out.join('/');
  const sepForWin = isWindowsAbsolute(prefix + 'x') || prefix.length === 2;
  if (prefix === '/') return '/' + joined;
  if (prefix.length === 2) return sepForWin ? prefix + '\\' + joined.replace(/\//g, '\\') : prefix + '/' + joined;
  return joined;
}

/**
 * 计算 from 到 to 的相对路径
 * @param from 起始目录
 * @param to 目标路径
 */
export function relative(from: string, to: string): string {
  const a = resolve(from).replace(/\\/g, '/').replace(/\/+$/, '').split('/');
  const b = resolve(to).replace(/\\/g, '/').split('/');

  // 跳过公共前缀
  let i = 0;
  while (i < a.length && i < b.length && a[i].toLowerCase() === b[i].toLowerCase()) i += 1;

  const up = new Array(a.length - i).fill('..');
  const down = b.slice(i);
  const result = [...up, ...down].join('/');
  return result || '.';
}

/**
 * 判断是否为网络地址或 data URL
 * @param src 待判断的字符串
 */
export function isRemoteUrl(src: string): boolean {
  return /^(https?:|data:|blob:|mailto:|tel:|file:)/i.test(src);
}

/**
 * 把本地绝对路径转换为 file:// URL
 * 需要处理 Windows 盘符、空格与 # ? 等特殊字符。
 *
 * @param absPath 绝对路径
 */
export function toFileUrl(absPath: string): string {
  let p = toPosix(absPath);
  if (/^[a-zA-Z]:/.test(p)) p = '/' + p; // C:/a -> /C:/a
  if (!p.startsWith('/')) p = '/' + p;

  // 分段编码，避免把路径分隔符也编码掉
  const encoded = p
    .split('/')
    .map((seg) =>
      encodeURIComponent(seg)
        // encodeURIComponent 会过度编码这些在路径中合法的字符
        .replace(/%2F/gi, '/')
        .replace(/%3A/gi, ':')
        .replace(/%40/gi, '@')
        .replace(/%2B/gi, '+')
        .replace(/%24/gi, '$')
        .replace(/%2C/gi, ',')
        .replace(/%3B/gi, ';')
        .replace(/%3D/gi, '=')
        .replace(/%21/gi, '!')
        .replace(/%2A/gi, '*')
        .replace(/%27/gi, "'")
        .replace(/%28/gi, '(')
        .replace(/%29/gi, ')'),
    )
    .join('/');

  return 'file://' + encoded;
}

/**
 * 把 Markdown 中的图片地址解析为可直接显示的地址
 * @param src Markdown 里书写的原始地址
 * @param docPath 当前文档绝对路径（用于解析相对路径）
 * @returns 可显示地址；无法解析时返回原值
 */
export function resolveResourceUrl(src: string, docPath: string): string {
  const raw = (src || '').trim();
  if (!raw) return '';

  // 网络地址、data URL 直接使用
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw;

  // 已经是 file:// 协议
  if (/^file:/i.test(raw)) return raw;

  // 去掉锚点与查询串再解析
  const hashIdx = raw.search(/[?#]/);
  const pure = hashIdx >= 0 ? raw.slice(0, hashIdx) : raw;
  const suffix = hashIdx >= 0 ? raw.slice(hashIdx) : '';

  // 绝对路径直接转 file URL
  if (isAbsolute(pure)) return toFileUrl(pure) + suffix;

  // 相对路径：以文档所在目录为基准
  if (!docPath) return raw;
  const abs = resolve(decodeURIComponent(pure), dirname(docPath));
  return toFileUrl(abs) + suffix;
}
