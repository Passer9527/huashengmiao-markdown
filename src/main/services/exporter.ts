/**
 * 花生苗 Markdown 编辑器 —— 导出服务
 * ------------------------------------------------------------------
 * 支持格式：
 *   · HTML  —— 内联全部样式（含 KaTeX 字体），生成单文件，可直接分享
 *   · PDF   —— 隐藏窗口渲染 + Chromium 打印，支持纸张、边距、页眉页脚
 *   · PNG   —— 整篇渲染为长图，超长文档自动降采样以规避渲染尺寸上限
 *   · Word / LaTeX / ePub / RTF —— 检测到 Pandoc 时调用其转换
 *
 * 全部实现基于 Electron 内置能力，不依赖 Puppeteer / wkhtmltopdf 等外部程序，
 * 保证用户装完即用。
 *
 * 作者：何飞    联系方式：微信 6731663
 * 开源协议：MIT
 */

import { BrowserWindow, app, shell } from 'electron';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildDocumentCss, DOC_ROOT_CLASS } from '../../shared/themes';
import { getAllSettings } from './settings';
import { run } from './database';
import type { ExportOptions, ExportResult } from '../../shared/types';
import { logError, logInfo } from './logger';

const execFileAsync = promisify(execFile);

/** Chromium 单次可渲染的最大像素高度，超过则需要降采样 */
const MAX_CANVAS_HEIGHT = 16000;

/** 单次截图的最大像素面积（宽 × 高），防止内存暴涨 */
const MAX_CANVAS_AREA = 64 * 1024 * 1024;

/** KaTeX 字体缓存：避免重复读取磁盘 */
let katexCssCache: string | null = null;

/**
 * 读取 KaTeX 样式表，并把字体文件内联为 base64 data URL，
 * 保证导出的 HTML 单文件离线可用。
 */
async function getKatexCss(): Promise<string> {
  if (katexCssCache !== null) return katexCssCache;

  try {
    // KaTeX 的样式与字体在构建时已复制到 dist/renderer/katex/，
    // 打包后位于 app.asar 内（Electron 已为 fs 打补丁，可直接读取），
    // 因此运行时完全不需要 node_modules。
    const cssPath = path.join(__dirname, '../renderer/katex/katex.min.css');
    let css = await fsp.readFile(cssPath, 'utf8');

    const fontDir = path.join(path.dirname(cssPath), 'fonts');
    // 把 url(fonts/xxx.woff2) 替换为内联的 base64
    css = await inlineFonts(css, fontDir);

    katexCssCache = css;
    return css;
  } catch (e) {
    logError(`读取 KaTeX 样式失败，公式可能无法正确排版（路径：${path.join(__dirname, '../renderer/katex/katex.min.css')}）`, e);
    katexCssCache = '';
    return '';
  }
}

/**
 * 把 CSS 中的字体引用替换为 base64 内联数据
 * @param css 原始 CSS
 * @param fontDir 字体所在目录
 */
