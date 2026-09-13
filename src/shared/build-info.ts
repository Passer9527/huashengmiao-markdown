/**
 * 花生苗 Markdown 编辑器 —— 构建期信息
 * ------------------------------------------------------------------
 * 下列常量的真实值由构建脚本（scripts/build.mjs）在打包时注入，
 * 这样版本号、作者信息只需维护 package.json 一处。
 *
 * 兜底逻辑保证在类型检查或单元测试等未注入环境下也能正常运行。
 *
 * 作者：何飞    联系方式：微信 6731663
 * 开源协议：MIT
 */

/* 由 esbuild 的 define 在构建时替换为字面量 */
declare const __APP_VERSION__: string;
declare const __APP_NAME__: string;
declare const __APP_AUTHOR__: string;
declare const __APP_CONTACT__: string;
declare const __APP_HOMEPAGE__: string;
declare const __BUILD_TIME__: string;

/** 版本号 */
export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0';

/** 软件全称 */
export const APP_NAME: string = typeof __APP_NAME__ !== 'undefined' ? __APP_NAME__ : '花生苗Markdown编辑器';

/** 作者 */
export const APP_AUTHOR: string = typeof __APP_AUTHOR__ !== 'undefined' ? __APP_AUTHOR__ : '何飞';

/** 联系方式 */
export const APP_CONTACT: string = typeof __APP_CONTACT__ !== 'undefined' ? __APP_CONTACT__ : '微信 6731663';

/** 项目主页 */
export const APP_HOMEPAGE: string =
  typeof __APP_HOMEPAGE__ !== 'undefined' ? __APP_HOMEPAGE__ : 'https://github.com/Passer9527/huashengmiao-markdown';

/** 开源协议 */
export const APP_LICENSE = 'MIT 开源协议';

/** 构建时间 */
export const BUILD_TIME: string = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : new Date().toISOString();

/** 一句话简介 */
export const APP_SLOGAN = '开源免费 · 所见即所得 · 轻量高性能的 Markdown 编辑器';
