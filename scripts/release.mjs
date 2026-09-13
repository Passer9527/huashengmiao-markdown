/**
 * 花生苗 Markdown 编辑器 —— 打包脚本
 * ------------------------------------------------------------------
 * 在调用 electron-builder 之前统一做好三件事：
 *   1. 设置二进制下载镜像（国内网络环境下 Electron 与打包工具链
 *      都从 npmmirror 镜像获取，避免因访问 GitHub 失败而中断）；
 *   2. 先执行一次完整构建，保证打进包里的永远是当前源码的产物；
 *   3. 打完包后列出所有产物及其体积。
 *
 * 实现说明：这里使用 electron-builder 的 Node API 而不是命令行。
 *   通过子进程调用 CLI 时，argv 的结构在不同 Node 启动方式下存在差异，
 *   容易出现"参数被误解析"的问题；直接调用 API 可完全规避，且跨平台一致。
 *
 * 用法：
 *   node scripts/release.mjs linux          打包 Linux（AppImage / deb / tar.gz）
 *   node scripts/release.mjs win            打包 Windows（NSIS 安装向导 + 便携版）
 *   node scripts/release.mjs win linux      同时打包多个平台
 *   node scripts/release.mjs mac            打包 macOS（需在 macOS 上执行）
 *   node scripts/release.mjs dir            只输出免安装目录（调试用）
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

/** 国内镜像地址：Electron 运行时与打包工具链均走镜像 */
const MIRRORS = {
  ELECTRON_MIRROR: 'https://registry.npmmirror.com/-/binary/electron/',
  ELECTRON_BUILDER_BINARIES_MIRROR: 'https://registry.npmmirror.com/-/binary/electron-builder-binaries/',
};

/** 各平台支持的目标格式（与 electron-builder.yml 中的配置保持一致） */
const FORMATS = {
  win: ['nsis', 'portable'],
  linux: ['AppImage', 'deb', 'tar.gz'],
  mac: ['dmg'],
};

/* ==================== 命令行参数 ==================== */

const args = process.argv.slice(2);
const targets = args.filter((a) => !a.startsWith('-'));
const onlyDir = targets.includes('dir');

if (targets.length === 0) {
  console.log('用法：node scripts/release.mjs <dir|win|linux|mac> [...]');
  process.exit(1);
}

/* ==================== 工具 ==================== */

/**
 * 执行子进程并把输出转发到当前终端
 * @param {string} command 可执行文件
 * @param {string[]} commandArgs 参数列表
 */
function run(command, commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: ROOT,
      env: process.env,
      stdio: 'inherit',
      shell: false,
    });
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${command} 退出码 ${code}`))));
    child.on('error', reject);
  });
}

/**
 * 调用 electron-builder 生成安装包
 * @param {string[]} buildTargets 目标平台列表，或 ['dir']
 */
async function runBuilder(buildTargets) {
  const { build, Platform, Arch } = await import('electron-builder');

  // 只输出免安装目录（调试用）
  if (buildTargets.length === 1 && buildTargets[0] === 'dir') {
    await build({ targets: Platform.current().createTarget(undefined, Arch.x64), publish: 'never' });
    return;
  }

  const platformOf = { win: Platform.WINDOWS, linux: Platform.LINUX, mac: Platform.MAC };
  const allTargets = [];

  for (const t of buildTargets) {
    const platform = platformOf[t];
    if (!platform) throw new Error(`不支持的平台：${t}（可选：win / linux / mac / dir）`);
    allTargets.push(...platform.createTarget(FORMATS[t], Arch.x64));
  }

  await build({ targets: allTargets, publish: 'never' });
}

/* ==================== 主流程 ==================== */

async function main() {
  console.log('══════════════════════════════════════════════════');
  console.log('  花生苗 Markdown 编辑器 —— 打包');
  console.log('  作者：何飞 · 微信 6731663 · MIT 开源协议');
  console.log('══════════════════════════════════════════════════\n');

  // 镜像与签名相关环境变量
  Object.assign(process.env, MIRRORS);
  if (process.platform !== 'win32' && targets.includes('win')) {
    // 在非 Windows 上构建未签名的 Windows 包时关闭签名自动发现，
    // 避免因找不到证书而中断构建
    process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
  }

  // 1) 构建源码
  console.log('▶ 步骤 1/2：构建源码');
  await run(process.execPath, [path.join(__dirname, 'build.mjs')]);

  // 2) 打包
  const buildTargets = onlyDir ? ['dir'] : targets;
  console.log('\n▶ 步骤 2/2：生成安装包');
  console.log(`  目标平台：${buildTargets.join(', ')}\n`);
  await runBuilder(buildTargets);

  // 3) 产物清单
  const releaseDir = path.join(ROOT, 'release');
  if (fs.existsSync(releaseDir)) {
    console.log('\n▶ 打包产物（release/ 目录）：');
    const files = fs
      .readdirSync(releaseDir, { withFileTypes: true })
      .filter((d) => d.isFile() && !d.name.endsWith('.blockmap') && !d.name.endsWith('.yml'))
      .map((d) => ({ name: d.name, size: fs.statSync(path.join(releaseDir, d.name)).size }))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const f of files) {
      console.log(`   ${f.name.padEnd(56)} ${(f.size / 1024 / 1024).toFixed(1)} MB`);
    }
    if (files.length === 0) console.log('   （未生成安装包，请查看上方日志）');
  }

  console.log('\n✓ 打包流程结束');
}

main().catch((e) => {
  console.error('\n✗ 打包失败：', e.message);
  process.exit(1);
});
