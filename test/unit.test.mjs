/**
 * 花生苗 Markdown 编辑器 —— 单元测试
 * ------------------------------------------------------------------
 * 使用 Node 内置的 node:test 测试框架，先用 esbuild 把 TypeScript
 * 源码打包成临时 CommonJS 模块再引入，因此无需额外的测试工具链。
 *
 * 覆盖范围：
 *   · 快捷键组合的解析、格式化与匹配
 *   · 跨平台路径工具
 *   · Markdown 标题提取、Front Matter 分离、文档统计
 *   · 内置主题与设置定义的完整性
 *
 * 用法：npm test
 *
 * 作者：何飞    联系方式：微信 6731663
 * 开源协议：MIT
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hsm-test-'));

/**
 * 把 TypeScript 模块打包成 CJS 并动态引入
 * @param relativePath 相对项目根目录的源码路径
 */
async function loadModule(relativePath) {
  const outfile = path.join(TMP, relativePath.replace(/[\\/]/g, '_').replace(/\.ts$/, '.cjs'));
  await esbuild.build({
    entryPoints: [path.join(ROOT, relativePath)],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    logLevel: 'silent',
    define: {
      __APP_VERSION__: '"1.0.0"',
      __APP_NAME__: '"花生苗Markdown编辑器"',
      __APP_AUTHOR__: '"何飞"',
      __APP_CONTACT__: '"微信 6731663"',
      __APP_HOMEPAGE__: '"https://example.com"',
      __BUILD_TIME__: '"2025-01-01T00:00:00.000Z"',
    },
  });
  return import(pathToFileURL(outfile).href);
}

/* 一次性加载被测模块 */
const commands = await loadModule('src/shared/commands.ts');
const paths = await loadModule('src/shared/path-utils.ts');
const markdown = await loadModule('src/renderer/editor/markdown.ts');
const settingsDefs = await loadModule('src/shared/settings-defs.ts');
const themes = await loadModule('src/shared/themes.ts');

/* ==================================================================
 * 一、快捷键组合
 * ================================================================== */

test('parseKeyCombo：解析修饰键与主键', () => {
  const p = commands.parseKeyCombo('Mod+Shift+Z');
  assert.equal(p.mod, true);
  assert.equal(p.shift, true);
  assert.equal(p.ctrl, false);
  assert.equal(p.alt, false);
  assert.equal(p.key, 'Z');
});

test('parseKeyCombo：方向键与功能键别名归一化', () => {
  assert.equal(commands.parseKeyCombo('Alt+ArrowUp').key, 'ArrowUp');
  assert.equal(commands.parseKeyCombo('Alt+up').key, 'ArrowUp');
  assert.equal(commands.parseKeyCombo('F8').key, 'F8');
  assert.equal(commands.parseKeyCombo('Mod+Shift+BracketLeft').key, '[');
  assert.equal(commands.parseKeyCombo('Mod+Shift+Minus').key, '-');
});

test('parseKeyCombo：非法输入返回 null', () => {
  assert.equal(commands.parseKeyCombo(''), null);
  assert.equal(commands.parseKeyCombo('Shift+'), null);
  assert.equal(commands.parseKeyCombo('+'), null);
});

test('formatCombo：Windows 与 macOS 展示风格不同', () => {
  assert.equal(commands.formatCombo('Mod+B', false), 'Ctrl+B');
  assert.equal(commands.formatCombo('Mod+Shift+Z', false), 'Ctrl+Shift+Z');
  assert.equal(commands.formatCombo('Mod+B', true), '⌘B');
  assert.equal(commands.formatCombo('Alt+ArrowUp', false), 'Alt+↑');
  assert.equal(commands.formatCombo('', false), '未绑定');
});

test('eventToCombo：非 macOS 上 Ctrl 映射为 Mod', () => {
  const combo = commands.eventToCombo({
    key: 'b',
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
  });
  // Node 环境下 navigator.userAgent 不含 Mac，因此走非 macOS 分支
  assert.equal(combo, 'Mod+B');
});

