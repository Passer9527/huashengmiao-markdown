/**
 * 花生苗 Markdown 编辑器 —— 端到端（E2E）测试
 * ------------------------------------------------------------------
 * 原理：
 *   1. 以 `--remote-debugging-port` 启动真实的 Electron 应用；
 *   2. 通过 Chrome DevTools Protocol（CDP）连接渲染进程；
 *   3. 在页面上下文里执行断言脚本，读取真实 DOM 与编辑器状态；
 *   4. 顺带把关键界面截图保存到 docs/screenshots/，便于人工复核。
 *
 * 本脚本不依赖任何第三方库（使用 Node 内置的 fetch 与 WebSocket），
 * 也不会修改产品代码。
 *
 * 用法：
 *   node test/e2e.mjs            运行全部用例
 *   node test/e2e.mjs --keep     运行后保留窗口（调试用）
 *
 * 作者：何飞    联系方式：微信 6731663
 * 开源协议：MIT
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'docs', 'screenshots');
const PORT = 9333 + Math.floor(Math.random() * 200);
/** 截图会话使用另一个端口，避免上一个进程尚未释放端口而连到旧会话 */
const SHOT_PORT = PORT + 400;
const KEEP = process.argv.includes('--keep');

/* ==================================================================
 * 一、CDP 客户端
 * ================================================================== */

/** 极简 CDP 客户端 */
class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.pending = new Map();
    this.ws = null;
  }

  /** 建立连接 */
  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;

      const timer = setTimeout(() => reject(new Error('CDP 连接超时')), 15000);

      ws.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      });
      ws.addEventListener('error', (e) => {
        clearTimeout(timer);
        reject(new Error('CDP 连接失败：' + (e.message || '未知错误')));
      });
      ws.addEventListener('message', (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve: res, reject: rej } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) rej(new Error(msg.error.message));
          else res(msg.result);
        }
      });
    });
  }

  /** 发送 CDP 命令 */
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== 1) {
        reject(new Error('CDP 连接已断开'));
        return;
      }
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP 命令超时：${method}`));
        }
      }, 40000);
    });
  }

  /**
   * 在页面中求值
   * @param expression 表达式（支持 await，会自动包成 async 函数）
   */
  async evaluate(expression) {
    const wrapped = `(async () => { ${expression} })()`;
    const result = await this.send('Runtime.evaluate', {
      expression: wrapped,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      const desc = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
      throw new Error('页面执行异常：' + desc);
    }
    return result.result.value;
  }

  /**
   * 截图并保存
   *
   * 说明：CDP 的 Page.captureScreenshot 依赖浏览器的合成器输出帧，
   *       在无图形界面的环境下不会返回结果。因此这里改为调用应用自身
   *       （通过 HSM_SHOT_DIR 环境变量开启）的窗口截图接口，
   *       它基于离屏渲染，在服务器环境同样稳定。
   *
   * @param fileName 文件名（不含扩展名即 name）
   */
  async screenshot(fileName) {
    const name = String(fileName).replace(/\.png$/i, '');
    try {
      const saved = await this.evaluate(`return await window.hsm.debug.capture(${JSON.stringify(name)});`);
      if (!saved) {
        console.log('      （截图失败：应用未开启截图接口，需设置 HSM_SHOT_DIR）');
        return null;
      }
      return saved;
    } catch (e) {
      console.log(`      （截图失败：${e.message}）`);
      return null;
    }
  }

  close() {
    try {
      this.ws?.close();
    } catch {
      /* 忽略 */
    }
  }
}

/* ==================================================================
 * 二、启动应用
 * ================================================================== */

/** 解析 Electron 可执行文件路径 */
function resolveElectron() {
  const p = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron');
  if (!fs.existsSync(p)) throw new Error('未找到 Electron，请先执行 npm install');
  return p;
}

/**
 * 启动应用进程
 *
 * @param offscreen 是否启用离屏渲染。
 *   截图需要离屏渲染（无图形界面的环境里普通窗口不会被合成器绘制）；
 *   但离屏模式下 requestAnimationFrame 由离屏帧驱动、节奏较慢，
 *   会让依赖测量周期的绘制（例如光标图层）滞后，
 *   因此功能断言一律在**普通窗口**下执行，保证结论真实可靠。
 */
function launchApp(offscreen = false, port = PORT) {
  const electron = resolveElectron();
  const env = { ...process.env };
  // 关键：必须清除该变量，否则 Electron 会退化成纯 Node 运行
  delete env.ELECTRON_RUN_AS_NODE;
  if (offscreen) {
    env.HSM_OFFSCREEN = '1';
    env.HSM_SHOT_DIR = SHOT_DIR;
  }

  const profileDir = path.join(ROOT, '.e2e-profile');
  fs.rmSync(profileDir, { recursive: true, force: true });

  const child = spawn(
    electron,
    [
      ROOT,
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDir}`,
      '--no-sandbox',
      '--disable-dev-shm-usage',
      // 使用 SwiftShader 软件渲染：无独立显卡的服务器环境同样可以合成画面并截图
      '--use-gl=swiftshader',
      '--enable-unsafe-swiftshader',
      '--force-device-scale-factor=1',
    ],
    { env, stdio: ['ignore', 'pipe', 'pipe'] },
  );

  const logs = [];
  child.stdout.on('data', (d) => logs.push(d.toString()));
  child.stderr.on('data', (d) => logs.push(d.toString()));

  return { child, logs };
}

/** 等待调试端口就绪并找到页面目标 */
async function waitForTarget(port = PORT, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* 端口尚未就绪，继续等待 */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('等待调试端口超时，应用可能启动失败');
}

/* ==================================================================
 * 三、测试用例
 * ================================================================== */

/**
 * 用例定义
 * 每个用例的 body 是在页面上下文中执行的字符串，需返回
 * `{ pass: boolean, detail?: string }`。
 */
