/**
 * 花生苗 Markdown 编辑器 —— GitHub 发布脚本
 * ------------------------------------------------------------------
 * 把源码推送到 GitHub，并把安装包作为 Release 附件发布。
 *
 * 为什么安装包走 Release 而不是直接提交进仓库：
 *   Git 仓库不适合存放上百 MB 的二进制文件——每次改动都会让仓库体积翻倍，
 *   克隆也会变得极慢。GitHub Release 附件没有这个问题，
 *   用户下载体验也更好（有独立的下载页与版本记录）。
 *
 * 用法：
 *   node scripts/publish-github.mjs              推送源码 + 发布 Release
 *   node scripts/publish-github.mjs --push-only  只推送源码
 *
 * 前置条件：仓库已存在（可用浏览器在 https://github.com/new 创建，或
 *           使用具备创建仓库权限的令牌执行 gh repo create）。
 *
 * 作者：何飞    联系方式：微信 6731663
 * 开源协议：MIT
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/** 目标仓库 */
const OWNER = 'Passer9527';
const REPO = 'huashengmiao-markdown';
const REMOTE_URL = `https://github.com/${OWNER}/${REPO}.git`;

const pushOnly = process.argv.includes('--push-only');

/**
 * 执行命令并转发输出
 * @param {string} command 可执行文件
 * @param {string[]} args 参数
 * @param {{allowFail?: boolean, capture?: boolean}} options 选项
 */
function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      shell: false,
    });
    let out = '';
    if (options.capture) {
      child.stdout.on('data', (d) => (out += d.toString()));
      child.stderr.on('data', (d) => (out += d.toString()));
    }
    child.on('close', (code) => {
      if (code === 0 || options.allowFail) resolve({ code, out });
      else reject(new Error(`${command} ${args.join(' ')} 退出码 ${code}`));
    });
    child.on('error', reject);
  });
}

/**
 * 把某个 git 命令的输出按行拆成非空数组
 * @param {string} text 命令输出
 * @returns {string[]} 去掉空行与首尾空白后的结果
 */