test('eventToCombo：只按下修饰键时不产生组合', () => {
  const combo = commands.eventToCombo({
    key: 'Control',
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
  });
  assert.equal(combo, '');
});

test('isBindableCombo：需要修饰键或为功能键', () => {
  assert.equal(commands.isBindableCombo('Mod+B'), true);
  assert.equal(commands.isBindableCombo('F8'), true);
  assert.equal(commands.isBindableCombo('B'), false);
  assert.equal(commands.isBindableCombo('Shift+B'), false);
  assert.equal(commands.isBindableCombo(''), false);
});

test('命令表：ID 唯一且默认快捷键无冲突', () => {
  const ids = commands.COMMANDS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, '存在重复的命令 ID');

  const used = new Map();
  const conflicts = [];
  for (const c of commands.COMMANDS) {
    if (!c.defaultKey) continue;
    if (used.has(c.defaultKey)) conflicts.push(`${c.defaultKey}: ${used.get(c.defaultKey)} ↔ ${c.id}`);
    else used.set(c.defaultKey, c.id);
  }
  assert.deepEqual(conflicts, [], `默认快捷键存在冲突：${conflicts.join('; ')}`);
});

test('命令表：必需的命令全部存在', () => {
  const required = [
    'file.new', 'file.open', 'file.save', 'file.saveAs', 'file.quickOpen', 'file.settings',
    'edit.undo', 'edit.redo', 'edit.find', 'edit.replace',
    'format.bold', 'format.italic', 'format.link', 'format.table', 'format.codeBlock', 'format.mathBlock',
    'view.toggleSource', 'view.focusMode', 'view.typewriter', 'view.fullscreen', 'view.toggleSidebar',
    'help.shortcuts', 'help.about',
  ];
  const ids = new Set(commands.COMMANDS.map((c) => c.id));
  const missing = required.filter((id) => !ids.has(id));
  assert.deepEqual(missing, [], `缺少命令：${missing.join(', ')}`);
});

/* ==================================================================
 * 二、路径工具
 * ================================================================== */

test('path-utils：dirname / basename / extname / stem', () => {
  assert.equal(paths.dirname('/home/me/docs/a.md'), '/home/me/docs');
  assert.equal(paths.basename('/home/me/docs/a.md'), 'a.md');
  assert.equal(paths.extname('/home/me/docs/a.md'), '.md');
  assert.equal(paths.stem('/home/me/docs/a.md'), 'a');
  assert.equal(paths.dirname('C:\\Users\\me\\a.md'), 'C:/Users/me');
  assert.equal(paths.basename('C:\\Users\\me\\a.md'), 'a.md');
});

test('path-utils：resolve 处理相对路径与上级目录', () => {
  assert.equal(paths.resolve('assets/a.png', '/home/me/docs'), '/home/me/docs/assets/a.png');
  assert.equal(paths.resolve('../img/a.png', '/home/me/docs'), '/home/me/img/a.png');
  assert.equal(paths.resolve('./a.png', '/home/me/docs'), '/home/me/docs/a.png');
  assert.equal(paths.resolve('/abs/a.png'), '/abs/a.png');
});

test('path-utils：relative 计算相对路径', () => {
  assert.equal(paths.relative('/home/me/docs', '/home/me/docs/assets/a.png'), 'assets/a.png');
  assert.equal(paths.relative('/home/me/docs/sub', '/home/me/docs/a.png'), '../a.png');
});

test('path-utils：toFileUrl 处理空格与中文', () => {
  const url = paths.toFileUrl('/home/me/我的 文档/a.png');
  assert.ok(url.startsWith('file://'), url);
  assert.ok(url.includes('%20'), '空格应被编码：' + url);
});

