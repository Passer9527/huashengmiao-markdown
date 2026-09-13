/**
 * 花生苗 Markdown 编辑器 —— Shiki 代码高亮独立打包入口
 * ------------------------------------------------------------------
 * 为什么需要单独的打包入口：
 *   Shiki 体积较大（含 TextMate 语法与主题），因此与 Mermaid 一样单独打成
 *   一个脚本，只有在文档中真正出现代码块时才按需注入，保证首屏启动速度。
 *
 * 为什么用 Shiki 而不是 highlight.js：
 *   highlight.js 的分词粒度太粗。以 Python 为例，`print(你好)\na = 10` 只会把
 *   print 与 10 标出来，变量 a、运算符 =、括号全都没有分类，代码块看上去
 *   "关键字、变量、符号混在一起"。Shiki 使用与 VS Code 相同的 TextMate 语法，
 *   能精确给出 keyword / operator / variable / punctuation 等作用域。
 *
 * 为什么自定义主题：
 *   即便是 VS Code 官方主题，普通变量（variable.other）也常常直接沿用正文色，
 *   仍然"区分不明显"。因此这里不直接使用内置主题，而是**按作用域自行配色**：
 *   关键字、函数名、变量、运算符、标点各给一个稳定且互相拉得开的颜色，
 *   并且与 src/shared/themes.ts 中的 5 套代码主题共用同一份调色板，
 *   编辑器内与导出结果的颜色完全一致。
 *
 * 构建产物：dist/renderer/shiki.js
 *
 * 作者：何飞    联系方式：微信 6731663
 * 开源协议：MIT
 */

import { createHighlighterCore, type HighlighterCore, type ThemeRegistrationRaw } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { CODE_THEMES } from '../../shared/themes';

/* ==================================================================
 * 一、支持的语言
 * ------------------------------------------------------------------
 * 只打包常用语言，兼顾体积与实用性；未收录的语言会回退到 highlight.js。
 * ================================================================== */

import langBash from '@shikijs/langs/bash';
import langC from '@shikijs/langs/c';
import langCpp from '@shikijs/langs/cpp';
import langCsharp from '@shikijs/langs/csharp';
import langCss from '@shikijs/langs/css';
import langDiff from '@shikijs/langs/diff';
import langDockerfile from '@shikijs/langs/dockerfile';
import langGo from '@shikijs/langs/go';
import langHtml from '@shikijs/langs/html';
import langIni from '@shikijs/langs/ini';
import langJava from '@shikijs/langs/java';
import langJavascript from '@shikijs/langs/javascript';
import langJson from '@shikijs/langs/json';
import langJsx from '@shikijs/langs/jsx';
import langKotlin from '@shikijs/langs/kotlin';
import langLua from '@shikijs/langs/lua';
import langMarkdown from '@shikijs/langs/markdown';
import langPhp from '@shikijs/langs/php';
import langPowershell from '@shikijs/langs/powershell';
import langPython from '@shikijs/langs/python';
import langR from '@shikijs/langs/r';
import langRuby from '@shikijs/langs/ruby';
import langRust from '@shikijs/langs/rust';
import langScss from '@shikijs/langs/scss';
import langShellscript from '@shikijs/langs/shellscript';
import langSql from '@shikijs/langs/sql';
import langSwift from '@shikijs/langs/swift';
import langToml from '@shikijs/langs/toml';
import langTsx from '@shikijs/langs/tsx';
import langTypescript from '@shikijs/langs/typescript';
import langVue from '@shikijs/langs/vue';
import langXml from '@shikijs/langs/xml';
import langYaml from '@shikijs/langs/yaml';

/** 已打包的语法定义 */
const LANGS = [
  langBash, langC, langCpp, langCsharp, langCss, langDiff, langDockerfile, langGo,
  langHtml, langIni, langJava, langJavascript, langJson, langJsx, langKotlin, langLua,
  langMarkdown, langPhp, langPowershell, langPython, langR, langRuby, langRust,
  langScss, langShellscript, langSql, langSwift, langToml, langTsx, langTypescript,
  langVue, langXml, langYaml,
];

/* ==================================================================
 * 二、由同一份调色板生成 TextMate 主题
 * ================================================================== */

