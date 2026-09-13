/**
 * 花生苗 Markdown 编辑器 —— 图片服务
 * ------------------------------------------------------------------
 * 处理图片的粘贴 / 拖拽落盘：
 *   1. 按设置决定保存目录（文档同级 assets / 文档同级 / 指定绝对目录 / 不入库）；
 *   2. 按命名模板生成文件名；
 *   3. 按 SHA-256 内容哈希去重，相同图片只存一份；
 *   4. 解析图片尺寸，写入 Markdown 时可直接带上宽度；
 *   5. 登记到 SQLite 的 images 表，便于后续统一管理。
 *
 * 作者：何飞    联系方式：微信 6731663
 * 开源协议：MIT
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { get, run } from './database';
import { getAllSettings } from './settings';
import type { ImageSaveResult } from '../../shared/types';
import { logError, logInfo } from './logger';

/** 支持的图片扩展名 */
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.avif', '.ico']);

/** MIME 类型 -> 扩展名 的映射（粘贴图片时使用） */
const MIME_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
  'image/svg+xml': '.svg',
  'image/avif': '.avif',
  'image/x-icon': '.ico',
};

/**
 * 把图片二进制数据保存到磁盘
 * @param data 图片数据
 * @param ext 扩展名（含点，如 .png）
 * @param docPath 当前文档绝对路径（未保存的新文档可传工作区目录或空串）
 * @param originalName 原始文件名（用于 {name} 占位符）
 * @returns 保存结果，含写入 Markdown 用的相对路径
 */
