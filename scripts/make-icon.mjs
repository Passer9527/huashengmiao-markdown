/**
 * 花生苗 Markdown 编辑器 —— 应用图标生成器
 * ------------------------------------------------------------------
 * 使用纯 Node.js（zlib + 手写 PNG 编码）绘制应用图标，
 * 不依赖任何图形库，保证在任何机器上都能一键重新生成。
 *
 * 图标设计：
 *   · 圆角方形底：绿色渐变（呼应"花生苗"）
 *   · 中央白色幼苗：一根主茎 + 左右两片叶子
 *   · 采用 2 倍超采样后降采样，得到平滑的抗锯齿边缘
 *
 * 用法：node scripts/make-icon.mjs
 * 产物：build/icon.png（1024×1024，electron-builder 会据此自动生成
 *       Windows 的 .ico 与 macOS 的 .icns）
 *
 * 作者：何飞    联系方式：微信 6731663
 * 开源协议：MIT
 */

import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/** 最终输出的图标尺寸 */
const SIZE = 1024;

/** 超采样倍数（越大越平滑，代价是内存与耗时） */
const SS = 3;

/* ==================================================================
 * 一、几何工具（有向距离场）
 * ================================================================== */

/** 圆形/圆角矩形的有向距离 */
function sdRoundRect(px, py, cx, cy, halfW, halfH, r) {
  const dx = Math.abs(px - cx) - (halfW - r);
  const dy = Math.abs(py - cy) - (halfH - r);
  const ax = Math.max(dx, 0);
  const ay = Math.max(dy, 0);
  return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(dx, dy), 0) - r;
}

/** 圆的有向距离 */
function sdCircle(px, py, cx, cy, r) {
  const dx = px - cx;
  const dy = py - cy;
  return Math.sqrt(dx * dx + dy * dy) - r;
}

/** 旋转后的椭圆有向距离（近似，足够用于图形绘制） */
function sdEllipse(px, py, cx, cy, rx, ry, angleRad) {
  const cos = Math.cos(-angleRad);
  const sin = Math.sin(-angleRad);
  const dx = px - cx;
  const dy = py - cy;
  const x = dx * cos - dy * sin;
  const y = dx * sin + dy * cos;
  // 归一化到单位圆后估算距离
  return (Math.sqrt((x / rx) ** 2 + (y / ry) ** 2) - 1) * Math.min(rx, ry);
}

/** 平滑过渡：d <= 0 时为 1，d >= 1 时为 0 */
function smoothAlpha(d, softness = 1) {
  if (d <= -softness) return 1;
  if (d >= softness) return 0;
  const t = (d + softness) / (2 * softness);
  return 1 - t * t * (3 - 2 * t);
}

/** 线性插值 */
function mix(a, b, t) {
  return a + (b - a) * t;
}

/* ==================================================================
 * 二、绘制
 * ================================================================== */

/**
 * 计算某个像素的颜色
 * @param x 横坐标（0..SIZE）
 * @param y 纵坐标（0..SIZE，向下为正）
 */
function sample(x, y) {
  const c = SIZE / 2;

  // ---------- 背景：圆角方形 + 垂直渐变 ----------
  const bgDist = sdRoundRect(x, y, c, c, SIZE * 0.47, SIZE * 0.47, SIZE * 0.22);
  const bgAlpha = smoothAlpha(bgDist, 1.2);

  // 渐变：上方亮绿 → 下方深绿
  const t = Math.min(1, Math.max(0, y / SIZE));
  let r = mix(0x4a, 0x14, t);
  let g = mix(0xd0, 0x8a, t);
  let b = mix(0x94, 0x4f, t);

  // 左上角加一点高光，让图标更有质感
  const hx = x - SIZE * 0.28;
  const hy = y - SIZE * 0.22;
  const highlight = Math.exp(-(hx * hx + hy * hy) / (SIZE * SIZE * 0.055)) * 0.28;
  r = Math.min(255, r + highlight * 255);
  g = Math.min(255, g + highlight * 255);
  b = Math.min(255, b + highlight * 255);

  // ---------- 前景：白色幼苗 ----------
  const white = { r: 255, g: 255, b: 255 };

  // 主茎（圆角竖条）
  const stem = sdRoundRect(x, y, c, SIZE * 0.56, SIZE * 0.022, SIZE * 0.20, SIZE * 0.022);
  const stemA = smoothAlpha(stem, 1.0);

  // 左右两片叶子（旋转椭圆）
  const leafL = sdEllipse(x, y, c - SIZE * 0.135, SIZE * 0.435, SIZE * 0.145, SIZE * 0.078, (28 * Math.PI) / 180);
  const leafR = sdEllipse(x, y, c + SIZE * 0.135, SIZE * 0.375, SIZE * 0.145, SIZE * 0.078, (-28 * Math.PI) / 180);
  const leafA = Math.max(smoothAlpha(leafL, 1.0), smoothAlpha(leafR, 1.0));

  // 叶子与茎的接合处做一个圆形过渡，避免出现生硬的缺口
  const jointL = sdCircle(x, y, c - SIZE * 0.045, SIZE * 0.47, SIZE * 0.055);
  const jointR = sdCircle(x, y, c + SIZE * 0.045, SIZE * 0.425, SIZE * 0.055);
  const jointA = Math.max(smoothAlpha(jointL, 1.0), smoothAlpha(jointR, 1.0));

  const fgA = Math.max(stemA, leafA, jointA);

  r = mix(r, white.r, fgA);
  g = mix(g, white.g, fgA);
  b = mix(b, white.b, fgA);

  return [r, g, b, bgAlpha];
}