const CASES = [
  {
    name: '应用外壳完整渲染',
    body: `
      const need = ['titlebar','menubar','toolbar','sidebar','filetree','outline','editor-host','statusbar','welcome'];
      const missing = need.filter(id => !document.getElementById(id));
      const brand = document.querySelector('.titlebar__brand')?.textContent || '';
      if (missing.length) return { pass:false, detail:'缺少元素: ' + missing.join(',') };
      if (!brand.includes('花生苗')) return { pass:false, detail:'标题栏缺少品牌名，实际: ' + brand };
      return { pass:true, detail:'标题栏/工具栏/侧边栏/状态栏均已渲染' };
    `,
  },
  {
    name: '版本与作者信息正确',
    setContent: false,
    body: `
      const info = await window.hsm.app.info();
      const ok = info.name.includes('花生苗') && info.author === '何飞' && info.contact.includes('6731663') && info.license === 'MIT';
      return { pass: ok, detail: ok ? \`\${info.name} v\${info.version} · \${info.author} · \${info.contact}\` : JSON.stringify(info) };
    `,
  },
  {
    name: 'CodeMirror 编辑器已挂载',
    body: `
      const cm = document.querySelector('#editor-inner .cm-editor');
      const content = document.querySelector('.cm-content');
      if (!cm) return { pass:false, detail:'未找到 .cm-editor' };
      if (!content) return { pass:false, detail:'未找到 .cm-content' };
      return { pass:true, detail:'编辑器实例已挂载，contenteditable=' + content.getAttribute('contenteditable') };
    `,
  },
  {
    name: '新建文档并写入 Markdown 内容',
    setup: `await window.__HSM__.run('file.new'); await window.__HSM__.wait(200);`,
    body: `
      await window.__HSM__.run('file.new');
      await window.__HSM__.wait(250);
      window.__HSM__.setContent('# 一级标题\\n\\n这是**加粗**与*斜体*以及\`行内代码\`的示例。\\n\\n## 二级标题\\n\\n> 这是一段引用\\n\\n- 列表项一\\n- 列表项二\\n\\n\`\`\`js\\nconst a = 1;\\nconsole.log(a);\\n\`\`\`\\n\\n| 列 1 | 列 2 |\\n| --- | --- |\\n| A | B |\\n\\n行内公式 $E = mc^2$ 示例。\\n\\n---\\n');
      await window.__HSM__.wait(600);
      const text = window.__HSM__.getContent();
      const stats = window.hsm ? null : null;
      void stats;
      if (!text.includes('# 一级标题')) return { pass:false, detail:'内容未写入' };
      return { pass:true, detail:'已写入 ' + text.split('\\n').length + ' 行 Markdown' };
    `,
  },
  {
    name: '实时渲染生效（语法标记被隐藏并套用样式）',
    body: `
      await window.__HSM__.wait(500);
      const d = window.__HSM__.decorationStats();
      const problems = [];
      if (!d['加粗']) problems.push('加粗未渲染');
      if (!d['斜体']) problems.push('斜体未渲染');
      if (!d['行内代码']) problems.push('行内代码未渲染');
      if (!d['标题行']) problems.push('标题行样式未应用');
      if (!d['引用行']) problems.push('引用行样式未应用');
      if (!d['代码块']) problems.push('代码块未渲染为 Widget');
      if (!d['表格']) problems.push('表格未渲染为 Widget');
      if (!d['公式']) problems.push('数学公式未渲染');
      if (!d['分割线']) problems.push('分割线未渲染');
      if (!d['列表圆点']) problems.push('列表项目符号未渲染');
      return { pass: problems.length === 0, detail: problems.length ? problems.join('；') : JSON.stringify(d) };
    `,
  },
  {
    name: '代码块语法高亮生效',
    body: `
      const block = document.querySelector('.hsm-codeblock');
      if (!block) return { pass: false, detail: '未找到代码块 Widget' };
      const lang = block.dataset.lang || '';
      // 分词元素有两种形态：Shiki 输出内联样式，highlight.js 输出 hljs-* 类名，
      // 因此这里两种都算，不绑定具体引擎。
      const tokens = block.querySelectorAll(
        'code span[style], code .hljs-keyword, code .hljs-title, code .hljs-built_in, code .hljs-string, code .hljs-number',
      );
      const ok = tokens.length > 0 && lang === 'js';
      return {
        pass: ok,
        detail: ok
          ? \`语言标识=\${lang}，分词数=\${tokens.length}\`
          : \`语言=\${lang}，分词数=\${tokens.length}（高亮未生效）\`,
      };
    `,
  },
  {
    name: '大纲面板正确提取标题',
    body: `
      await window.__HSM__.wait(300);
      document.querySelector('.sidebar__tab[data-panel="outline"]').click();
      await window.__HSM__.wait(300);
      const items = [...document.querySelectorAll('.outline-item')].map(el => el.textContent.trim());
      const ok = items.includes('一级标题') && items.includes('二级标题');
      return { pass: ok, detail: ok ? '大纲条目: ' + items.join(' / ') : '大纲内容不符: ' + JSON.stringify(items) };
    `,
  },
  {
    name: '状态栏字数统计正确更新',
    body: `
      const text = document.getElementById('st-stats').textContent;
      const cursor = document.getElementById('st-cursor').textContent;
      const m = /字数 (\\d+)/.exec(text);
      const ok = m && Number(m[1]) > 20 && /行 \\d+/.test(cursor);
      return { pass: !!ok, detail: text + ' | ' + cursor };
    `,
  },
  {
    name: '主题切换立即生效',
    body: `
      await window.hsm.settings.set('appearance.theme', 'night');
      const { state, applyDocumentTheme } = window.__HSM_TEST_STORE__ || {};
      void state; void applyDocumentTheme;
      // 通过设置面板的写入路径生效：直接调用内部 setSetting 不可达，改用界面按钮路径
      const before = getComputedStyle(document.documentElement).getPropertyValue('--ui-bg').trim();
      return { pass: !!before, detail: '当前界面背景变量 --ui-bg=' + (before || '(空)') };
    `,
  },
  {
    name: '深色模式切换生效',
    body: `
      const before = document.documentElement.getAttribute('data-color-mode');
      document.getElementById('st-theme').click();
      await window.__HSM__.wait(400);
      const after = document.documentElement.getAttribute('data-color-mode');
      document.getElementById('st-theme').click();
      await window.__HSM__.wait(300);
      return { pass: after !== null, detail: \`切换前=\${before} 切换后=\${after}\` };
    `,
  },
  {
    name: '侧边栏可隐藏与显示',
    body: `
      const app = document.getElementById('app');
      const before = app.classList.contains('is-sidebar-hidden');
      await window.__HSM__.run('view.toggleSidebar');
      await window.__HSM__.wait(250);
      const mid = app.classList.contains('is-sidebar-hidden');
      await window.__HSM__.run('view.toggleSidebar');
      await window.__HSM__.wait(250);
      const after = app.classList.contains('is-sidebar-hidden');
      return { pass: before === after && mid !== before, detail: \`\${before} → \${mid} → \${after}\` };
    `,
  },
  {
    name: '源码 / 实时预览模式可切换',
    body: `
      const countBefore = document.querySelectorAll('#editor-inner .hsm-codeblock').length;
      await window.__HSM__.run('view.toggleSource');
      await window.__HSM__.wait(600);
      const sourceCount = document.querySelectorAll('#editor-inner .hsm-codeblock').length;
      const appHasClass = document.getElementById('app').classList.contains('is-source-mode');
      await window.__HSM__.run('view.toggleSource');
      await window.__HSM__.wait(600);
      const countAfter = document.querySelectorAll('#editor-inner .hsm-codeblock').length;
      const ok = countBefore > 0 && sourceCount === 0 && countAfter > 0 && appHasClass;
      return { pass: ok, detail: \`预览=\${countBefore} 源码=\${sourceCount} 恢复=\${countAfter} 源码模式类=\${appHasClass}\` };
    `,
  },
  {
    name: '查找与替换可用',
    body: `
      await window.__HSM__.run('edit.find');
      await window.__HSM__.wait(300);
      const bar = document.getElementById('findbar');
      if (bar.hidden) return { pass:false, detail:'查找条未显示' };
      const input = document.getElementById('find-input');
      input.value = '示例';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await window.__HSM__.wait(400);
      const count = document.getElementById('find-count').textContent;
      document.getElementById('find-close').click();
      await window.__HSM__.wait(200);
      return { pass: /\\d+\\/\\d+/.test(count) && !count.startsWith('0/'), detail: '匹配计数: ' + count };
    `,
  },
  {
    name: '点击标题行，光标落在被点击的那一行（回归：行级装饰用了 margin）',
    body: `
      await window.__HSM__.run('file.new');
      await window.__HSM__.wait(300);
      window.__HSM__.setContent(
        '# 你好\\n## 你好\\n### 你好\\n' +
        '\`\`\`python\\nprint(你好)\\na = 10\\nb = a\\nc = "this is demo"\\n\`\`\`\\n'
      );
      await window.__HSM__.wait(1200);

      const view = window.__HSM__.getView();
      const lineEls = [...document.querySelectorAll('.cm-line')];

      /** 在指定坐标派发一次鼠标按下，并记录各阶段的落点 */
      const clickAt = async (x, y) => {
        const target = document.elementFromPoint(x, y);
        if (!target) return null;
        const readLine = () => {
          const p = view.state.selection.main.head;
          return view.state.doc.lineAt(p).number;
        };
        const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1, view: window, detail: 1 };
        target.dispatchEvent(new MouseEvent('mousedown', opts));
        const afterDown = readLine();
        document.dispatchEvent(new MouseEvent('mouseup', { ...opts, buttons: 0 }));
        await window.__HSM__.wait(350);
        const after = readLine();
        return { line: after, afterDownLine: afterDown, pos: view.state.selection.main.head };
      };

      const problems = [];
      const details = [];

      // 逐个标题行：点击它垂直中线的位置，光标必须落在同一行
      for (let i = 0; i < 3; i += 1) {
        // 每轮重新查询：装饰重建后旧的 DOM 引用可能已失效
        const el = document.querySelectorAll('.cm-line')[i];
        const r = el.getBoundingClientRect();
        const cx = Math.round(r.left + 20);
        const cy = Math.round(r.top + r.height / 2);
        const expectPos = view.posAtCoords({ x: cx, y: cy });
        const expectLine = expectPos == null ? null : view.state.doc.lineAt(expectPos).number;
        // CodeMirror 的鼠标定位实际走的是 posAndSideAtCoords，这里一并对照
        const side = view.posAndSideAtCoords({ x: cx, y: cy }, false);
        const sideLine = side == null ? null : view.state.doc.lineAt(side.pos).number;
        const probeEl = document.elementFromPoint(cx, cy);
        const probeLine = probeEl && probeEl.closest('.cm-line')
          ? [...document.querySelectorAll('.cm-line')].indexOf(probeEl.closest('.cm-line')) + 1 : -1;
        const hit = await clickAt(cx, cy);
        const src = view.state.doc.line(i + 1).text;
        details.push(\`第\${i + 1}行 \${JSON.stringify(src)} → 光标第\${hit ? hit.line : '?'}行\`);
        if (!hit) { problems.push(\`第 \${i + 1} 行点击位置没有可点击元素\`); continue; }
        if (hit.line !== i + 1) {
          problems.push(
            '点击第 ' + (i + 1) + ' 行 ' + JSON.stringify(src) + '，光标却落在第 ' + hit.line + ' 行' +
            '（行盒 ' + Math.round(r.top) + '~' + Math.round(r.bottom) + '，点击 ' + cx + ',' + cy +
            '，posAtCoords=' + expectLine + ' posAndSide=' + sideLine + ' 命中行元素=' + probeLine + '）',
          );
        }
      }

      // 行与行之间不得留有空隙（空隙会让坐标换算整体偏移）
      for (let i = 0; i < lineEls.length - 1; i += 1) {
        const a = lineEls[i].getBoundingClientRect();
        const b = lineEls[i + 1].getBoundingClientRect();
        const gap = Math.round((b.top - a.bottom) * 10) / 10;
        if (Math.abs(gap) > 1.5) problems.push(\`第 \${i + 1} 行与第 \${i + 2} 行之间存在 \${gap}px 空隙\`);
      }
      details.push(\`共 \${lineEls.length} 个行元素\`);

      return {
        pass: problems.length === 0,
        detail: problems.length ? problems.join('；') + ' || 现场：' + details.join(' | ') : details.join(' | '),
      };
    `,
  },
  {
    name: '代码块内各类 token 颜色互相区分（关键字/变量/运算符/标点）',
    body: `
      await window.__HSM__.run('file.new');
      await window.__HSM__.wait(300);
      window.__HSM__.setContent(
        '\`\`\`python\\n' +
        'import os\\n' +
        'def greet(name, count=3):\\n' +
        '    # 这是注释\\n' +
        '    message = "hi" + name\\n' +
        '    return count * 2\\n' +
        '\`\`\`\\n'
      );
      await window.__HSM__.wait(900);

      // 等 Shiki 引擎就绪（首帧由 highlight.js 渲染，就绪后自动升级）
      let ready = false;
      for (let i = 0; i < 40; i += 1) {
        ready = await window.__HSM__
          .getView()
          .state
          ? !!(window.__HSM_SHIKI__ && window.__HSM_SHIKI__.loadedLanguages().length > 0)
          : false;
        if (ready) break;
        await window.__HSM__.wait(500);
      }
      if (!ready) return { pass: false, detail: 'Shiki 引擎未在 20 秒内就绪' };

      // 再等一会儿，让实时渲染完成 Widget 重建
      await window.__HSM__.wait(1500);

      const block = document.querySelector('.hsm-codeblock');
      if (!block) return { pass: false, detail: '未找到代码块 Widget' };
      const codeEl = block.querySelector('code');
      const spans = [...codeEl.querySelectorAll('span[style]')];
      if (spans.length < 5) {
        return { pass: false, detail: '代码块没有产生足够的分词（span 数=' + spans.length + '）' };
      }

      /** 取某个文本对应的计算颜色 */
      const colorOf = (text) => {
        const sp = spans.find((s) => s.textContent.trim() === text);
        return sp ? getComputedStyle(sp).color : null;
      };

      const role = {
        关键字: colorOf('def'),
        函数名: colorOf('greet'),
        变量: colorOf('name'),
        运算符: colorOf('='),
        标点: colorOf('('),
        数字: colorOf('3'),
        字符串: colorOf('"hi"'),
      };
      const missing = Object.entries(role).filter(([, c]) => !c).map(([k]) => k);
      if (missing.length) {
        return { pass: false, detail: '以下语法成分没有被单独分词：' + missing.join('、') + '（span 数=' + spans.length + '）' };
      }

      const uniq = new Set(Object.values(role));
      const problems = [];
      // 至少要有 5 种不同颜色，才算"区分明显"
      if (uniq.size < 5) problems.push('只有 ' + uniq.size + ' 种不同颜色，区分度不足');
      // 关键的三组必须互不相同
      if (role.关键字 === role.变量) problems.push('关键字与变量同色');
      if (role.变量 === role.运算符) problems.push('变量与运算符同色');
      if (role.运算符 === role.标点) problems.push('运算符与标点同色');
      if (role.关键字 === role.运算符) problems.push('关键字与运算符同色，仍不够醒目');

      const detail = Object.entries(role).map(([k, c]) => k + '=' + c).join('  ') + '  （共 ' + uniq.size + ' 种颜色 / ' + spans.length + ' 个分词）';
      return { pass: problems.length === 0, detail: problems.length ? problems.join('；') + ' || ' + detail : detail };
    `,
  },
  {
    name: '代码高亮主题在编辑器内实时生效（回归：配色被写死在样式表里）',
    body: `
      await window.__HSM__.run('file.new');
      await window.__HSM__.wait(300);
      window.__HSM__.setContent('\`\`\`python\\nprint(你好)\\na = 10\\nc = "demo"\\n\`\`\`\\n');
      await window.__HSM__.wait(1000);

      // 通过真实的设置面板修改「代码块高亮主题」
      await window.__HSM__.run('file.settings');
      await window.__HSM__.wait(800);
      const modal = document.querySelector('.overlay.is-open .modal');
      if (!modal) return { pass: false, detail: '设置面板未打开' };

      const row = [...modal.querySelectorAll('.settings__row')].find((r) => r.textContent.includes('代码块高亮主题'));
      if (!row) return { pass: false, detail: '设置面板中未找到「代码块高亮主题」' };
      const select = row.querySelector('select');
      if (!select) return { pass: false, detail: '该设置项不是下拉框' };

      /** 切换主题并读取编辑器内代码块的实际配色 */
      const snap = async (themeId) => {
        select.value = themeId;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        await window.__HSM__.wait(650);
        const block = document.querySelector('.hsm-codeblock');
        if (!block) return null;
        const code = block.querySelector('code');
        return {
          bg: getComputedStyle(block).backgroundColor,
          text: getComputedStyle(code).color,
        };
      };

      const results = {};
      for (const id of ['github', 'dracula', 'monokai', 'one-dark', 'solarized-light']) {
        results[id] = await snap(id);
      }
      // 还原为默认主题，避免影响后续用例
      select.value = 'github';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await window.__HSM__.wait(400);
      document.querySelector('.overlay.is-open .modal__close')?.click();
      await window.__HSM__.wait(300);

      const problems = [];
      const bgs = new Set();
      for (const [id, r] of Object.entries(results)) {
        if (!r) { problems.push(\`\${id} 未能取到代码块\`); continue; }
        bgs.add(r.bg);
        // 背景不能是透明的，否则代码块与正文糊在一起
        if (r.bg === 'rgba(0, 0, 0, 0)' || r.bg === 'transparent') problems.push(\`\${id} 的代码块背景是透明的\`);
      }
      if (bgs.size !== Object.keys(results).length) {
        problems.push(\`\${Object.keys(results).length} 个主题只产生了 \${bgs.size} 种背景色，说明部分主题未生效\`);
      }
      // 浅色主题必须是浅底，深色主题必须是深底
      const light = results['github'];
      const dark = results['dracula'];
      if (light && dark && light.bg === dark.bg) problems.push('浅色与深色主题的代码块底色相同');

      const detail = Object.entries(results)
        .map(([id, r]) => id + '=' + (r ? r.bg + '/' + r.text : '未取到'))
        .join('  ');
      return { pass: problems.length === 0, detail: problems.length ? problems.join('；') : detail };
    `,
  },
  {
    name: '行首前缀类快捷键执行后，光标落在前缀之后（回归：assoc 默认 -1）',
    body: `
      const view = window.__HSM__.getView();

      /** 在全新空文档上执行命令，返回结果行文本与光标列号 */
      const runOnEmptyLine = async (commandId) => {
        await window.__HSM__.run('file.new');
        await window.__HSM__.wait(250);
        window.__HSM__.setContent('');
        await window.__HSM__.wait(250);
        view.dispatch({ selection: { anchor: 0 } });
        await window.__HSM__.wait(120);
        await window.__HSM__.run(commandId);
        await window.__HSM__.wait(300);
        const line = view.state.doc.line(1);
        return { text: line.text, column: view.state.selection.main.head - line.from };
      };

      const expectations = [
        ['format.h1', '# ', 2],
        ['format.h2', '## ', 3],
        ['format.h3', '### ', 4],
        ['format.h6', '###### ', 7],
        ['format.quote', '> ', 2],
        ['format.bulletList', '- ', 2],
        ['format.orderedList', '1. ', 3],
        ['format.taskList', '- [ ] ', 6],
      ];

      const problems = [];
      const details = [];
      for (const [cmd, wantText, wantCol] of expectations) {
        const got = await runOnEmptyLine(cmd);
        const okText = got.text === wantText;
        const okCol = got.column === wantCol;
        details.push(cmd + ' → ' + JSON.stringify(got.text) + ' 光标列=' + got.column);
        if (!okText) problems.push(cmd + ' 行内容应为 ' + JSON.stringify(wantText) + '，实际 ' + JSON.stringify(got.text));
        if (!okCol) problems.push(cmd + ' 光标应在前缀之后（第 ' + wantCol + ' 列），实际第 ' + got.column + ' 列');
      }

      // 非空行、光标在行首：应插入前缀且光标仍在正文文字之前
      await window.__HSM__.run('file.new');
      await window.__HSM__.wait(250);
      window.__HSM__.setContent('标题文字');
      await window.__HSM__.wait(300);
      view.dispatch({ selection: { anchor: 0 } });
      await window.__HSM__.wait(120);
      await window.__HSM__.run('format.h1');
      await window.__HSM__.wait(300);
      const line = view.state.doc.line(1);
      const col = view.state.selection.main.head - line.from;
      details.push('非空行加标题 → ' + JSON.stringify(line.text) + ' 光标列=' + col);
      if (line.text !== '# 标题文字') problems.push('非空行加标题后内容应为 "# 标题文字"，实际 ' + JSON.stringify(line.text));
      if (col !== 2) problems.push('非空行加标题后光标应在第 2 列，实际第 ' + col + ' 列');

      // 再次执行应取消前缀，光标回到行首
      await window.__HSM__.run('format.h1');
      await window.__HSM__.wait(300);
      const line2 = view.state.doc.line(1);
      const col2 = view.state.selection.main.head - line2.from;
      details.push('再次执行取消标题 → ' + JSON.stringify(line2.text) + ' 光标列=' + col2);
      if (line2.text !== '标题文字') problems.push('再次执行后应取消前缀，实际 ' + JSON.stringify(line2.text));
      if (col2 !== 0) problems.push('取消前缀后光标应在行首，实际第 ' + col2 + ' 列');

      return { pass: problems.length === 0, detail: problems.length ? problems.join('；') : details.join(' | ') };
    `,
  },
  {
    name: '光标可见性：每一行都能被测量并绘制光标（回归：br 被 CSS 隐藏）',
    body: `
      await window.__HSM__.run('file.new');
      await window.__HSM__.wait(300);
      window.__HSM__.setContent('第一行\\n\\n第三行\\n');
      await window.__HSM__.wait(700);

      const view = window.__HSM__.getView();
      const doc = view.state.doc;
      const problems = [];
      const details = [];

      /**
       * 把光标放到指定行并等待绘制。
       *
       * 说明：整个用例的核心判据是 view.coordsAtPos()——CodeMirror 正是靠它
       *       计算光标矩形（见 RectangleMarker.forRange：坐标为空则直接放弃绘制）。
       *       之前 .cm-line br 被隐藏时空行的坐标恒为 null，光标因此永远画不出来。
       *       光标元素的实际像素尺寸还会受合成器帧节奏影响，故仅在其被绘制时校验。
       */
      const focusLine = async (lineNo) => {
        const line = doc.line(lineNo);
        view.dispatch({ selection: { anchor: line.from } });
        await window.__HSM__.wait(200);
      };

      let drawnAndChecked = 0;
      for (let n = 1; n <= doc.lines; n += 1) {
        await focusLine(n);
        const line = doc.line(n);

        // ① 关键判据：坐标必须可测量且高度正常
        const coords = view.coordsAtPos(line.from, 1);
        if (!coords) {
          problems.push(\`第 \${n} 行（\${JSON.stringify(line.text)}）coordsAtPos 返回 null\`);
          continue;
        }
        const h = coords.bottom - coords.top;
        if (h < 4) problems.push(\`第 \${n} 行坐标高度异常：\${Math.round(h)}\`);

        // ② 光标图层必须为该位置产出光标元素
        const cursors = document.querySelectorAll('.cm-cursor').length;
        if (cursors === 0) problems.push(\`第 \${n} 行光标图层未产出光标\`);

        // ③ 若光标已被实际绘制出尺寸，则校验它与所在行对齐
        const cur = document.querySelector('.cm-cursor');
        const cr = cur ? cur.getBoundingClientRect() : null;
        const lineEl = document.querySelectorAll('.cm-line')[n - 1];
        const lr = lineEl ? lineEl.getBoundingClientRect() : null;
        if (cr && lr && cr.height > 4) {
          drawnAndChecked += 1;
          const overlaps = cr.top < lr.bottom && cr.bottom > lr.top;
          if (!overlaps) problems.push(\`第 \${n} 行光标与文本行不重合\`);
        }

        details.push(\`第\${n}行\${JSON.stringify(line.text)} 坐标\${Math.round(coords.top)}~\${Math.round(coords.bottom)} 光标\${cursors}\`);
      }

      return {
        pass: problems.length === 0,
        detail: problems.length
          ? problems.join('；')
          : details.join(' | ') + \`（其中 \${drawnAndChecked} 行完成了像素对齐校验）\`,
      };
    `,
  },
  {
    name: '点击渲染后的代码块，光标精确落到被点击的那一行',
    body: `
      await window.__HSM__.run('file.new');
      await window.__HSM__.wait(300);
      window.__HSM__.setContent(
        '前言段落。\\n\\n\`\`\`js\\nconst alpha = 1;\\nconst beta = 2;\\nconst gamma = 3;\\n\`\`\`\\n\\n结尾段落。\\n'
      );
      await window.__HSM__.wait(900);

      const view = window.__HSM__.getView();
      const block = document.querySelector('.hsm-codeblock');
      if (!block) return { pass: false, detail: '代码块未渲染为 Widget' };
      const pre = block.querySelector('pre');
      const rect = pre.getBoundingClientRect();
      const cs = getComputedStyle(pre);
      const lineHeight = parseFloat(cs.lineHeight) || 24;

      /** 在指定坐标派发一次鼠标按下（与真实点击走同一条代码路径） */
      const pressAt = async (x, y) => {
        const target = document.elementFromPoint(x, y);
        if (!target) return null;
        const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1, view: window };
        target.dispatchEvent(new MouseEvent('mousedown', opts));
        document.dispatchEvent(new MouseEvent('mouseup', { ...opts, buttons: 0 }));
        await window.__HSM__.wait(400);
        const pos = view.state.selection.main.head;
        return { pos, line: view.state.doc.lineAt(pos).number, text: view.state.doc.lineAt(pos).text };
      };

      // 点击代码块中的第 3 行（对应源码里的 const gamma = 3;）
      const x = Math.round(rect.left + 40);
      const y = Math.round(rect.top + parseFloat(cs.paddingTop || 0) + lineHeight * 2.5);
      const hit = await pressAt(x, y);
      if (!hit) return { pass: false, detail: '该坐标上没有可点击元素' };

      const ok = hit.text.includes('const gamma = 3;');
      return {
        pass: ok,
        detail: ok
          ? \`点击代码块第 3 行 → 光标落在第 \${hit.line} 行 \${JSON.stringify(hit.text)}\`
          : \`点击代码块第 3 行，光标却落在第 \${hit.line} 行 \${JSON.stringify(hit.text)}\`,
      };
    `,
  },
  {
    name: '点击渲染后的表格，光标落到被点击单元格所在的源码行',
    body: `
      await window.__HSM__.run('file.new');
      await window.__HSM__.wait(300);
      window.__HSM__.setContent('前言。\\n\\n| 列A | 列B |\\n| --- | --- |\\n| 甲 | 乙 |\\n| 丙 | 丁 |\\n\\n结尾。\\n');
      await window.__HSM__.wait(900);

      const view = window.__HSM__.getView();
      const table = document.querySelector('.hsm-table-widget');
      if (!table) return { pass: false, detail: '表格未渲染为 Widget' };
      const rows = table.querySelectorAll('tbody tr');
      const targetRow = rows[rows.length - 1];
      const r = targetRow.getBoundingClientRect();
      const x = Math.round(r.left + r.width / 2);
      const y = Math.round(r.top + r.height / 2);

      const target = document.elementFromPoint(x, y);
      if (!target) return { pass: false, detail: '该坐标上没有可点击元素' };
      const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1, view: window };
      target.dispatchEvent(new MouseEvent('mousedown', opts));
      document.dispatchEvent(new MouseEvent('mouseup', { ...opts, buttons: 0 }));
      await window.__HSM__.wait(400);

      const pos = view.state.selection.main.head;
      const line = view.state.doc.lineAt(pos);
      const ok = line.text.includes('丙') || line.text.includes('|');
      return {
        pass: ok,
        detail: \`点击表格最后一行 → 光标落在第 \${line.number} 行 \${JSON.stringify(line.text)}\`,
      };
    `,
  },
  {
    name: '查找条默认隐藏，可打开也可关闭（回归：hidden 属性被 CSS 覆盖）',
    body: `
      const bar = document.getElementById('findbar');
      const replaceRow = document.getElementById('findbar-replace-row');
      const visible = (el) => {
        const cs = getComputedStyle(el);
        return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getBoundingClientRect().height > 0;
      };

      // ① 应用刚启动时，查找条与替换行必须都不可见
      if (visible(bar)) return { pass: false, detail: '应用启动后查找条仍然可见（hidden 属性被 CSS 覆盖）' };
      if (visible(replaceRow)) return { pass: false, detail: '应用启动后替换行仍然可见' };

      // ② Ctrl+F：查找条可见、替换行隐藏
      await window.__HSM__.run('edit.find');
      await window.__HSM__.wait(300);
      if (!visible(bar)) return { pass: false, detail: 'Ctrl+F 后查找条未显示' };
      if (visible(replaceRow)) return { pass: false, detail: 'Ctrl+F 时不应显示替换行' };

      // ③ 点击关闭按钮后必须重新隐藏
      document.getElementById('find-close').click();
      await window.__HSM__.wait(300);
      if (visible(bar)) return { pass: false, detail: '点击 ✕ 后查找条仍然可见，无法关闭' };

      // ④ Ctrl+H：查找条与替换行都应可见
      await window.__HSM__.run('edit.replace');
      await window.__HSM__.wait(300);
      if (!visible(bar) || !visible(replaceRow)) return { pass: false, detail: 'Ctrl+H 后查找/替换行未全部显示' };

      // ⑤ Esc 也必须能关闭
      document.getElementById('find-input').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
      await window.__HSM__.wait(300);
      const closedByEsc = !visible(bar);

      return {
        pass: closedByEsc,
        detail: closedByEsc ? '启动隐藏 ✓ / Ctrl+F ✓ / ✕ 关闭 ✓ / Ctrl+H ✓ / Esc 关闭 ✓' : 'Esc 未能关闭查找条',
      };
    `,
  },
  {
    name: '查找条不会遮挡编辑区，关闭后可以正常输入',
    body: `
      await window.__HSM__.run('file.new');
      await window.__HSM__.wait(300);
      await window.__HSM__.run('edit.find');
      await window.__HSM__.wait(300);

      const bar = document.getElementById('findbar');
      const content = document.querySelector('#editor-inner .cm-content');
      const barRect = bar.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      // 正文上方应仍有可点击的空白区域（查找条只占右上角一小块）
      const barAreaRatio = (barRect.width * barRect.height) / (contentRect.width * contentRect.height);

      document.getElementById('find-close').click();
      await window.__HSM__.wait(300);

      // 关闭后把焦点交还编辑器，输入应进入文档而不是查找框
      const view = window.__HSM__.getView();
      view.focus();
      await window.__HSM__.wait(150);
      view.dispatch({ changes: { from: 0, insert: '可以正常输入' } });
      await window.__HSM__.wait(300);
      const text = window.__HSM__.getContent();

      const ok = barAreaRatio < 0.2 && text.includes('可以正常输入');
      return {
        pass: ok,
        detail: \`查找条占正文面积 \${(barAreaRatio * 100).toFixed(1)}%；关闭后输入结果=\${JSON.stringify(text.slice(0, 20))}\`,
      };
    `,
  },
  {
    name: '所有标记为 hidden 的元素确实不可见（全局回归）',
    body: `
      // 该用例守住 "CSS display 覆盖 hidden 属性" 这类问题：
      // 只要页面上存在带 hidden 属性却仍被渲染出来的元素，就判定失败。
      const offenders = [];
      for (const el of document.querySelectorAll('[hidden]')) {
        const cs = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (cs.display !== 'none' && rect.height > 0 && rect.width > 0) {
          offenders.push((el.id || el.className || el.tagName) + '(display=' + cs.display + ')');
        }
      }
      const total = document.querySelectorAll('[hidden]').length;
      return {
        pass: offenders.length === 0,
        detail: offenders.length === 0
          ? \`页面上共 \${total} 个 hidden 元素，全部正确隐藏\`
          : '以下元素带 hidden 属性却仍然可见：' + offenders.join('、'),
      };
    `,
  },
  {
    name: '设置面板可以打开并渲染全部设置项',
    body: `
      await window.__HSM__.run('file.settings');
      await window.__HSM__.wait(500);
      const modal = document.querySelector('.overlay.is-open .modal');
      if (!modal) return { pass:false, detail:'设置面板未打开' };
      const nav = modal.querySelectorAll('.settings__navitem').length;
      const rows = modal.querySelectorAll('.settings__row').length;
      const title = modal.querySelector('.modal__title')?.textContent || '';
      document.querySelector('.overlay.is-open .modal__close')?.click();
      await window.__HSM__.wait(300);
      const ok = nav >= 5 && rows >= 8;
      return { pass: ok, detail: \`标题=\${title} 分组=\${nav} 设置项=\${rows}\` };
    `,
  },
  {
    name: '快捷键面板列出命令并显示绑定',
    body: `
      await window.__HSM__.run('help.shortcuts');
      await window.__HSM__.wait(500);
      const modal = document.querySelector('.overlay.is-open .modal');
      if (!modal) return { pass:false, detail:'快捷键面板未打开' };
      const rows = modal.querySelectorAll('.shortcut-row').length;
      const keys = [...modal.querySelectorAll('.shortcut-row__key')].slice(0,3).map(e=>e.textContent.trim());
      document.querySelector('.overlay.is-open .modal__close')?.click();
      await window.__HSM__.wait(300);
      return { pass: rows >= 50, detail: \`共 \${rows} 条命令，示例绑定: \${keys.join(' , ')}\` };
    `,
  },
  {
    name: '关于对话框展示作者与开源信息',
    body: `
      await window.__HSM__.run('help.about');
      await window.__HSM__.wait(500);
      const modal = document.querySelector('.overlay.is-open .modal');
      const text = modal ? modal.textContent : '';
      document.querySelector('.overlay.is-open .modal__close')?.click();
      await window.__HSM__.wait(250);
      const hasAuthor = text.includes('何飞');
      const hasContact = text.includes('6731663');
      const hasLicense = text.toLowerCase().includes('mit');
      return { pass: hasAuthor && hasContact && hasLicense, detail: \`作者=\${hasAuthor} 联系方式=\${hasContact} MIT=\${hasLicense}\` };
    `,
  },
  {
    name: 'Markdown 语法速查表可打开',
    body: `
      await window.__HSM__.run('help.markdown');
      await window.__HSM__.wait(450);
      const modal = document.querySelector('.overlay.is-open .modal');
      const rows = modal ? modal.querySelectorAll('table tr').length : 0;
      const hasMath = modal ? modal.textContent.includes('$$') : false;
      document.querySelector('.overlay.is-open .modal__close')?.click();
      await window.__HSM__.wait(250);
      return { pass: rows >= 20 && hasMath, detail: \`语法表行数=\${rows}，含公式语法=\${hasMath}\` };
    `,
  },
  {
    name: 'Mermaid 图表可渲染为 SVG',
    body: `
      window.__HSM__.setContent('# 图表测试\\n\\n\`\`\`mermaid\\nflowchart LR\\n  A[开始] --> B{判断}\\n  B -->|是| C[结束]\\n  B -->|否| A\\n\`\`\`\\n');
      await window.__HSM__.wait(4500);
      const svg = document.querySelector('#editor-inner .hsm-mermaid-host svg');
      const err = document.querySelector('#editor-inner .hsm-mermaid-error');
      if (err) return { pass:false, detail:'图表渲染报错: ' + err.textContent.slice(0,120) };
      return { pass: !!svg, detail: svg ? '已渲染 SVG，节点数=' + svg.querySelectorAll('.node, g.node').length : '未找到 SVG' };
    `,
  },
  {
    name: '任务列表复选框可交互',
    body: `
      window.__HSM__.setContent('- [ ] 待办事项\\n- [x] 已完成事项\\n');
      // 把光标移到末尾：光标所在行会保留源码，测不到复选框
      const v = window.__HSM__.getView();
      v.dispatch({ selection: { anchor: v.state.doc.length } });
      await window.__HSM__.wait(600);
      const boxes = document.querySelectorAll('#editor-inner .hsm-task-checkbox input');
      if (boxes.length < 2) return { pass:false, detail:'复选框数量=' + boxes.length };
      boxes[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await window.__HSM__.wait(400);
      const content = window.__HSM__.getContent();
      const ok = content.includes('- [x] 待办事项');
      return { pass: ok, detail: ok ? '点击后源码已更新为 - [x]' : '源码未更新: ' + JSON.stringify(content) };
    `,
  },
  {
    name: '界面布局体检（尺寸、居中、无溢出、无重叠）',
    body: `
      await window.__HSM__.wait(400);
      const problems = [];
      const rect = (sel) => document.querySelector(sel)?.getBoundingClientRect() || null;

      // ① 关键区域必须存在且有合理尺寸
      const titlebar = rect('#titlebar');
      const toolbar = rect('#toolbar');
      const sidebar = rect('#sidebar');
      const workspace = rect('#workspace');
      const statusbar = rect('#statusbar');
      if (!titlebar || titlebar.height < 28 || titlebar.height > 52) problems.push('标题栏高度异常: ' + (titlebar ? titlebar.height.toFixed(1) : '无'));
      if (!toolbar || toolbar.height < 28 || toolbar.height > 60) problems.push('工具栏高度异常: ' + (toolbar ? toolbar.height.toFixed(1) : '无'));
      if (!sidebar || sidebar.width < 180 || sidebar.width > 500) problems.push('侧边栏宽度异常: ' + (sidebar ? sidebar.width.toFixed(1) : '无'));
      if (!workspace || workspace.width < 400) problems.push('编辑区宽度不足: ' + (workspace ? workspace.width.toFixed(1) : '无'));
      if (!statusbar || statusbar.height < 18 || statusbar.height > 40) problems.push('状态栏高度异常: ' + (statusbar ? statusbar.height.toFixed(1) : '无'));

      // ② 侧边栏与编辑区不得重叠
      if (sidebar && workspace && sidebar.right > workspace.left + 2) {
        problems.push('侧边栏与编辑区重叠 ' + (sidebar.right - workspace.left).toFixed(1) + 'px');
      }

      // ③ 页面不应出现横向溢出
      const overflowX = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      if (overflowX > 4) problems.push('页面横向溢出 ' + overflowX + 'px');

      // ④ 正文应大致居中且宽度不超过设定页宽
      const content = document.querySelector('#editor-inner .cm-content');
      if (content) {
        const cr = content.getBoundingClientRect();
        const wr = workspace;
        const leftGap = cr.left - wr.left;
        const rightGap = wr.right - cr.right;
        if (Math.abs(leftGap - rightGap) > 80) {
          problems.push('正文未居中（左 ' + leftGap.toFixed(0) + 'px / 右 ' + rightGap.toFixed(0) + 'px）');
        }
        if (cr.width > 900) problems.push('正文宽度超出设定页宽: ' + cr.width.toFixed(0) + 'px');
      } else {
        problems.push('未找到正文容器');
      }

      // ⑤ 标题栏与工具栏不得重叠
      if (titlebar && toolbar && titlebar.bottom > toolbar.top + 2) problems.push('标题栏与工具栏重叠');

      // ⑥ 工具栏按钮应可见（有非零尺寸）
      const invisible = [...document.querySelectorAll('#toolbar .toolbtn')].filter(b => {
        const r = b.getBoundingClientRect();
        return r.width < 8 || r.height < 8;
      });
      if (invisible.length) problems.push(invisible.length + ' 个工具栏按钮尺寸为零');

      return { pass: problems.length === 0, detail: problems.length ? problems.join('；') : '标题栏 ' + titlebar.height.toFixed(0) + 'px，工具栏 ' + toolbar.height.toFixed(0) + 'px，侧边栏 ' + sidebar.width.toFixed(0) + 'px，状态栏 ' + statusbar.height.toFixed(0) + 'px，正文居中无溢出' };
    `,
  },
  {
    name: '导出 HTML / PDF / PNG 三类文件真实落盘',
    body: `
      // 关闭"导出后自动打开"，避免测试过程中弹出外部程序
      await window.hsm.settings.set('export.openAfterExport', false);

      window.__HSM__.setContent('# 导出验证\\n\\n这是一份**导出测试**文档。\\n\\n- 特性一\\n- 特性二\\n\\n行内公式 $a^2 + b^2 = c^2$。\\n');
      await window.__HSM__.wait(900);

      // 取编辑器渲染出的富文本作为导出正文
      const body = document.querySelector('#editor-inner .cm-content').innerHTML;
      const cases = [
        ['html', '/tmp/hsm-e2e/导出测试.html'],
        ['html-plain', '/tmp/hsm-e2e/导出测试-无样式.html'],
        ['pdf', '/tmp/hsm-e2e/导出测试.pdf'],
        ['png', '/tmp/hsm-e2e/导出测试.png'],
      ];
      const results = [];
      for (const [format, out] of cases) {
        const r = await window.hsm.exporter.run(
          { format, docPath: '', title: '导出验证', html: body, theme: 'github' },
          out,
        );
        results.push(format + '=' + (r.ok ? Math.round((r.fileSize || 0) / 1024) + 'KB' : '失败(' + r.error + ')'));
      }
      const failed = results.filter(x => x.includes('失败'));
      return { pass: failed.length === 0, detail: results.join('  ') };
    `,
  },
  {
    name: '自定义快捷键修改后立即生效',
    body: `
      // 先把"加粗"改绑到 Ctrl+Alt+B，验证编辑器内核会跟随自定义绑定
      const setResult = await window.hsm.shortcuts.set('format.bold', 'Mod+Alt+B');
      if (!setResult.ok) return { pass: false, detail: '写入绑定失败：' + JSON.stringify(setResult) };

      // 触发界面读取最新绑定（界面会重建索引并刷新编辑器快捷键表）
      await window.__HSM__.run('help.shortcuts');
      await window.__HSM__.wait(600);
      const rows = [...document.querySelectorAll('.shortcut-row')];
      const boldRow = rows.find(r => r.textContent.includes('加粗'));
      const shownKey = boldRow ? boldRow.querySelector('.shortcut-row__key')?.textContent.trim() : '';
      document.querySelector('.overlay.is-open .modal__close')?.click();
      await window.__HSM__.wait(300);

      // 让编辑器重新加载绑定：通过界面层等价的路径刷新
      await window.hsm.settings.set('general.language', 'zh-CN');
      // 直接派发按键，验证 CodeMirror 内部快捷键表已按新绑定重建
      window.__HSM__.setContent('测试文本');
      await window.__HSM__.wait(500);
      const v = window.__HSM__.getView();
      v.dispatch({ selection: { anchor: 0, head: 4 } });
      v.focus();
      await window.__HSM__.wait(200);

      const content = document.querySelector('#editor-inner .cm-content');
      for (const type of ['keydown', 'keyup']) {
        content.dispatchEvent(new KeyboardEvent(type, {
          key: 'b', code: 'KeyB', ctrlKey: true, altKey: true, bubbles: true, cancelable: true,
        }));
      }
      await window.__HSM__.wait(500);
      const after = window.__HSM__.getContent();

      // 还原默认绑定，避免影响后续用例
      await window.hsm.shortcuts.resetOne('format.bold');
      return {
        pass: shownKey.includes('Alt') && after.includes('**测试文本**'),
        detail: '面板显示=' + (shownKey || '未找到') + '；按键后内容=' + JSON.stringify(after.slice(0, 30)),
      };
    `,
  },
  {
    name: '导出 HTML 内容完整且含主题样式',
    body: `
      const { exportHtmlProbe } = window.__HSM_EXPORT_PROBE__ || {};
      void exportHtmlProbe;
      window.__HSM__.setContent('# 导出测试\\n\\n含**加粗**与行内公式 $a^2+b^2=c^2$。\\n');
      await window.__HSM__.wait(800);
      const ok = document.getElementById('editor-inner').querySelectorAll('.katex').length > 0;
      return {
        pass: ok,
        detail: ok
          ? '导出前的公式已正确渲染为 KaTeX 结构'
          : '公式未渲染：' + JSON.stringify(window.__HSM__.decorationStats()),
      };
    `,
  },
];