test('path-utils：resolveResourceUrl 各类地址', () => {
  assert.equal(paths.resolveResourceUrl('https://a.com/b.png', '/x/y.md'), 'https://a.com/b.png');
  assert.equal(paths.resolveResourceUrl('data:image/png;base64,AAA', '/x/y.md'), 'data:image/png;base64,AAA');
  const rel = paths.resolveResourceUrl('./assets/a.png', '/x/docs/y.md');
  assert.ok(rel.startsWith('file://'), rel);
  assert.ok(rel.endsWith('/x/docs/assets/a.png'), rel);
  const abs = paths.resolveResourceUrl('/pics/a.png', '/x/y.md');
  assert.equal(abs, 'file:///pics/a.png');
});

/* ==================================================================
 * 三、Markdown 解析
 * ================================================================== */

test('slugify：中文与英文标题都能生成锚点', () => {
  assert.equal(markdown.slugify('Hello World'), 'hello-world');
  assert.equal(markdown.slugify('项目介绍'), '项目介绍');
  // 连续的分隔符会被压缩成单个连字符，避免生成又长又难看的锚点
  assert.equal(markdown.slugify('第一章 · 概述'), '第一章-概述');
});

test('slugify：重复标题自动去重', () => {
  const used = new Set();
  assert.equal(markdown.slugify('标题', used), '标题');
  assert.equal(markdown.slugify('标题', used), '标题-1');
  assert.equal(markdown.slugify('标题', used), '标题-2');
});

test('extractHeadings：识别 ATX 标题与层级', () => {
  const src = '# 一级\n\n内容\n\n## 二级\n\n### 三级\n';
  const hs = markdown.extractHeadings(src);
  assert.equal(hs.length, 3);
  assert.deepEqual(hs.map((h) => h.level), [1, 2, 3]);
  assert.deepEqual(hs.map((h) => h.text), ['一级', '二级', '三级']);
  assert.equal(hs[0].line, 0);
  assert.equal(hs[1].line, 4);
});

test('extractHeadings：跳过代码块中的伪标题', () => {
  const src = '# 真标题\n\n```\n# 代码里的假标题\n```\n\n## 另一个真标题\n';
  const hs = markdown.extractHeadings(src);
  assert.equal(hs.length, 2);
  assert.deepEqual(hs.map((h) => h.text), ['真标题', '另一个真标题']);
});

test('extractHeadings：跳过 Front Matter', () => {
  const src = '---\ntitle: 我的文档\n---\n\n# 正文标题\n';
  const hs = markdown.extractHeadings(src);
  assert.equal(hs.length, 1);
  assert.equal(hs[0].text, '正文标题');
});

test('extractHeadings：支持 Setext 标题', () => {
  const src = '一级标题\n========\n\n二级标题\n--------\n';
  const hs = markdown.extractHeadings(src);
  assert.deepEqual(hs.map((h) => h.level), [1, 2]);
});

test('extractHeadings：剥离标题中的行内标记', () => {
  const hs = markdown.extractHeadings('## **加粗**与`代码`与[链接](http://a.com)\n');
  assert.equal(hs[0].text, '加粗与代码与链接');
});

test('splitFrontMatter：正确分离元数据与正文', () => {
  const src = '---\ntitle: 测试\nauthor: 何飞\n---\n\n# 正文\n';
  const { frontMatter, body } = markdown.splitFrontMatter(src);
  assert.ok(frontMatter.includes('author: 何飞'));
  assert.equal(body.trim(), '# 正文');
});

test('splitFrontMatter：无元数据时原样返回', () => {
  const { frontMatter, body } = markdown.splitFrontMatter('# 标题\n内容');
  assert.equal(frontMatter, '');
  assert.equal(body, '# 标题\n内容');
});

test('computeStats：中文按字数、英文按词数统计', () => {
  const stats = markdown.computeStats('你好世界\n\nhello world foo\n');
  assert.equal(stats.cjkChars, 4);
  assert.equal(stats.words, 3);
  // 末尾换行符会产生一个空行，因此总行数为 4
  assert.equal(stats.lines, 4);
  assert.ok(stats.readingMinutes >= 1);
});