/**
 * 生成 RGBA 像素缓冲
 * @param size 输出尺寸
 * @param ss 超采样倍数
 */
function render(size, ss) {
  const big = size * ss;
  const acc = new Float64Array(size * size * 4);

  for (let by = 0; by < big; by += 1) {
    for (let bx = 0; bx < big; bx += 1) {
      // 把超采样坐标换算回逻辑坐标
      const x = ((bx + 0.5) / big) * size;
      const y = ((by + 0.5) / big) * size;
      const [r, g, b, a] = sample(x, y);

      const ox = Math.floor(bx / ss);
      const oy = Math.floor(by / ss);
      const idx = (oy * size + ox) * 4;
      acc[idx] += r;
      acc[idx + 1] += g;
      acc[idx + 2] += b;
      acc[idx + 3] += a;
    }
  }

  const samples = ss * ss;
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    buf[i * 4] = Math.round(Math.min(255, acc[i * 4] / samples));
    buf[i * 4 + 1] = Math.round(Math.min(255, acc[i * 4 + 1] / samples));
    buf[i * 4 + 2] = Math.round(Math.min(255, acc[i * 4 + 2] / samples));
    buf[i * 4 + 3] = Math.round(Math.min(255, acc[i * 4 + 3] / samples));
  }
  return buf;
}

/* ==================================================================
 * 三、PNG 编码
 * ================================================================== */

/** CRC32 查表 */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

/** 计算 CRC32 */
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** 构造一个 PNG 数据块 */
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/**
 * 把 RGBA 像素编码为 PNG
 * @param rgba RGBA 像素数据
 * @param width 宽
 * @param height 高
 */
function encodePng(rgba, width, height) {
  // IHDR：宽、高、位深 8、颜色类型 6（RGBA）、压缩 0、滤波 0、隔行 0
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // 每行前加一个滤波类型字节（0 = None）
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ==================================================================
 * 四、主流程
 * ================================================================== */

console.log(`正在绘制 ${SIZE}×${SIZE} 应用图标（${SS}× 超采样）…`);
const started = Date.now();

const pixels = render(SIZE, SS);
const png = encodePng(pixels, SIZE, SIZE);

const outDir = path.join(ROOT, 'build');
fs.mkdirSync(outDir, { recursive: true });

const outFile = path.join(outDir, 'icon.png');
fs.writeFileSync(outFile, png);

// 同时生成界面中用到的较小尺寸图标
for (const small of [256, 128, 64]) {
  const smallPixels = render(small, 2);
  fs.writeFileSync(path.join(outDir, `icon-${small}.png`), encodePng(smallPixels, small, small));
}

// 供渲染进程窗口使用的图标放在 resources 目录
const resDir = path.join(ROOT, 'resources');
fs.mkdirSync(resDir, { recursive: true });
fs.writeFileSync(path.join(resDir, 'icon.png'), encodePng(render(256, 2), 256, 256));

console.log(`✓ 图标已生成：${outFile}（${(png.length / 1024).toFixed(1)} KB，耗时 ${Date.now() - started} ms）`);
console.log(`✓ 小尺寸图标与 resources/icon.png 也已同步生成`);