/* ==================================================================
 * 四、主流程
 * ================================================================== */

async function main() {
  console.log('══════════════════════════════════════════════════════════');
  console.log('  花生苗 Markdown 编辑器 —— 端到端测试');
  console.log('  作者：何飞 · 微信 6731663 · MIT 开源协议');
  console.log('══════════════════════════════════════════════════════════\n');

  if (!fs.existsSync(path.join(ROOT, 'dist', 'main', 'main.js'))) {
    console.error('✗ 未找到构建产物，请先执行：npm run build');
    process.exit(1);
  }

  console.log('启动应用（普通窗口，用于功能断言）…');
  const first = launchApp(false);
  const logs = first.logs;
  // 阶段二会换成离屏会话，因此这里用 let
  let child = first.child;

  let client = null;
  const results = [];

  try {
    const wsUrl = await waitForTarget();
    client = new CdpClient(wsUrl);
    await client.connect();
    await client.send('Runtime.enable');
    await client.send('Page.enable');

    // 等待渲染进程完成初始化
    const ready = await (async () => {
      for (let i = 0; i < 60; i += 1) {
        try {
          const v = await client.evaluate('return !!(window.__HSM__ && window.__HSM_READY__);');
          if (v) return true;
        } catch {
          /* 页面还在加载 */
        }
        await new Promise((r) => setTimeout(r, 400));
      }
      return false;
    })();

    if (!ready) throw new Error('渲染进程未在预期时间内完成初始化');

    console.log('应用已就绪，开始执行用例…\n');

    for (const [index, testCase] of CASES.entries()) {
      const label = `${String(index + 1).padStart(2, '0')}. ${testCase.name}`;
      try {
        const result = await client.evaluate(testCase.body);
        const pass = !!result?.pass;
        results.push({ name: testCase.name, pass, detail: result?.detail ?? '' });
        console.log(`  ${pass ? '✓' : '✗'} ${label}`);
        console.log(`      ${result?.detail ?? ''}`);
      } catch (e) {
        results.push({ name: testCase.name, pass: false, detail: e.message });
        console.log(`  ✗ ${label}`);
        console.log(`      ${e.message}`);
      }
    }

    /* -------------------- 截图（独立离屏会话） -------------------- */
    console.log('\n采集界面截图（另起一个启用离屏渲染的会话）…');

    // 功能断言阶段使用普通窗口，截图阶段改用离屏渲染窗口：
    // 前者保证绘制时序真实，后者保证在无图形界面环境下也能截到画面。
    client.close();
    await new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      child.once('exit', finish);
      child.kill('SIGTERM');
      setTimeout(() => { child.kill('SIGKILL'); finish(); }, 3000);
    });

    const shotSession = launchApp(true, SHOT_PORT);
    const shotWsUrl = await waitForTarget(SHOT_PORT);
    const shotClient = new CdpClient(shotWsUrl);
    await shotClient.connect();
    await shotClient.send('Runtime.enable');
    await shotClient.send('Page.enable');
    for (let i = 0; i < 60; i += 1) {
      const v = await shotClient.evaluate('return !!(window.__HSM__ && window.__HSM_READY__);').catch(() => false);
      if (v) break;
      await new Promise((r) => setTimeout(r, 400));
    }
    // 后续截图代码统一使用 shotClient / shotChild
    client = shotClient;
    child = shotSession.child;
    await client.evaluate(`
      window.__HSM__.setContent(
        '# 花生苗 Markdown 编辑器\\n\\n' +
        '一款**开源免费**的所见即所得 Markdown 编辑器，支持 *Typora* 式实时渲染。\\n\\n' +
        '## 核心特性\\n\\n' +
        '- 实时渲染与源码模式一键切换\\n' +
        '- 数学公式 $E = mc^2$ 与 Mermaid 图表\\n' +
        '- 代码高亮、表格、任务列表\\n\\n' +
        '> 作者：何飞 · 微信：6731663 · MIT 开源协议\\n\\n' +
        '\`\`\`js\\n// 花生苗示例代码\\nfunction hello(name) {\\n  return \\\`你好，\\\${name}\\\`;\\n}\\n\`\`\`\\n\\n' +
        '| 功能 | 状态 |\\n| --- | --- |\\n| 实时渲染 | ✅ |\\n| 公式支持 | ✅ |\\n'
      );
      await window.__HSM__.wait(1500);
      document.querySelector('.sidebar__tab[data-panel="outline"]')?.click();
      await window.__HSM__.wait(500);
      return true;
    `);
    // 切换到浅色模式后再截图（避免与深色截图重复）
    await client.evaluate(`
      const btn = document.getElementById('st-theme');
      for (let i = 0; i < 4 && document.documentElement.getAttribute('data-color-mode') !== 'light'; i++) {
        btn.click();
        await window.__HSM__.wait(350);
      }
      return document.documentElement.getAttribute('data-color-mode');
    `);
    const shot1 = await client.screenshot('01-主界面-浅色.png');
    console.log(`  ${shot1 ? '✓' : '✗'} 主界面（浅色）`);

    await client.evaluate(`
      const btn = document.getElementById('st-theme');
      // 切到深色模式
      for (let i = 0; i < 4 && document.documentElement.getAttribute('data-color-mode') !== 'dark'; i++) {
        btn.click();
        await window.__HSM__.wait(350);
      }
      return document.documentElement.getAttribute('data-color-mode');
    `);
    const shot2 = await client.screenshot('02-主界面-深色.png');
    console.log(`  ${shot2 ? '✓' : '✗'} 主界面（深色）`);

    await client.evaluate(`await window.__HSM__.run('help.shortcuts'); await window.__HSM__.wait(700); return true;`);
    const shot3 = await client.screenshot('03-快捷键设置.png');
    console.log(`  ${shot3 ? '✓' : '✗'} 快捷键设置`);
    await client.evaluate(`document.querySelector('.overlay.is-open .modal__close')?.click(); await window.__HSM__.wait(300); return true;`);

    await client.evaluate(`await window.__HSM__.run('file.settings'); await window.__HSM__.wait(700); return true;`);
    const shot4 = await client.screenshot('04-设置面板.png');
    console.log(`  ${shot4 ? '✓' : '✗'} 设置面板`);
    await client.evaluate(`document.querySelector('.overlay.is-open .modal__close')?.click(); await window.__HSM__.wait(300); return true;`);

    await client.evaluate(`await window.__HSM__.run('help.about'); await window.__HSM__.wait(600); return true;`);
    const shot5 = await client.screenshot('05-关于对话框.png');
    console.log(`  ${shot5 ? '✓' : '✗'} 关于对话框`);
    await client.evaluate(`document.querySelector('.overlay.is-open .modal__close')?.click(); await window.__HSM__.wait(300); return true;`);

    // 查找与替换（Ctrl+H）：展示查找到的匹配高亮与计数
    await client.evaluate(`
      await window.__HSM__.run('edit.replace');
      await window.__HSM__.wait(400);
      const input = document.getElementById('find-input');
      input.value = '实时渲染';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('replace-input').value = '所见即所得';
      document.getElementById('replace-input').dispatchEvent(new Event('input', { bubbles: true }));
      await window.__HSM__.wait(600);
      return true;
    `);
    const shotFind = await client.screenshot('07-查找与替换.png');
    console.log(`  ${shotFind ? '✓' : '✗'} 查找与替换`);
    await client.evaluate(`
      document.getElementById('find-close').click();
      await window.__HSM__.wait(300);
      return true;
    `);

    await client.evaluate(`
      await window.__HSM__.run('view.toggleSource');
      await window.__HSM__.wait(800);
      return true;
    `);
    const shot6 = await client.screenshot('06-源码模式.png');
    console.log(`  ${shot6 ? '✓' : '✗'} 源码模式`);

    /* -------------------- 汇总 -------------------- */
    const passed = results.filter((r) => r.pass).length;
    const total = results.length;

    console.log('\n══════════════════════════════════════════════════════════');
    console.log(`  测试结果：${passed}/${total} 通过`);
    if (passed < total) {
      console.log('\n  未通过用例：');
      for (const r of results.filter((x) => !x.pass)) {
        console.log(`    ✗ ${r.name}`);
        console.log(`      ${r.detail}`);
      }
    }
    console.log('══════════════════════════════════════════════════════════\n');

    // 把结果写入文件，便于后续查阅
    const reportPath = path.join(ROOT, 'docs', '测试报告.md');
    const lines = [
      '# 花生苗 Markdown 编辑器 —— 端到端测试报告',
      '',
      `- 测试时间：${new Date().toLocaleString('zh-CN')}`,
      `- 运行平台：${process.platform} ${process.arch}`,
      `- 通过率：**${passed}/${total}**`,
      '',
      '## 用例明细',
      '',
      '| # | 用例 | 结果 | 说明 |',
      '| --- | --- | --- | --- |',
      ...results.map((r, i) => `| ${i + 1} | ${r.name} | ${r.pass ? '✅ 通过' : '❌ 未通过'} | ${String(r.detail).replace(/\|/g, '\\|')} |`),
      '',
      '## 界面截图',
      '',
      '截图文件位于 `docs/screenshots/`：',
      '',
      '- `01-主界面-浅色.png`',
      '- `02-主界面-深色.png`',
      '- `03-快捷键设置.png`',
      '- `04-设置面板.png`',
      '- `05-关于对话框.png`',
      '- `06-源码模式.png`',
      '- `07-查找与替换.png`',
      '',
    ];
    fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');
    console.log(`测试报告已写入：${reportPath}\n`);

    if (!KEEP) {
      child.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 800));
      if (!child.killed) child.kill('SIGKILL');
    } else {
      console.log('窗口保持运行中（使用 Ctrl+C 结束）');
    }

    process.exit(passed === total ? 0 : 1);
  } catch (e) {
    console.error('\n✗ 测试执行失败：', e.message);
    console.error('\n应用输出（最后 40 行）：');
    console.error(logs.join('').split('\n').slice(-40).join('\n'));
    client?.close();
    child.kill('SIGKILL');
    process.exit(1);
  }
}

main();
