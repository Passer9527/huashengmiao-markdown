/**
 * 花生苗 Markdown 编辑器 —— 构建脚本
 * ------------------------------------------------------------------
 * 使用 esbuild 完成三类产物的构建：
 *   1. 主进程  (src/main/main.ts)        -> dist/main/main.js        (CommonJS / Node)
 *   2. 预加载  (src/preload/preload.ts)   -> dist/preload/preload.js  (CommonJS / Node)
 *   3. 渲染进程(src/renderer/main.ts)     -> dist/renderer/renderer.js(IIFE / 浏览器)
 *      以及独立按需加载的 Mermaid 渲染包 -> dist/renderer/mermaid.js
 *      样式表                            -> dist/renderer/renderer.css
 *
 * 说明：渲染进程使用 IIFE 格式而非 ESM，原因是页面通过 file:// 协议加载，
 *       Chromium 会以 CORS 策略拦截 file:// 下的模块化 import。
 *
 * 作者：何飞    联系方式：微信 6731663
 * 开源协议：MIT
 */

import * as esbuild from 'esbuild';
import { cp, mkdir, rm, readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const WATCH = process.argv.includes('--watch');
const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));

/** 注入到产物中的编译期常量 */
const define = {
  __APP_VERSION__: JSON.stringify(pkg.version),
  __APP_NAME__: JSON.stringify(pkg.productName),
  __APP_AUTHOR__: JSON.stringify(pkg.author.name),
  __APP_CONTACT__: JSON.stringify('微信 6731663'),
  __APP_HOMEPAGE__: JSON.stringify(pkg.homepage),
  __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
};

/** 主进程与预加载脚本：Node 环境，CommonJS，electron 作为外部依赖 */
const nodeCommon = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: WATCH ? 'inline' : false,
  minify: !WATCH,
  external: ['electron'],
  define,
  logLevel: 'info',
};

/** 渲染进程：浏览器环境 */
const browserCommon = {
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'chrome120',
  sourcemap: WATCH ? 'inline' : false,
  minify: !WATCH,
  define,
  logLevel: 'info',
  loader: {
    // 字体文件按原样拷贝到 dist/renderer/fonts/ 下
    '.woff2': 'file',
    '.woff': 'file',
    '.ttf': 'file',
  },
  assetNames: 'fonts/[name]-[hash]',
};

/** 构建目标清单 */
const targets = [
  {
    name: '主进程',
    options: {
      ...nodeCommon,
      entryPoints: [path.join(ROOT, 'src/main/main.ts')],
      outfile: path.join(DIST, 'main/main.js'),
    },
  },
  {
    name: '预加载脚本',
    options: {
      ...nodeCommon,
      entryPoints: [path.join(ROOT, 'src/preload/preload.ts')],
      outfile: path.join(DIST, 'preload/preload.js'),
    },
  },
  {
    name: '渲染进程脚本',
    options: {
      ...browserCommon,
      entryPoints: [path.join(ROOT, 'src/renderer/main.ts')],
      outfile: path.join(DIST, 'renderer/renderer.js'),
    },
  },
  {
    name: 'Shiki 代码高亮包',
    options: {
      ...browserCommon,
      entryPoints: [path.join(ROOT, 'src/renderer/editor/shiki-entry.ts')],
      outfile: path.join(DIST, 'renderer/shiki.js'),
      // 与 Mermaid 同理：体积较大且只在出现代码块时才需要，单独成包按需加载
      minify: true,
    },
  },
  {
    name: 'Mermaid 按需包',
    options: {
      ...browserCommon,
      entryPoints: [path.join(ROOT, 'src/renderer/editor/mermaid-entry.ts')],
      outfile: path.join(DIST, 'renderer/mermaid.js'),
      // Mermaid 体积较大，单独成包并按需注入，避免拖慢首屏
      minify: true,
    },
  },
  {
    name: '样式表',
    options: {
      ...browserCommon,
      entryPoints: [path.join(ROOT, 'src/renderer/styles/index.css')],
      outfile: path.join(DIST, 'renderer/renderer.css'),
      minify: !WATCH,
    },
  },
];

/** 静态资源拷贝 */
async function copyStatic() {
  // 页面骨架
  await cp(path.join(ROOT, 'src/renderer/index.html'), path.join(DIST, 'renderer/index.html'));

  // KaTeX 的样式表与字体：导出 HTML / PDF 时需要把公式字体内联为 base64。
  // 这里复制到自有产物目录，而不是运行时去 node_modules 里找，
  // 好处是：安装包里可以完全不含 node_modules，体积大幅减小。
  const katexSrc = path.join(ROOT, 'node_modules/katex/dist');
  const katexDest = path.join(DIST, 'renderer/katex');
  if (existsSync(katexSrc)) {
    await mkdir(katexDest, { recursive: true });
    await cp(path.join(katexSrc, 'katex.min.css'), path.join(katexDest, 'katex.min.css'));
    await cp(path.join(katexSrc, 'fonts'), path.join(katexDest, 'fonts'), { recursive: true });
    console.log('  ✓ KaTeX 样式与字体已纳入产物');
  } else {
    console.warn('  ⚠ 未找到 katex/dist，导出公式时可能缺少字体');
  }
  // 应用图标与内置资源
  if (existsSync(path.join(ROOT, 'resources'))) {
    await mkdir(path.join(DIST, 'resources'), { recursive: true });
    await cp(path.join(ROOT, 'resources'), path.join(DIST, 'resources'), { recursive: true });
  }
  // 第三方许可证（开源合规）
  for (const f of ['LICENSE', 'THIRD-PARTY-LICENSES.md', 'README.md']) {
    const src = path.join(ROOT, f);
    if (existsSync(src)) await cp(src, path.join(DIST, f));
  }
}

/** 构建主流程 */
async function buildAll() {
  await rm(DIST, { recursive: true, force: true });
  const started = Date.now();

  for (const t of targets) {
    const t0 = Date.now();
    await esbuild.build(t.options);
    console.log(`  ✓ ${t.name} 完成（${Date.now() - t0} ms）`);
  }
  await copyStatic();

  // 输出体积速览，便于把控包体大小
  console.log('\n产物体积：');
  for (const f of [
    'main/main.js',
    'preload/preload.js',
    'renderer/renderer.js',
    'renderer/mermaid.js',
    'renderer/shiki.js',
    'renderer/renderer.css',
  ]) {
    const p = path.join(DIST, f);
    if (existsSync(p)) {
      const s = (await stat(p)).size;
      console.log(`  ${f.padEnd(28)} ${(s / 1024).toFixed(1)} KB`);
    }
  }
  console.log(`\n总耗时 ${Date.now() - started} ms\n`);
}

/** 监听模式 */
async function watchAll() {
  await mkdir(DIST, { recursive: true });
  await copyStatic();
  const contexts = await Promise.all(targets.map((t) => esbuild.context(t.options)));
  await Promise.all(contexts.map((c) => c.watch()));
  // HTML 变更时同步拷贝（esbuild 不处理 html 入口）
  const { watch } = await import('node:fs');
  watch(path.join(ROOT, 'src/renderer/index.html'), () => {
    cp(path.join(ROOT, 'src/renderer/index.html'), path.join(DIST, 'renderer/index.html'))
      .then(() => console.log('  ✓ index.html 已同步'))
      .catch(() => {});
  });
  console.log('监听模式已启动，修改源码后自动重建…');
}

if (WATCH) {
  await watchAll();
} else {
  await buildAll();
}