async function inlineFonts(css: string, fontDir: string): Promise<string> {
  const urlRe = /url\(\s*(['"]?)(?:\.\/)?fonts\/([^'")]+)\1\s*\)/g;
  const cache = new Map<string, string>();
  const jobs: Array<{ full: string; file: string }> = [];

  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(css)) !== null) {
    jobs.push({ full: m[0], file: m[2] });
  }

  for (const job of jobs) {
    if (cache.has(job.file)) continue;
    try {
      const buf = await fsp.readFile(path.join(fontDir, job.file));
      const mime = job.file.endsWith('.woff2')
        ? 'font/woff2'
        : job.file.endsWith('.woff')
          ? 'font/woff'
          : 'font/ttf';
      cache.set(job.file, `url(data:${mime};base64,${buf.toString('base64')})`);
    } catch {
      cache.set(job.file, job.full); // 读不到就保持原样
    }
  }

  return css.replace(urlRe, (full, _q, file: string) => cache.get(file) ?? full);
}

/**
 * 生成完整的、可独立打开的 HTML 文档
 * @param options 导出参数
 */
export async function buildHtmlDocument(options: ExportOptions): Promise<string> {
  const settings = getAllSettings();
  const themeId = options.theme || String(settings['appearance.theme'] ?? 'github');
  const codeThemeId = String(settings['appearance.codeTheme'] ?? 'github');
  const withStyle = options.withStyle ?? settings['export.withStyle'] !== false;

  // 文档主题样式（用导出设置覆盖排版相关变量）
  let themeCss = buildDocumentCss(themeId, codeThemeId);
  const fontSize = Number(settings['appearance.fontSize'] ?? 16);
  const lineHeight = Number(settings['appearance.lineHeight'] ?? 1.7);
  const paraGap = Number(settings['appearance.paragraphSpacing'] ?? 1);
  const fontFamily = String(settings['appearance.fontFamily'] ?? 'sans-serif');
  const codeFont = String(settings['appearance.codeFontFamily'] ?? 'monospace');

  const overrides = `
.${DOC_ROOT_CLASS} {
  --doc-font-size: ${fontSize}px;
  --doc-line-height: ${lineHeight};
  --doc-para-gap: ${paraGap}em;
  --doc-font: ${fontFamily};
  --doc-code-font: ${codeFont};
}
`;

  // 文档中含有公式时才引入 KaTeX 样式，避免无谓的体积膨胀
  const needsKatex = /class="[^"]*katex/.test(options.html);
  const katexCss = needsKatex ? await getKatexCss() : '';

  const title = escapeHtml(options.title || '未命名文档');
  const date = new Date().toLocaleString('zh-CN');

  const styleBlock = withStyle
    ? `<style>
${themeCss}
${overrides}
${katexCss}

/* 页面基础样式 */
html, body { margin: 0; padding: 0; background: var(--doc-bg, #fff); }
body {
  padding: 40px 24px 60px;
  display: flex;
  justify-content: center;
}
.hsm-page {
  width: 100%;
  max-width: ${Number(settings['appearance.pageWidth'] ?? 800)}px;
}

/* 打印样式：控制分页，避免元素被拦腰截断 */
@media print {
  body { padding: 0; background: #fff; }
  .hsm-page { max-width: none; }
  h1, h2, h3, h4, h5, h6 { break-after: avoid-page; page-break-after: avoid; }
  pre, blockquote, table, img, .hsm-mermaid, .hsm-math-block {
    break-inside: avoid-page;
    page-break-inside: avoid;
  }
  tr, li { break-inside: avoid-page; page-break-inside: avoid; }
  a { color: inherit; text-decoration: none; }
}
</style>`
    : '';

  const footer = withStyle
    ? `<footer style="margin-top:48px;padding-top:16px;border-top:1px solid #e1e4e8;
         font-size:12px;color:#8b949e;text-align:center;font-family:sans-serif">
         本文档由「花生苗 Markdown 编辑器」导出 · 作者：何飞 · 微信：6731663 · 导出于 ${escapeHtml(date)}
       </footer>`
    : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="generator" content="花生苗 Markdown 编辑器">
<meta name="author" content="何飞（微信 6731663）">
<title>${title}</title>
${styleBlock}
</head>
<body>
<div class="hsm-page">
<div class="${DOC_ROOT_CLASS}">
${options.html}
</div>
${footer}
</div>
</body>
</html>`;
}

/**
 * 执行导出
 * @param options 导出参数
 * @param outputPath 输出文件绝对路径
 */
export async function exportDocument(options: ExportOptions, outputPath: string): Promise<ExportResult> {
  try {
    await fsp.mkdir(path.dirname(outputPath), { recursive: true });

    switch (options.format) {
      case 'html':
        return await exportHtml(options, outputPath);
      case 'html-plain':
        return await exportHtmlPlain(options, outputPath);
      case 'pdf':
        return await exportPdf(options, outputPath);
      case 'png':
        return await exportPng(options, outputPath);
      case 'docx':
      case 'latex':
      case 'epub':
      case 'rtf':
        return await exportViaPandoc(options, outputPath);
      default:
        return { ok: false, error: `暂不支持的导出格式：${options.format}` };
    }
  } catch (e) {
    logError(`导出失败：${options.format}`, e);
    recordExport(options, outputPath, 'failed', (e as Error).message);
    return { ok: false, error: (e as Error).message };
  }
}

/** 记录导出历史 */
function recordExport(options: ExportOptions, outputPath: string, status: string, errorMsg?: string): void {
  let size = 0;
  try {
    size = fs.statSync(outputPath).size;
  } catch {
    /* 文件不存在则记 0 */
  }
  run(
    `INSERT INTO export_history (doc_path, format, output_path, file_size, status, error_msg)
     VALUES (?, ?, ?, ?, ?, ?)`,
    options.docPath || null,
    options.format,
    outputPath,
    size,
    status,
    errorMsg ?? null,
  );
}

/** 导出带样式 HTML */
async function exportHtml(options: ExportOptions, outputPath: string): Promise<ExportResult> {
  const html = await buildHtmlDocument({ ...options, withStyle: true });
  await fsp.writeFile(outputPath, html, 'utf8');
  const size = (await fsp.stat(outputPath)).size;
  recordExport(options, outputPath, 'success');
  logInfo(`HTML 已导出：${outputPath}`);
  return { ok: true, outputPath, fileSize: size };
}

/** 导出无样式（纯语义化）HTML */
async function exportHtmlPlain(options: ExportOptions, outputPath: string): Promise<ExportResult> {
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(options.title || '未命名文档')}</title>
</head>
<body>
${options.html}
</body>
</html>`;
  await fsp.writeFile(outputPath, html, 'utf8');
  const size = (await fsp.stat(outputPath)).size;
  recordExport(options, outputPath, 'success');
  return { ok: true, outputPath, fileSize: size };
}