/**
 * 把编辑器的代码主题调色板转换为 Shiki 的 TextMate 主题
 *
 * 作用域的选择遵循 VS Code / TextMate 的通用约定；
 * 规则顺序上"更具体的作用域写在后面"，以确保能覆盖较宽泛的规则
 * （例如 keyword.operator 要覆盖 keyword）。
 *
 * @param palette 调色板（来自 src/shared/themes.ts）
 * @param id 主题标识
 * @param dark 是否为深色主题
 */
function buildTheme(
  palette: (typeof CODE_THEMES)[number]['colors'],
  id: string,
  dark: boolean,
): ThemeRegistrationRaw {
  const c = palette;
  const theme = {
    name: `hsm-${id}`,
    type: dark ? 'dark' : 'light',
    colors: {
      // 背景交给编辑器样式控制（保持与代码块圆角、边框一致）
      'editor.background': '#00000000',
      'editor.foreground': c.text,
    },
    tokenColors: [
      /* -------- 注释 -------- */
      { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: c.comment, fontStyle: 'italic' } },

      /* -------- 关键字 -------- */
      { scope: ['keyword', 'storage', 'storage.type', 'storage.modifier'], settings: { foreground: c.keyword } },
      { scope: ['keyword.control', 'keyword.other', 'keyword.declaration'], settings: { foreground: c.keyword, fontStyle: 'bold' } },

      /* -------- 字符串与正则 -------- */
      { scope: ['string', 'string.quoted', 'string.template'], settings: { foreground: c.string } },
      { scope: ['string.regexp', 'string.special'], settings: { foreground: c.literal } },
      { scope: ['punctuation.definition.string'], settings: { foreground: c.string } },

      /* -------- 数字与常量 -------- */
      { scope: ['constant.numeric', 'constant.integer', 'constant.float'], settings: { foreground: c.number } },
      { scope: ['constant.language', 'constant.character.escape', 'constant.other'], settings: { foreground: c.literal } },

      /* -------- 函数与类型 -------- */
      { scope: ['entity.name.function', 'support.function', 'meta.function-call.entity.name'], settings: { foreground: c.title } },
      { scope: ['entity.name.type', 'entity.name.class', 'entity.name.namespace', 'support.class', 'support.type'], settings: { foreground: c.type } },
      { scope: ['support.function.builtin', 'support.constant', 'entity.name.function.builtin'], settings: { foreground: c.builtin } },

      /* -------- 变量（本次的重点：给变量独立配色） -------- */
      { scope: ['variable', 'variable.other', 'variable.other.readwrite', 'variable.other.object'], settings: { foreground: c.variable } },
      { scope: ['variable.parameter', 'variable.function'], settings: { foreground: c.variable } },
      { scope: ['variable.language', 'variable.language.this', 'variable.language.self'], settings: { foreground: c.keyword, fontStyle: 'italic' } },

      /* -------- 属性与成员 -------- */
      { scope: ['variable.other.property', 'meta.object-literal.key', 'support.variable.property', 'entity.name.tag.yaml'], settings: { foreground: c.attr } },
      { scope: ['entity.name.tag', 'meta.tag', 'punctuation.definition.tag'], settings: { foreground: c.tag } },
      { scope: ['entity.other.attribute-name'], settings: { foreground: c.attr } },

      /* -------- 运算符与标点（区分度的另一半） -------- */
      { scope: ['punctuation', 'punctuation.separator', 'punctuation.terminator', 'punctuation.section'], settings: { foreground: c.punctuation } },
      { scope: ['punctuation.bracket', 'punctuation.parenthesis', 'punctuation.accessor'], settings: { foreground: c.punctuation } },
      { scope: ['keyword.operator', 'keyword.operator.assignment', 'keyword.operator.arithmetic', 'keyword.operator.comparison', 'keyword.operator.logical'], settings: { foreground: c.operator } },

      /* -------- 预处理与元信息 -------- */
      { scope: ['meta.preprocessor', 'meta.import', 'meta.annotation', 'punctuation.definition.annotation'], settings: { foreground: c.meta } },
      { scope: ['meta'], settings: { foreground: c.meta } },

      /* -------- 增删行（diff） -------- */
      { scope: ['markup.inserted', 'punctuation.definition.inserted'], settings: { foreground: c.addition } },
      { scope: ['markup.deleted', 'punctuation.definition.deleted'], settings: { foreground: c.deletion } },
      { scope: ['markup.heading', 'markup.bold'], settings: { foreground: c.title, fontStyle: 'bold' } },
      { scope: ['markup.italic'], settings: { fontStyle: 'italic' } },
      { scope: ['invalid'], settings: { foreground: c.deletion } },
    ],
  };

  // ⚠️ 这里必须用类型断言，绝不能真的补一个 settings 字段：
  //    Shiki 检测到主题对象里存在 settings 时会**忽略 tokenColors**，
  //    结果是所有 token 都退化成默认前景色（实测已验证）。
  //    而类型定义 ThemeRegistrationRaw 恰好要求 settings 存在，
  //    因此只能断言绕开。
  return theme as unknown as ThemeRegistrationRaw;
}