test('computeStats：统计行数与段落数', () => {
  const stats = markdown.computeStats('第一段\n\n第二段\n\n第三段');
  assert.equal(stats.lines, 5);
  assert.equal(stats.paragraphs, 3);
});

test('computeStats：代码块内容不计入字数', () => {
  const withCode = markdown.computeStats('正文\n\n```js\nconst veryLongVariableName = 12345;\n```\n');
  const withoutCode = markdown.computeStats('正文\n');
  assert.equal(withCode.chars, withoutCode.chars);
});

test('buildTocHtml：按层级生成目录', () => {
  const hs = [
    { level: 1, text: '甲', line: 0, id: '甲' },
    { level: 2, text: '乙', line: 2, id: '乙' },
  ];
  const html = markdown.buildTocHtml(hs);
  assert.ok(html.includes('hsm-toc-level-1'));
  assert.ok(html.includes('hsm-toc-level-2'));
  assert.ok(html.includes('href="#甲"'));
});

test('parseImageParams：解析宽度与对齐', () => {
  assert.deepEqual(markdown.parseImageParams('width=300 align=center'), { width: 300, align: 'center' });
  assert.deepEqual(markdown.parseImageParams('说明文字'), {});
});

test('renderDocument：渲染基础语法并生成标题列表', () => {
  const md = markdown.createMarkdownIt();
  const result = markdown.renderDocument(md, '# 标题\n\n**加粗**与`代码`\n', { docPath: '/tmp/a.md' });
  assert.ok(result.html.includes('hsm') || result.html.includes('<strong>'));
  assert.ok(result.html.includes('<strong>'));
  assert.ok(result.html.includes('<code>'));
  assert.equal(result.headings.length, 1);
});

test('renderDocument：渲染数学公式为 KaTeX 结构', () => {
  const md = markdown.createMarkdownIt();
  const result = markdown.renderDocument(md, '行内 $E = mc^2$ 公式\n', { docPath: '/tmp/a.md' });
  assert.ok(result.html.includes('katex'), '应包含 KaTeX 渲染结果');
});

test('renderDocument：阻止原始 HTML 被解析（安全）', () => {
  const md = markdown.createMarkdownIt();
  const result = markdown.renderDocument(md, '<script>alert(1)</script>\n', { docPath: '/tmp/a.md' });
  assert.ok(!result.html.includes('<script>'), '不应输出可执行脚本标签');
});

test('renderDocument：Mermaid 代码块生成占位容器', () => {
  const md = markdown.createMarkdownIt();
  const result = markdown.renderDocument(md, '```mermaid\nflowchart LR\n A-->B\n```\n', { docPath: '/tmp/a.md' });
  assert.ok(result.html.includes('hsm-mermaid'), '应生成 Mermaid 占位容器');
  assert.ok(result.html.includes('data-mermaid'), '应携带图表源码');
});

test('renderDocument：[TOC] 替换为目录', () => {
  const md = markdown.createMarkdownIt();
  const result = markdown.renderDocument(md, '# 甲\n\n[TOC]\n\n## 乙\n', { docPath: '/tmp/a.md' });
  assert.ok(result.html.includes('hsm-toc'), '应生成目录结构');
});

/* ==================================================================
 * 四、设置与主题
 * ================================================================== */

test('设置定义：键名唯一且分组合法', () => {
  const keys = settingsDefs.SETTING_DEFS.map((d) => d.key);
  assert.equal(new Set(keys).size, keys.length, '存在重复的设置键');

  const validGroups = new Set(settingsDefs.SETTING_GROUPS);
  for (const d of settingsDefs.SETTING_DEFS) {
    assert.ok(validGroups.has(d.group), `设置 ${d.key} 的分组非法：${d.group}`);
  }
});