/* ==================================================================
 * PDF 导出
 * ================================================================== */

/**
 * 创建用于后台渲染的隐藏窗口
 *
 * @param width 视口宽度
 * @param height 视口高度
 * @param offscreen 是否启用离屏渲染
 *   · PDF 导出走 Chromium 的打印管线，普通隐藏窗口即可；
 *   · 长图（PNG）导出依赖 webContents.capturePage，
 *     而 capturePage 需要窗口被合成器绘制。在无图形界面（CI / 服务器）
 *     环境下普通隐藏窗口不会被合成，capturePage 会一直挂起；
 *     开启 offscreen 后 Electron 使用软件光栅化主动产出帧，
 *     因此无论在桌面还是服务器上都能稳定截图。
 */
async function createHiddenWindow(width: number, height: number, offscreen = false): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    width: Math.max(320, Math.round(width)),
    height: Math.max(240, Math.round(height)),
    show: false,
    webPreferences: {
      offscreen,
      javascript: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      // 允许加载本地图片（file:// 协议）
      webSecurity: true,
    },
  });
  win.setMenuBarVisibility(false);
  return win;
}

/**
 * 带超时保护的页面截图
 * 避免在极端环境下 capturePage 永久挂起，导致导出流程卡死。
 *
 * @param win 目标窗口
 * @param timeoutMs 超时时间（毫秒）
 */
async function capturePageWithTimeout(win: BrowserWindow, timeoutMs = 20000) {
  return await Promise.race([
    win.webContents.capturePage(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`截图超时（${timeoutMs} 毫秒）`)), timeoutMs),
    ),
  ]);
}

/**
 * 把 HTML 写入临时文件并加载到隐藏窗口
 * 使用临时文件而非 data: URL，避免超长文档触发 URL 长度限制。
 */