/** 由调色板生成的全部自定义主题 */
const THEMES: ThemeRegistrationRaw[] = CODE_THEMES.map((t) => buildTheme(t.colors, t.id, t.dark));

/** 主题名 -> 调色板标识 的映射（Shiki 中的主题名统一加 hsm- 前缀） */
const THEME_NAME: Record<string, string> = Object.fromEntries(CODE_THEMES.map((t) => [t.id, `hsm-${t.id}`]));

/* ==================================================================
 * 三、高亮器初始化与对外接口
 * ================================================================== */

/** 高亮器实例 */
let highlighter: HighlighterCore | null = null;

/** 初始化 Promise（保证并发调用只初始化一次） */
let initPromise: Promise<HighlighterCore> | null = null;

/**
 * 初始化 Shiki 高亮器
 *
 * 使用纯 JavaScript 正则引擎而非 WASM 版本：
 * 页面通过 file:// 协议加载，fetch 本地 .wasm 会被安全策略拦截，
 * 而 JS 引擎无需额外资源，对代码块这种规模的文本性能完全够用。
 */
export function initShiki(): Promise<HighlighterCore> {
  if (highlighter) return Promise.resolve(highlighter);
  if (initPromise) return initPromise;

  initPromise = createHighlighterCore({
    themes: THEMES,
    langs: LANGS,
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  }).then((h) => {
    highlighter = h;
    return h;
  });

  return initPromise;
}

/**
 * 渲染代码为带语法高亮的 HTML
 *
 * @param code 代码内容
 * @param lang 语言标识（可为空，为空时不加语言以避免误判）
 * @param themeId 代码主题标识（与设置中的 appearance.codeTheme 一致）
 * @returns 高亮后的 HTML；语言不支持时返回 null，由调用方回退
 */
export function highlight(code: string, lang: string, themeId: string): string | null {
  if (!highlighter) return null;

  const language = (lang || '').trim().split(/\s+/)[0].toLowerCase();
  const theme = THEME_NAME[themeId] ?? THEME_NAME.github;

  // 未指定语言、或语法未打包时，交由调用方回退处理
  if (!language || !highlighter.getLoadedLanguages().includes(language)) return null;

  try {
    return highlighter.codeToHtml(code, {
      lang: language,
      theme,
      // 背景由编辑器样式统一控制，这里不输出内联背景
      colorReplacements: {},
    });
  } catch {
    return null;
  }
}

/** 已加载的语言列表（供调用方判断是否需要回退） */
export function loadedLanguages(): string[] {
  return highlighter ? [...highlighter.getLoadedLanguages()] : [];
}

/* 挂到全局，供主包调用（先挂上，初始化完成前 highlight 会返回 null） */
(window as unknown as { __HSM_SHIKI__?: unknown }).__HSM_SHIKI__ = {
  highlight,
  loadedLanguages,
};

// 立即开始初始化；完成后广播事件，主包据此把已渲染的代码块升级为 Shiki 结果
void initShiki()
  .then(() => {
    window.dispatchEvent(new Event('hsm:shiki-ready'));
  })
  .catch((e) => {
    console.error('[花生苗] Shiki 初始化失败，代码块将继续使用 highlight.js 高亮', e);
  });

export default { initShiki, highlight, loadedLanguages };
