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
 * 带重试的 git push。
 *
 * 国内网络访问 github.com 时，HTTPS 长连接偶发被中断
 * （典型报错：GnuTLS recv error (-110): The TLS connection was non-properly terminated），
 * 这属于网络抖动而非权限或历史问题——重新推送通常立刻成功。
 * 因此这里最多重试 4 次，每次间隔递增，并在日志里说明重试原因。
 *
 * @param {string[]} args 传给 git 的参数（需以 push 开头）
 */
async function gitPush(args) {
  const MAX = 4;
  for (let attempt = 1; attempt <= MAX; attempt += 1) {
    const result = await run('git', args, { allowFail: true, capture: true });
    process.stdout.write(result.out);
    if (result.code === 0) return;

    // 权限类错误重试没有意义，直接抛出，避免浪费用户时间
    if (/denied|403|Authentication failed|Permission to/i.test(result.out)) {
      throw new Error(result.out.trim().split('\n').filter(Boolean).pop());
    }
    if (attempt === MAX) {
      throw new Error(`git push 连续 ${MAX} 次失败：${result.out.trim().split('\n').filter(Boolean).pop()}`);
    }
    const waitMs = attempt * 3000;
    console.log(`  · 推送失败（第 ${attempt}/${MAX} 次），疑似网络抖动，${waitMs / 1000} 秒后重试…`);
    await new Promise((r) => setTimeout(r, waitMs));
  }
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
  // 先取回远程最新状态，--force-with-lease 也依赖这一步的结果做安全校验。
  // 网络抖动会导致 fetch 失败，这里重试几次；全部失败时用本地已有的
  // refs/remotes/origin/main 继续（可能略旧，但后面的判断仍然安全）。
  for (let i = 1; i <= 3; i += 1) {
    const fetched = await run('git', ['fetch', 'origin'], { allowFail: true, capture: true });
    if (fetched.code === 0) break;
    if (i === 3) console.log('  · 获取远程状态失败（网络抖动），改用本地记录的远程分支继续');
    else await new Promise((r) => setTimeout(r, i * 2000));
  }

  const hasRemote = await run('git', ['rev-parse', '--verify', '--quiet', 'origin/main'], {
    allowFail: true,
    capture: true,
  });

  // 远程还没有 main 分支：首次推送
  if (hasRemote.code !== 0) {
    await gitPush(['push', '-u', 'origin', 'main']);
    return;
  }

  // 本地包含远程全部提交：正常快进
  const fastForward = await run('git', ['merge-base', '--is-ancestor', 'origin/main', 'main'], {
    allowFail: true,
    capture: true,
  });
  if (fastForward.code === 0) {
    await gitPush(['push', '-u', 'origin', 'main']);
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
  await gitPush(['push', '--force-with-lease', '-u', 'origin', 'main']);
}

/**
 * 更新 Release 的标题与说明。
 *
 * gh release edit 在带 --latest 时有较大概率返回 HTTP 500
 * （GitHub 接口在设置"最新版本"标记这一步不稳定），
 * 但此时标题与说明其实已经写入成功。因此这里做成"带 --latest 失败就退回不带"，
 * 避免一次无关紧要的标记失败让整个发布流程报错退出。
 *
 * @param {string} tag 版本标签，如 v1.0.0
 * @param {string} title Release 标题
 * @param {string} notes Release 说明（Markdown）
 * @param {string[]} extraArgs 追加参数，例如 --draft=false / --latest
 */
async function editRelease(tag, title, notes, extraArgs = []) {
  const base = ['release', 'edit', tag, '--title', title, '--notes', notes];
  const result = await run('gh', [...base, ...extraArgs], { allowFail: true, capture: true });
  if (result.code === 0) return;

  // 退一步：去掉 --latest 再试一次，保底把标题与说明写进去
  const fallbackArgs = extraArgs.filter((a) => a !== '--latest');
  if (fallbackArgs.length !== extraArgs.length) {
    console.log('  · 设置 --latest 失败（GitHub 返回 500），改为不带该标记重试');
    const retry = await run('gh', [...base, ...fallbackArgs], { allowFail: true, capture: true });
    if (retry.code === 0) return;
    throw new Error(`更新 Release 说明失败：${retry.out.trim().split('\n').pop()}`);
  }
  throw new Error(`更新 Release 说明失败：${result.out.trim().split('\n').pop()}`);
}

/**
 * 清理 Release 上多余的历史附件。
 *
 * 重新打包后文件名可能变化（例如把中文文件名改成英文），旧附件会一直留在
 * Release 页面上，既让用户困惑又白占空间。这里按"本地本次要发布的文件清单"
 * 精确比对，只删除不在清单里的附件——不碰其它 Release，也不会误删本次产物。
 *
 * @param {number} releaseId Release 数字 id
 * @param {string[]} assets 本次要发布的本地文件绝对路径列表
 */
async function pruneStaleAssets(releaseId, assets) {
  const keep = new Set(assets.map((a) => path.basename(a)));
  const listed = await run('gh', ['api', `repos/${OWNER}/${REPO}/releases/${releaseId}/assets`, '--paginate'], {
    allowFail: true,
    capture: true,
  });
  if (listed.code !== 0) return;

  /** @type {{id:number,name:string}[]} */
  let remoteAssets = [];
  try {
    remoteAssets = JSON.parse(listed.out || '[]');
  } catch {
    return;
  }

  const stale = remoteAssets.filter((a) => !keep.has(a.name));
  if (stale.length === 0) return;

  console.log(`  · 清理 ${stale.length} 个不属于本次发布的旧附件`);
  for (const a of stale) {
    const del = await run('gh', ['api', '-X', 'DELETE', `repos/${OWNER}/${REPO}/releases/assets/${a.id}`], {
      allowFail: true,
      capture: true,
    });
    console.log(`    ${del.code === 0 ? '已删除' : '删除失败'}  ${a.name}`);
  }
}

/** 主流程 */
async function main() {
  console.log('══════════════════════════════════════════════════');
  console.log('  花生苗 Markdown 编辑器 —— 发布到 GitHub');
  console.log('══════════════════════════════════════════════════\n');

  /* -------------------- 1. 检查仓库是否存在 -------------------- */
  console.log('▶ 检查远程仓库…');
  // 判断"仓库不存在"必须用 api.github.com（gh）而不是 git ls-remote：
  // 国内网络访问 github.com 的 git over HTTPS 经常超时，一次抖动就会让
  // ls-remote 失败并被误判成"仓库不存在"，从而给出完全错误的提示。
  const repoInfo = await run('gh', ['api', `repos/${OWNER}/${REPO}`, '--jq', '.full_name'], {
    allowFail: true,
    capture: true,
  });
  if (repoInfo.code !== 0) {
    console.error(`✗ 无法通过 API 访问仓库 ${OWNER}/${REPO}`);
    console.error('  若提示 404，请先在浏览器打开 https://github.com/new 创建同名 Public 仓库');
    console.error('  （不要勾选任何初始化选项），再重新运行本脚本。');
    console.error(`  原始信息：${repoInfo.out.trim().split('\n').filter(Boolean).pop() || '（无）'}`);
    process.exit(1);
  }
  console.log(`  ✓ 仓库存在：${repoInfo.out.trim()}`);

  // 再探测一次 git 通道；失败不算致命（可能是网络抖动），后续 push 会重试
  const probe = await run('git', ['ls-remote', '--heads', REMOTE_URL], { allowFail: true, capture: true });
  console.log(
    probe.code === 0
      ? `  ✓ git 通道正常：${REMOTE_URL}`
      : '  · git 通道暂不可达（网络抖动），推送时脚本会自动重试'
  );

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
    '| Windows | `huashengmiao-markdown-Setup-*.exe` | 安装向导，可自定义安装路径、可勾选桌面与开始菜单快捷方式 |',
    '| Windows | `huashengmiao-markdown-Portable-*.exe` | 单文件免安装，双击即用 |',
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

  /* -------------------- 4. 决定新建还是复用已有 Release -------------------- */
  // 必须用 API 查询而不是 gh release view：草稿（draft）Release 用 view 查不到，
  // 而"上一次运行留下同名草稿"恰恰是最常见的重复发布场景——
  // 此时直接再调用 gh release create 会被 GitHub 拒绝并返回 HTTP 500。
  const listResult = await run('gh', ['api', `repos/${OWNER}/${REPO}/releases`, '--paginate'], {
    allowFail: true,
    capture: true,
  });

  /** @type {{tag_name?:string, draft?:boolean, id?:number}|null} */
  let existing = null;
  try {
    const list = JSON.parse(listResult.out || '[]');
    existing = list.find((r) => r.tag_name === tag) ?? null;
  } catch {
    // API 返回异常时按"不存在"处理，后面的 create 会给出真实错误
    existing = null;
  }

  const title = `花生苗 Markdown 编辑器 ${tag}`;
  const latestArgs = process.env.HSM_RELEASE_NO_LATEST ? [] : ['--latest'];

  if (existing && existing.draft) {
    // 复用草稿：先补传附件，再把草稿转正，这样不会在仓库里留下两个同 tag 的 Release
    console.log(`  · 已存在同名草稿 Release（id ${existing.id}），尝试复用`);
    const uploaded = await run('gh', ['release', 'upload', tag, ...assets, '--clobber'], { allowFail: true });
    if (uploaded.code === 0) {
      await editRelease(tag, title, notes, ['--draft=false', ...latestArgs]);
      await pruneStaleAssets(existing.id, assets);
    } else {
      // 草稿还没有对应的 tag 引用，gh 有时会定位不到它；此时删掉这个空草稿重新创建
      console.log('  · gh 无法按 tag 定位草稿，改为删除后重新创建');
      await run('gh', ['release', 'delete', tag, '--yes', '--cleanup-tag'], { allowFail: true });
      await run('gh', ['release', 'create', tag, '--title', title, '--notes', notes, ...latestArgs, ...assets]);
    }
  } else if (existing) {
    console.log(`  · 已存在正式 Release ${tag}，仅更新附件与说明`);
    await run('gh', ['release', 'upload', tag, ...assets, '--clobber']);
    await pruneStaleAssets(existing.id, assets);
    await editRelease(tag, title, notes, latestArgs);
  } else {
    await run('gh', ['release', 'create', tag, '--title', title, '--notes', notes, ...latestArgs, ...assets]);
  }

  console.log('\n══════════════════════════════════════════════════');
  console.log(`✓ 发布完成：${REMOTE_URL}/releases/tag/${tag}`);
  console.log('══════════════════════════════════════════════════');
}

main().catch((e) => {
  console.error('\n✗ 发布失败：', e.message);
  process.exit(1);
});