async function loadHtmlIntoWindow(win: BrowserWindow, html: string): Promise<void> {
  const tmpFile = path.join(app.getPath('temp'), `hsm-export-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  await fsp.writeFile(tmpFile, html, 'utf8');
  await win.loadFile(tmpFile);
  // 等待字体与图片加载完毕，最多等 8 秒
  await waitForResources(win);
  try {
    await fsp.unlink(tmpFile);
  } catch {
    /* 临时文件清理失败可忽略 */
  }
}

/** 等待页面内的图片与字体加载完成 */
async function waitForResources(win: BrowserWindow): Promise<void> {
  const script = `(async () => {
    // 等待所有图片加载完成或失败
    const imgs = Array.from(document.images || []);
    await Promise.all(imgs.map(img => img.complete ? null : new Promise(r => {
      img.addEventListener('load', r, { once: true });
      img.addEventListener('error', r, { once: true });
      setTimeout(r, 4000);
    })));
    // 等待字体就绪
    try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) {}
    // 等待 Mermaid 等异步渲染完成
    await new Promise(r => setTimeout(r, 250));
    return true;
  })()`;

  try {
    await Promise.race([
      win.webContents.executeJavaScript(script, true),
      new Promise((r) => setTimeout(r, 8000)),
    ]);
  } catch {
    /* 超时或脚本失败都继续导出，保证主流程不中断 */
  }
}

/** 导出 PDF */
async function exportPdf(options: ExportOptions, outputPath: string): Promise<ExportResult> {
  const settings = getAllSettings();
  const pageWidth = Number(settings['appearance.pageWidth'] ?? 800);

  const html = await buildHtmlDocument({ ...options, withStyle: true });
  const win = await createHiddenWindow(pageWidth + 80, 1000);

  try {
    await loadHtmlIntoWindow(win, html);

    const pageSize = options.pageSize || String(settings['export.pageSize'] ?? 'A4');
    const margin = options.margin || String(settings['export.margin'] ?? '20mm');
    const withHeaderFooter = options.withHeaderFooter ?? settings['export.withHeaderFooter'] === true;

    // printToPDF 的 margin 需要按上/下/左/右分别给出
    const m = parseMargin(margin);
    const title = escapeHtml(options.title || '未命名文档');

    const data = await win.webContents.printToPDF({
      pageSize: normalizePageSize(pageSize),
      landscape: false,
      printBackground: true,
      margins: { top: m.top, bottom: m.bottom, left: m.left, right: m.right },
      headerTemplate: withHeaderFooter
        ? `<div style="font-size:9px;color:#8b949e;width:100%;padding:0 12mm;
             font-family:sans-serif;display:flex;justify-content:space-between">
             <span>${title}</span>
             <span>花生苗 Markdown 编辑器</span>
           </div>`
        : '<div></div>',
      footerTemplate: withHeaderFooter
        ? `<div style="font-size:9px;color:#8b949e;width:100%;padding:0 12mm;
             font-family:sans-serif;text-align:center">
             第 <span class="pageNumber"></span> 页 / 共 <span class="totalPages"></span> 页
           </div>`
        : '<div></div>',
    });

    await fsp.writeFile(outputPath, data);
    recordExport(options, outputPath, 'success');
    logInfo(`PDF 已导出：${outputPath}`);
    return { ok: true, outputPath, fileSize: data.length };
  } catch (e) {
    logError('PDF 导出失败', e);
    recordExport(options, outputPath, 'failed', (e as Error).message);
    return { ok: false, error: `PDF 导出失败：${(e as Error).message}` };
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

/** 把 CSS 长度值解析为 printToPDF 需要的英寸数值 */
function parseMargin(margin: string): { top: number; bottom: number; left: number; right: number } {
  const toInch = (s: string): number => {
    const v = parseFloat(s);
    if (!Number.isFinite(v)) return 0.79; // 默认 20mm
    if (s.includes('mm')) return v / 25.4;
    if (s.includes('cm')) return v / 2.54;
    if (s.includes('in')) return v;
    if (s.includes('pt')) return v / 72;
    if (s.includes('px')) return v / 96;
    return v / 25.4;
  };

  const parts = margin.trim().split(/\s+/);
  switch (parts.length) {
    case 1: {
      const a = toInch(parts[0]);
      return { top: a, bottom: a, left: a, right: a };
    }
    case 2: {
      const v = toInch(parts[0]);
      const h = toInch(parts[1]);
      return { top: v, bottom: v, left: h, right: h };
    }
    case 4:
      return {
        top: toInch(parts[0]),
        right: toInch(parts[1]),
        bottom: toInch(parts[2]),
        left: toInch(parts[3]),
      };
    default: {
      const a = toInch(parts[0]);
      return { top: a, bottom: a, left: a, right: a };
    }
  }
}

/** 规范化纸张尺寸名称（Electron 只接受固定枚举） */
function normalizePageSize(size: string): 'A3' | 'A4' | 'A5' | 'Legal' | 'Letter' | 'Tabloid' {
  const allowed = ['A3', 'A4', 'A5', 'Legal', 'Letter', 'Tabloid'] as const;
  const found = allowed.find((a) => a.toLowerCase() === size.toLowerCase());
  return found ?? 'A4';
}

/* ==================================================================
 * PNG 长图导出
 * ================================================================== */

/** 导出整篇文档为长图 */
async function exportPng(options: ExportOptions, outputPath: string): Promise<ExportResult> {
  const settings = getAllSettings();
  const pageWidth = Number(settings['appearance.pageWidth'] ?? 800);
  const scale = Math.max(1, Math.min(4, Number(settings['export.pngScale'] ?? 2)));

  // 长图模式下不限制页宽，尽量还原阅读宽度
  const html = await buildHtmlDocument({ ...options, withStyle: true });

  // 使用离屏渲染窗口：保证在无图形界面的环境下也能正常截图
  const win = await createHiddenWindow(pageWidth + 80, 1200, true);

  try {
    await loadHtmlIntoWindow(win, html);

    // 测量正文的真实高度
    const measured = (await win.webContents.executeJavaScript(
      `Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 600)`,
      true,
    )) as number;

    const width = pageWidth + 80;
    const height = Math.ceil(measured);

    // 计算缩放系数：既要规避单张画布的高度上限，也要控制总像素面积
    let factor = 1;
    if (height > MAX_CANVAS_HEIGHT) factor = MAX_CANVAS_HEIGHT / height;
    const area = width * height * factor * factor;
    if (area > MAX_CANVAS_AREA) factor = Math.min(factor, Math.sqrt(MAX_CANVAS_AREA / (width * height)));
    factor = Math.max(0.15, factor);

    // 按缩放后的尺寸调整窗口，使整篇文档在一屏内完成绘制
    const targetWidth = Math.max(320, Math.ceil(width * factor));
    const targetHeight = Math.max(600, Math.min(Math.ceil(height * factor), MAX_CANVAS_HEIGHT));
    win.setContentSize(targetWidth, targetHeight);

    // 等待重排与重绘完成
    await new Promise((r) => setTimeout(r, 400));

    // 若用户设置的倍率大于 1 且画布允许，则按倍率放大以获得更清晰的图片
    const canUpscale = factor === 1 && scale > 1 && targetHeight * scale <= MAX_CANVAS_HEIGHT;
    if (canUpscale) {
      win.webContents.setZoomFactor(scale);
      win.setContentSize(Math.ceil(width * scale), Math.min(Math.ceil(height * scale), MAX_CANVAS_HEIGHT));
      await new Promise((r) => setTimeout(r, 400));
    }

    const image = await capturePageWithTimeout(win);
    const png = image.toPNG();

    await fsp.writeFile(outputPath, png);
    recordExport(options, outputPath, 'success');
    logInfo(`长图已导出：${outputPath}（${png.length} 字节）`);
    return { ok: true, outputPath, fileSize: png.length };
  } catch (e) {
    logError('长图导出失败', e);
    recordExport(options, outputPath, 'failed', (e as Error).message);
    return { ok: false, error: `导出长图失败：${(e as Error).message}` };
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

/* ==================================================================
 * Pandoc 转换（Word / LaTeX / ePub / RTF）
 * ================================================================== */

/** 缓存 Pandoc 可执行文件路径：undefined 表示尚未检测，null 表示未安装 */
let pandocPath: string | null | undefined;

/**
 * 检测系统中是否安装了 Pandoc
 * @returns Pandoc 可执行文件路径；未安装返回 null
 */
export async function detectPandoc(): Promise<string | null> {
  if (pandocPath !== undefined) return pandocPath;

  const candidates = process.platform === 'win32' ? ['pandoc.exe', 'pandoc'] : ['pandoc'];
  for (const cmd of candidates) {
    try {
      const { stdout } = await execFileAsync(cmd, ['--version'], { timeout: 5000 });
      if (/pandoc/i.test(stdout)) {
        pandocPath = cmd;
        logInfo(`检测到 Pandoc：${stdout.split('\n')[0]}`);
        return pandocPath;
      }
    } catch {
      /* 继续尝试下一个候选 */
    }
  }
  pandocPath = null;
  return null;
}

/** 通过 Pandoc 完成格式转换 */
async function exportViaPandoc(options: ExportOptions, outputPath: string): Promise<ExportResult> {
  const pandoc = await detectPandoc();
  if (!pandoc) {
    return {
      ok: false,
      error:
        '未检测到 Pandoc。导出 Word / LaTeX / ePub / RTF 需要安装 Pandoc（免费开源，https://pandoc.org）。' +
        '安装后重新启动本软件即可自动识别；HTML 与 PDF 导出无需 Pandoc。',
    };
  }

  const tmpMd = path.join(app.getPath('temp'), `hsm-pandoc-${Date.now()}.md`);

  try {
    // Pandoc 以 Markdown 为输入最可靠，因此直接使用原始 Markdown 文本
    const markdown = options.html; // 调用方在 Pandoc 分支中传入的是原始 Markdown
    await fsp.writeFile(tmpMd, markdown, 'utf8');

    const args = [tmpMd, '-o', outputPath, '--standalone', `--resource-path=${path.dirname(options.docPath || '.')}`];

    if (options.title) args.push(`--metadata=title:${options.title}`);
    if (options.format === 'docx') args.push('-t', 'docx');
    if (options.format === 'latex') args.push('-t', 'latex');
    if (options.format === 'epub') args.push('-t', 'epub3');
    if (options.format === 'rtf') args.push('-t', 'rtf');

    await execFileAsync(pandoc, args, { timeout: 120000, maxBuffer: 32 * 1024 * 1024 });

    const size = (await fsp.stat(outputPath)).size;
    recordExport(options, outputPath, 'success');
    logInfo(`Pandoc 导出完成：${outputPath}`);
    return { ok: true, outputPath, fileSize: size };
  } catch (e) {
    logError('Pandoc 转换失败', e);
    recordExport(options, outputPath, 'failed', (e as Error).message);
    return { ok: false, error: `Pandoc 转换失败：${(e as Error).message}` };
  } finally {
    try {
      await fsp.unlink(tmpMd);
    } catch {
      /* 忽略 */
    }
  }
}

/** HTML 文本转义 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 用系统默认程序打开文件（导出完成后调用） */
export async function openExportedFile(filePath: string): Promise<void> {
  try {
    const err = await shell.openPath(filePath);
    if (err) logError(`打开导出文件失败：${filePath}`, err);
  } catch (e) {
    logError('打开导出文件时出错', e);
  }
}
