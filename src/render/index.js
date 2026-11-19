/**
 * 组件：样式渲染 —— CSS 公式生成 + <html> dataset 状态 + <style> 注入
 * v0.7.3：选择器去掉 .file-tree/.sy__file 作用域——App 版 DOM 无这些类
 * （JS 侧 v0.7.2 已修同坑），[data-nb-walked] 行标记本身就是唯一可靠作用域
 * 两种形态（block 整块背景 / bar 行首色条），四变量公式（h/s/l/a 各自
 * 可被笔记本 override，缺席回退全局滑条）。
 * 状态门控：html[data-cftree] 开关；样式元素 id 固定，applyStyle 幂等重建。
 */
import { cfg } from '../shared/config.js';

const STYLE_ID = "colorful-doc-tree-style";

function applyStyle() {
    let el = document.getElementById(STYLE_ID);
    if (!el) {
        el = document.createElement("style");
        el.id = STYLE_ID;
        document.head.appendChild(el);
    }
    document.documentElement.dataset.cftree = cfg.enabled ? "on" : "off";
    document.documentElement.dataset.cftreestyle = cfg.style === "bar" ? "bar" : "block";
    const a = cfg.alpha;
    // —— 形态一：整块背景（跨行距缝 + 块首/末圆角 + 块间留缝）——
    el.textContent =
        'html[data-cftree="on"][data-cftreestyle="block"] [data-nb-walked] {' +
        '  position: relative; isolation: isolate;' +
        "}\n" +
        'html[data-cftree="on"][data-cftreestyle="block"] [data-nb-walked]::after {' +
        '  content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none;' +
        "  background: oklch(var(--nb-l, " + cfg.light + "%) var(--nb-s, " + cfg.chroma + ") var(--nb-h, 231) / var(--nb-a, " + a + "));" +
        "}\n" +
        'html[data-cftree="on"][data-cftreestyle="block"] [data-nb-walked]::after {' +
        "  inset-block: -1px;" +
        "}\n" +
        'html[data-cftree="on"][data-cftreestyle="block"] [data-nb-block-start]::after {' +
        "  top: 3px; border-top-left-radius: 6px; border-top-right-radius: 6px;" +
        "}\n" +
        'html[data-cftree="on"][data-cftreestyle="block"] [data-nb-block-end]::after {' +
        "  bottom: 3px; border-bottom-left-radius: 6px; border-bottom-right-radius: 6px;" +
        "}\n" +
        // —— 形态二：行首色条 ——
        'html[data-cftree="on"][data-cftreestyle="bar"] [data-nb-walked] {' +
        "  position: relative; isolation: isolate;" +
        "}\n" +
        'html[data-cftree="on"][data-cftreestyle="bar"] [data-nb-walked]::after {' +
        '  content: ""; position: absolute; z-index: -1; pointer-events: none;' +
        "  width: 3px; inset-inline: 0 auto; inset-block: -1px;" +
        "  background: oklch(var(--nb-l, " + cfg.light + "%) var(--nb-s, " + cfg.chroma + ") var(--nb-h, 231));" +
        "}\n" +
        'html[data-cftree="on"][data-cftreestyle="bar"] [data-nb-block-start]::after {' +
        "  top: 3px; border-top-left-radius: 1.5px; border-top-right-radius: 1.5px;" +
        "}\n" +
        'html[data-cftree="on"][data-cftreestyle="bar"] [data-nb-block-end]::after {' +
        "  bottom: 3px; border-bottom-left-radius: 1.5px; border-bottom-right-radius: 1.5px;" +
        "}\n";
}

function removeStyle() {
    const el = document.getElementById(STYLE_ID);
    if (el) el.remove();
    delete document.documentElement.dataset.cftree;
    delete document.documentElement.dataset.cftreestyle;
}

function toggle() {
    cfg.enabled = !cfg.enabled;
    applyStyle();
    return cfg.enabled;
}

export { applyStyle, removeStyle, toggle, STYLE_ID };
