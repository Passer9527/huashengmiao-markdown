/**
 * 花生苗 Markdown 编辑器 —— Mermaid 独立打包入口
 * ------------------------------------------------------------------
 * Mermaid 体积较大（压缩后约 2MB），因此单独打成一个脚本文件，
 * 只有在文档中真正出现 Mermaid 图表时才由 mermaid.ts 动态注入，
 * 保证首屏启动速度不受影响。
 *
 * 构建产物：dist/renderer/mermaid.js
 *
 * 作者：何飞    联系方式：微信 6731663
 * 开源协议：MIT
 */

import mermaid from 'mermaid';

// 初始化 Mermaid：关闭自动扫描（由本软件自行控制渲染时机），
// 关闭错误图，避免渲染失败时插入一大块红色提示。
mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict', // 严格模式：禁止图表内的脚本与外部资源
  theme: 'default',
  fontFamily: '-apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  flowchart: { htmlLabels: true, useMaxWidth: true },
  sequence: { useMaxWidth: true },
  gantt: { useMaxWidth: true },
  er: { useMaxWidth: true },
  themeVariables: {
    primaryColor: '#e8f8f1',
    primaryBorderColor: '#22a06b',
    primaryTextColor: '#1f2328',
    lineColor: '#8b949e',
    fontSize: '14px',
  },
});

// 挂到全局，供主包调用
(window as unknown as { __HSM_MERMAID__?: typeof mermaid }).__HSM_MERMAID__ = mermaid;

// 通知等待中的调用方：Mermaid 已就绪
window.dispatchEvent(new Event('hsm:mermaid-ready'));

export default mermaid;