export async function saveImageBuffer(
  data: Uint8Array,
  ext: string,
  docPath: string,
  originalName = '',
): Promise<ImageSaveResult> {
  const settings = getAllSettings();
  const saveMode = String(settings['image.saveMode'] ?? 'relative');

  // "仅网络地址"模式下不落盘，交由渲染进程提示用户
  if (saveMode === 'url') {
    return { ok: false, error: '当前设置为"仅插入网络地址"，未保存本地图片' };
  }

  const buf = Buffer.from(data);
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  const safeExt = normalizeExt(ext);

  // 目标目录
  const targetDir = resolveSaveDir(saveMode, String(settings['image.savePath'] ?? 'assets'), docPath);
  if (!targetDir) return { ok: false, error: '无法确定图片保存目录，请先在设置中配置' };

  try {
    await fsp.mkdir(targetDir, { recursive: true });
  } catch (e) {
    logError(`创建图片目录失败：${targetDir}`, e);
    return { ok: false, error: '创建图片目录失败，请检查权限' };
  }

  // 去重：目录下已有相同内容的图片则直接复用
  if (settings['image.dedupe'] !== false) {
    const existing = findExistingByHash(targetDir, hash);
    if (existing) {
      const dim = readImageSize(path.join(targetDir, existing));
      return {
        ok: true,
        absolutePath: path.join(targetDir, existing),
        relativePath: toMarkdownPath(targetDir, path.join(targetDir, existing), docPath),
        width: dim?.width,
        height: dim?.height,
        deduplicated: true,
      };
    }
  }

  // 生成文件名
  const fileName = renderNameTemplate(String(settings['image.nameTemplate'] ?? 'image-{yyyy}{MM}{dd}-{hhmmss}-{rand}'), originalName, safeExt);
  const absPath = await avoidCollision(path.join(targetDir, fileName), hash);

  try {
    await fsp.writeFile(absPath, buf);
  } catch (e) {
    logError(`写入图片失败：${absPath}`, e);
    return { ok: false, error: '写入图片文件失败，请检查磁盘空间与权限' };
  }

  const dim = readImageSize(absPath);

  // 登记到数据库，便于后续管理与清理
  run(
    `INSERT INTO images (doc_path, original_name, stored_path, mime_type, size_bytes, width, height, hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    docPath || null,
    originalName || path.basename(absPath),
    absPath,
    extToMime(safeExt),
    buf.length,
    dim?.width ?? null,
    dim?.height ?? null,
    hash,
  );

  logInfo(`图片已保存：${absPath}（${buf.length} 字节）`);

  return {
    ok: true,
    absolutePath: absPath,
    relativePath: toMarkdownPath(targetDir, absPath, docPath),
    width: dim?.width,
    height: dim?.height,
    deduplicated: false,
  };
}

/**
 * 把磁盘上已有的图片复制到资源目录
 * @param srcPath 源图片路径
 * @param docPath 当前文档路径
 */
export async function saveImageFromPath(srcPath: string, docPath: string): Promise<ImageSaveResult> {
  try {
    const stat = await fsp.stat(srcPath);
    if (!stat.isFile()) return { ok: false, error: '源路径不是文件' };
    if (stat.size > 100 * 1024 * 1024) return { ok: false, error: '图片超过 100MB，已跳过' };

    const buf = await fsp.readFile(srcPath);
    return await saveImageBuffer(buf, path.extname(srcPath), docPath, path.basename(srcPath, path.extname(srcPath)));
  } catch (e) {
    logError(`读取源图片失败：${srcPath}`, e);
    return { ok: false, error: '读取图片失败，文件可能已被移动或删除' };
  }
}

/** 规范化扩展名：补点、小写，非法时回退 .png */
function normalizeExt(ext: string): string {
  let e = ext.trim().toLowerCase();
  if (!e) return '.png';
  if (!e.startsWith('.')) e = '.' + e;
  return IMAGE_EXTS.has(e) ? e : '.png';
}

/**
 * 根据保存模式确定图片目录
 * @param mode 保存模式
 * @param configured 用户配置的目录名或绝对路径
 * @param docPath 文档路径
 */
function resolveSaveDir(mode: string, configured: string, docPath: string): string {
  const docDir = docPath ? path.dirname(docPath) : '';

  switch (mode) {
    case 'docDir':
      // 与文档同级
      return docDir || configured;
    case 'absolute':
      // 用户指定的绝对目录
      if (path.isAbsolute(configured)) return configured;
      return docDir ? path.resolve(docDir, configured) : path.resolve(configured);
    case 'relative':
    default: {
      // 文档同级的资源子目录（默认 assets）
      const sub = configured || 'assets';
      if (path.isAbsolute(sub)) return sub;
      return docDir ? path.join(docDir, sub) : path.resolve(sub);
    }
  }
}

/**
 * 在目标目录中查找内容哈希相同的图片
 * @param dir 目录
 * @param hash 目标哈希
 * @returns 命中的文件名（不含目录）；未命中返回 null
 */
function findExistingByHash(dir: string, hash: string): string | null {
  const row = get<{ stored_path: string }>(
    'SELECT stored_path FROM images WHERE hash = ? AND stored_path LIKE ? LIMIT 1',
    hash,
    dir + path.sep + '%',
  );
  if (!row) return null;
  // 数据库有登记但文件已被手动删除时，视为未命中
  return fs.existsSync(row.stored_path) ? path.basename(row.stored_path) : null;
}

/**
 * 避免文件名冲突：若目标已存在且内容不同，追加随机后缀
 * @param target 目标路径
 * @param hash 内容哈希（用于判断已存在文件是否内容相同）
 */
async function avoidCollision(target: string, hash: string): Promise<string> {
  if (!fs.existsSync(target)) return target;

  try {
    const existing = await fsp.readFile(target);
    const existingHash = crypto.createHash('sha256').update(existing).digest('hex');
    if (existingHash === hash) return target; // 内容一致，直接复用
  } catch {
    /* 读取失败则按冲突处理 */
  }

  const dir = path.dirname(target);
  const ext = path.extname(target);
  const base = path.basename(target, ext);
  for (let i = 1; i < 1000; i += 1) {
    const candidate = path.join(dir, `${base}-${i}${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
  return path.join(dir, `${base}-${Date.now()}${ext}`);
}

/**
 * 渲染图片命名模板
 * @param template 模板串，支持 {yyyy} {MM} {dd} {hhmmss} {rand} {name}
 * @param originalName 原始文件名
 * @param ext 扩展名
 * @returns 完整文件名（含扩展名）
 */
function renderNameTemplate(template: string, originalName: string, ext: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');

  const rand = crypto.randomBytes(3).toString('hex');
  const base = (originalName || '').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40) || 'image';

  let name = template
    .replace(/\{yyyy\}/g, String(d.getFullYear()))
    .replace(/\{MM\}/g, p(d.getMonth() + 1))
    .replace(/\{dd\}/g, p(d.getDate()))
    .replace(/\{hhmmss\}/g, `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`)
    .replace(/\{rand\}/g, rand)
    .replace(/\{name\}/g, base);

  // 清理 Windows 不允许的字符
  name = name.replace(/[\\/:*?"<>|]+/g, '-').replace(/^\.+/, '').trim();
  if (!name) name = `image-${Date.now()}`;

  // 若模板已经带了扩展名则不再追加
  return IMAGE_EXTS.has(path.extname(name).toLowerCase()) ? name : name + ext;
}

/**
 * 生成写入 Markdown 的路径
 * 相对路径使用正斜杠，保证在 Windows 与 Linux 上都能正确显示。
 *
 * @param targetDir 图片所在目录
 * @param absPath 图片绝对路径
 * @param docPath 文档路径
 */
function toMarkdownPath(targetDir: string, absPath: string, docPath: string): string {
  const settings = getAllSettings();
  const mode = String(settings['image.saveMode'] ?? 'relative');

  if (mode === 'absolute') return absPath.replace(/\\/g, '/');

  const docDir = docPath ? path.dirname(docPath) : targetDir;
  const rel = path.relative(docDir, absPath).replace(/\\/g, '/');
  // 相对路径统一以 ./ 开头，语义更清晰
  return rel.startsWith('.') ? rel : './' + rel;
}

/** 扩展名转 MIME */
function extToMime(ext: string): string {
  for (const [mime, e] of Object.entries(MIME_EXT)) {
    if (e === ext) return mime;
  }
  return 'application/octet-stream';
}

/** MIME 转扩展名 */
export function mimeToExt(mime: string): string {
  return MIME_EXT[mime.toLowerCase()] ?? '.png';
}

/**
 * 从二进制数据解析图片宽高
 * 支持 PNG / JPEG / GIF / BMP / WebP，无需任何第三方依赖。
 *
 * @param data 图片数据或文件路径
 */
export function readImageSize(data: Buffer | string): { width: number; height: number } | null {
  let buf: Buffer;
  try {
    if (typeof data === 'string') {
      const fd = fs.openSync(data, 'r');
      buf = Buffer.alloc(64 * 1024); // 头部 64KB 足够解析所有格式的尺寸
      const read = fs.readSync(fd, buf, 0, buf.length, 0);
      fs.closeSync(fd);
      buf = buf.subarray(0, read);
    } else {
      buf = data;
    }
  } catch {
    return null;
  }

  try {
    // ---------- PNG ----------
    if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }

    // ---------- GIF ----------
    if (buf.length >= 10 && buf.subarray(0, 3).toString('ascii') === 'GIF') {
      return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    }

    // ---------- BMP ----------
    if (buf.length >= 26 && buf.subarray(0, 2).toString('ascii') === 'BM') {
      return { width: buf.readInt32LE(18), height: Math.abs(buf.readInt32LE(22)) };
    }

    // ---------- WebP ----------
    if (buf.length >= 30 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
      const type = buf.subarray(12, 16).toString('ascii');
      if (type === 'VP8 ') {
        return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
      }
      if (type === 'VP8L') {
        const b0 = buf[21];
        const b1 = buf[22];
        const b2 = buf[23];
        const b3 = buf[24];
        return {
          width: ((b1 & 0x3f) << 8 | b0) + 1,
          height: ((b3 & 0x0f) << 10 | b2 << 2 | (b1 & 0xc0) >> 6) + 1,
        };
      }
      if (type === 'VP8X') {
        return {
          width: (buf[24] | (buf[25] << 8) | (buf[26] << 16)) + 1,
          height: (buf[27] | (buf[28] << 8) | (buf[29] << 16)) + 1,
        };
      }
    }

    // ---------- JPEG ----------
    if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
      let offset = 2;
      while (offset + 9 < buf.length) {
        if (buf[offset] !== 0xff) {
          offset += 1;
          continue;
        }
        const marker = buf[offset + 1];
        // SOF0–SOF15（跳过 DHT=0xC4、JPG=0xC8、DAC=0xCC）
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
        }
        const len = buf.readUInt16BE(offset + 2);
        if (len <= 0) break;
        offset += 2 + len;
      }
    }
  } catch {
    /* 解析失败返回 null */
  }

  return null;
}