test('设置定义：默认值类型与声明一致', () => {
  for (const d of settingsDefs.SETTING_DEFS) {
    if (d.type === 'boolean') assert.equal(typeof d.default, 'boolean', `${d.key} 默认值应为布尔`);
    else if (d.type === 'number') assert.equal(typeof d.default, 'number', `${d.key} 默认值应为数字`);
    else assert.equal(typeof d.default, 'string', `${d.key} 默认值应为字符串`);
  }
});

test('设置定义：包含需求要求的关键设置项', () => {
  const keys = new Set(settingsDefs.SETTING_DEFS.map((d) => d.key));
  const required = [
    'appearance.theme', 'appearance.colorMode', 'appearance.fontSize', 'appearance.lineHeight',
    'appearance.pageWidth', 'appearance.customTheme',
    'editor.livePreview', 'editor.typewriter', 'editor.focusMode', 'editor.autoPair',
    'image.saveMode', 'image.savePath', 'image.nameTemplate', 'image.dedupe',
    'export.pageSize', 'export.margin', 'export.withHeaderFooter',
    'general.autoSave', 'advanced.historyEnabled',
  ];
  const missing = required.filter((k) => !keys.has(k));
  assert.deepEqual(missing, [], `缺少设置项：${missing.join(', ')}`);
});

test('coerceSetting：按类型转换数据库中的字符串', () => {
  const boolDef = settingsDefs.SETTING_DEFS.find((d) => d.type === 'boolean');
  assert.equal(settingsDefs.coerceSetting(boolDef, 'true'), true);
  assert.equal(settingsDefs.coerceSetting(boolDef, 'false'), false);
  assert.equal(settingsDefs.coerceSetting(boolDef, null), boolDef.default);

  const numDef = settingsDefs.SETTING_DEFS.find((d) => d.type === 'number');
  assert.equal(typeof settingsDefs.coerceSetting(numDef, '18'), 'number');
  assert.equal(settingsDefs.coerceSetting(numDef, '不是数字'), numDef.default);
});

test('内置主题：至少 5 款且包含需求指定的主题', () => {
  assert.ok(themes.DOC_THEMES.length >= 5, `内置主题数量不足：${themes.DOC_THEMES.length}`);
  const ids = themes.DOC_THEMES.map((t) => t.id);
  for (const required of ['github', 'newsprint', 'night', 'pixyll', 'whitey']) {
    assert.ok(ids.includes(required), `缺少内置主题：${required}`);
  }
});

test('主题 CSS：包含必需的结构类与深色标记', () => {
  const css = themes.buildDocumentCss('github', 'github');
  for (const cls of ['.hsm-preview', 'h1', 'blockquote', 'pre', 'table', 'hsm-math-block', 'hsm-mermaid']) {
    assert.ok(css.includes(cls), `主题 CSS 缺少 ${cls} 样式`);
  }
  assert.equal(themes.isDarkTheme('night'), true);
  assert.equal(themes.isDarkTheme('github'), false);
});

test('代码主题：包含需求指定的主题', () => {
  const ids = themes.CODE_THEMES.map((t) => t.id);
  for (const required of ['github', 'dracula', 'monokai', 'one-dark']) {
    assert.ok(ids.includes(required), `缺少代码主题：${required}`);
  }
});

test('主题 CSS：每个主题都定义了关键 CSS 变量', () => {
  const requiredVars = ['--doc-bg', '--doc-text', '--doc-link', '--doc-border', '--doc-code-bg'];
  for (const theme of themes.DOC_THEMES) {
    for (const v of requiredVars) {
      assert.ok(theme.css.includes(v), `主题 ${theme.id} 缺少变量 ${v}`);
    }
  }
});

/* ==================================================================
 * 五、清理
 * ================================================================== */

test.after(() => {
  try {
    fs.rmSync(TMP, { recursive: true, force: true });
  } catch {
    /* 忽略清理失败 */
  }
});