function lines(text) {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 安全地推送源码到远程 main。
 *
 * 为什么要写得这么麻烦：
 *   远程仓库常见两种"看起来该能推、实际推不上去"的状态——
 *   1）在 GitHub 网页上勾选了 README / .gitignore 初始化，远程多出一个提交；
 *   2）仓库刚建好时用 API 探测过写权限，留下若干"空提交"（不携带任何文件）。
 *   这两种情况下本地 main 与远程 main 没有快进关系，普通 git push 会被拒绝。
 *
 * 处理策略（宁可报错也绝不丢用户内容）：
 *   · 本地包含远程 → 直接快进推送；
 *   · 远程分支上没有任何文件、却有本地没有的提交 → 这些提交是空历史，
 *     用 --force-with-lease 覆盖（不会丢失任何文件内容）；
 *   · 远程存在本地没有的文件 → 停止推送并提示人工合并，绝不擅自覆盖。
 */
async function pushSource() {
  // 先取回远程最新状态，--force-with-lease 也依赖这一步的结果做安全校验
  await run('git', ['fetch', 'origin'], { allowFail: true, capture: true });

  const hasRemote = await run('git', ['rev-parse', '--verify', '--quiet', 'origin/main'], {
    allowFail: true,
    capture: true,
  });

  // 远程还没有 main 分支：首次推送
  if (hasRemote.code !== 0) {
    await run('git', ['push', '-u', 'origin', 'main']);
    return;
  }

  // 本地包含远程全部提交：正常快进
  const fastForward = await run('git', ['merge-base', '--is-ancestor', 'origin/main', 'main'], {
    allowFail: true,
    capture: true,
  });
  if (fastForward.code === 0) {
    await run('git', ['push', '-u', 'origin', 'main']);
    return;
  }

  // 走到这里说明历史出现分叉，需要判断远程是否携带真实文件
  const remoteOnlyCommits = lines((await run('git', ['rev-list', 'main..origin/main'], { capture: true })).out);
  // diff 中状态为 A 的条目 = 只存在于远程、本地没有的文件
  const diffOut = (
    await run('git', ['diff', '--name-status', 'main', 'origin/main'], { allowFail: true, capture: true })
  ).out;
  const remoteOnlyFiles = lines(diffOut)
    .filter((l) => l.startsWith('A\t'))
    .map((l) => l.split('\t').slice(1).join('\t'));

  console.log(`  · 远程 main 比本地多 ${remoteOnlyCommits.length} 个提交，其中新增文件 ${remoteOnlyFiles.length} 个`);

  if (remoteOnlyFiles.length > 0) {
    console.error('✗ 远程 main 上存在本地没有的文件，为避免覆盖他人内容已中止推送：');
    for (const f of remoteOnlyFiles.slice(0, 20)) console.error(`    ${f}`);
    if (remoteOnlyFiles.length > 20) console.error(`    …另有 ${remoteOnlyFiles.length - 20} 个`);
    console.error('');
    console.error('  请先人工合并远程改动后重新运行：');
    console.error('    git pull --rebase origin main');
    console.error('    node scripts/publish-github.mjs');
    process.exit(1);
  }

  console.log('  · 这些提交不携带任何文件（空历史），改用 --force-with-lease 安全覆盖');
  await run('git', ['push', '--force-with-lease', '-u', 'origin', 'main']);
}

/** 主流程 */
async function main() {
  console.log('══════════════════════════════════════════════════');
  console.log('  花生苗 Markdown 编辑器 —— 发布到 GitHub');
  console.log('══════════════════════════════════════════════════\n');

  /* -------------------- 1. 检查仓库是否存在 -------------------- */
  console.log('▶ 检查远程仓库…');
  const probe = await run('git', ['ls-remote', '--heads', REMOTE_URL], { allowFail: true, capture: true });
  if (probe.code !== 0) {
    console.error(`✗ 无法访问 ${REMOTE_URL}`);
    console.error('  请先在浏览器打开 https://github.com/new 创建同名 Public 空仓库');
    console.error('  （不要勾选任何初始化选项），然后重新运行本脚本。');
    process.exit(1);
  }
  console.log(`  ✓ 仓库可访问：${REMOTE_URL}`);

  /* -------------------- 2. 配置远程并推送 -------------------- */
  const remotes = await run('git', ['remote'], { capture: true });
  if (!remotes.out.split('\n').map((s) => s.trim()).includes('origin')) {
    await run('git', ['remote', 'add', 'origin', REMOTE_URL]);
    console.log('  ✓ 已添加远程 origin');
  } else {
    await run('git', ['remote', 'set-url', 'origin', REMOTE_URL]);
  }

  console.log('\n▶ 推送源码…');
  await pushSource();
  console.log('  ✓ 源码已推送');

  if (pushOnly) {
    console.log('\n✓ 完成（仅推送源码）');
    return;
  }

  /* -------------------- 3. 发布 Release -------------------- */
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const tag = `v${pkg.version}`;
  const releaseDir = path.join(ROOT, 'release');

  const assets = fs.existsSync(releaseDir)
    ? fs
        .readdirSync(releaseDir)
        .filter((f) => /\.(exe|AppImage|deb|tar\.gz)$/i.test(f))
        .map((f) => path.join(releaseDir, f))
    : [];

  if (assets.length === 0) {
    console.log('\n⚠ release/ 目录下没有安装包，跳过 Release 发布');
    console.log('  如需发布安装包，请先执行：npm run dist:all');
    return;
  }

  console.log(`\n▶ 发布 ${tag} 并上传 ${assets.length} 个安装包…`);
  for (const a of assets) {
    const mb = (fs.statSync(a).size / 1024 / 1024).toFixed(1);
    console.log(`    ${path.basename(a).padEnd(52)} ${mb} MB`);
  }

  const notes = [
    `## 花生苗 Markdown 编辑器 ${tag}`,
    '',
    '一款开源免费、所见即所得（Typora 类）的跨平台 Markdown 编辑器。',
    '',
    `**作者**：何飞 · **微信**：6731663 · **协议**：MIT`,
    '',
    '### 安装包',
    '',
    '| 平台 | 文件 | 说明 |',
    '| --- | --- | --- |',
    '| Windows | `花生苗Markdown编辑器-Setup-*.exe` | 安装向导，可自定义安装路径、可勾选桌面与开始菜单快捷方式 |',
    '| Windows | `花生苗Markdown编辑器-便携版-*.exe` | 单文件免安装，双击即用 |',
    '| Linux | `*.AppImage` | 免安装，`chmod +x` 后双击运行 |',
    '| Linux | `*.deb` | Debian / Ubuntu 双击安装 |',
    '| Linux | `*.tar.gz` | 绿色解压版 |',
    '',
    '安装包已内置运行时，**无需安装 Node.js、Python 或任何其它环境**，双击即用。',
    '',
    '### 校验',
    '',
    '下载后可直接双击安装；安装包未做代码签名，首次运行可能出现系统安全提示，选择"仍要运行"即可。',
  ].join('\n');

  const ghArgs = ['release', 'create', tag, '--title', `花生苗 Markdown 编辑器 ${tag}`, '--notes', notes];
  if (!process.env.HSM_RELEASE_NO_LATEST) ghArgs.push('--latest');
  for (const a of assets) ghArgs.push(a);

  const exists = await run('gh', ['release', 'view', tag], { allowFail: true, capture: true });
  if (exists.code === 0) {
    console.log(`  · 已存在 ${tag}，改为上传附件到该 Release`);
    await run('gh', ['release', 'upload', tag, ...assets, '--clobber']);
  } else {
    await run('gh', ghArgs);
  }

  console.log('\n══════════════════════════════════════════════════');
  console.log(`✓ 发布完成：${REMOTE_URL}/releases/tag/${tag}`);
  console.log('══════════════════════════════════════════════════');
}

main().catch((e) => {
  console.error('\n✗ 发布失败：', e.message);
  process.exit(1);
});
