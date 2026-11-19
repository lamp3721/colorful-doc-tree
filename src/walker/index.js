/**
 * 组件：文档树走查 —— 面板发现 / 观察 / 状态写入（不含渲染）
 * 虚拟化 DOM 跟踪：面板级 MutationObserver（行生灭/开合/滚动）+
 * dock 观察 + mouseup 节流发现（事件驱动，零轮询）。
 * 回环防护（走查窗口）：observer 盯 style，走查写 style 必回环——
 *   disconnect → walk → finally re-observe 根治（甄别法全败，勿再试）。
 * 状态契约（每行写四变量 + 三标记）：
 *   --nb-h/--nb-s/--nb-l/--nb-a   色描述（s/l/a 仅自定义色存在，缺席回退全局）
 *   data-nb-walked / data-nb-block-start / data-nb-block-end
 * 走查键（v0.4.6）：notebook 根行 data-node-id 为空，data-tree-key 恒为
 *   "notebook:<笔记本ID>"（rowData.ts:20）——剥前缀即 lsNotebooks 的真 ID，
 *   与设置面板 override 键同源。
 */
import { cfg } from '../shared/config.js';
import { hashHue, HUES } from '../shared/color.js';

let panelObservers = [];
let dockObserver = null;
let onMouseup = null;
let lastScan = 0;
let forceWalk = null;   // render/设置层注入的重走查钩子（override 改动即时生效）

const OBS_CFG = { childList: true, subtree: true, attributeFilter: ["style", "class", "data-type"] };

export function bindWalkAll(fn) { forceWalk = fn; }
export function walkAllNow() {
    panelObservers.forEach((po) => walkWindow(po.panel));
}

function isNb(li) {
    const dt = li.getAttribute("data-type");
    return dt === "navigation-root" || dt === "navigation-closed";
}

function nbIdOf(li) {
    const key = li.getAttribute("data-tree-key") || "";
    return key.startsWith("notebook:") ? key.slice(9) : key;
}

function walkTree(panel) {
    const rows = Array.prototype.slice.call(panel.querySelectorAll("li[aria-level]"));
    const valid = rows.filter((li) => !li.closest(".file-tree__pins") &&
        parseInt(li.getAttribute("aria-level"), 10) >= 1);
    let cur = null;      // 当前笔记本的完整色描述 {h, s?, l?, a?}（随笔记本传递）
    let prevHue = -1;
    for (let i = 0; i < valid.length; i++) {
        const li = valid[i];
        if (isNb(li)) {
            const ov = cfg.overrides && Object.prototype.hasOwnProperty.call(cfg.overrides, nbIdOf(li))
                ? cfg.overrides[nbIdOf(li)] : null;
            if (ov) {
                cur = typeof ov === "number" ? { h: ov } : ov;
            } else {
                // shuffleSeed：'重新分配'换 seed 重洗；__baseHue（全局基色，v0.6.1）：
                // 设了基色 → 十档色相围绕基色旋转（相邻档 ±30°，配色跟主题/基色走）；
                // 未设 → 纯哈希档位
                const seedKey = (li.getAttribute("data-tree-key") || "") + (cfg.shuffleSeed ? "#" + cfg.shuffleSeed : "");
                let h = hashHue(seedKey);
                if (typeof cfg.__baseHue === "number") {
                    h = (cfg.__baseHue + (HUES.indexOf(h) - HUES.indexOf(HUES.reduce((a, b) => Math.abs(b - cfg.__baseHue) < Math.abs(a - cfg.__baseHue) ? b : a, HUES[0])) + 5) * 30 + 36000) % 360;
                }
                cur = { h: h };
                if (cur.h === prevHue) cur.h = HUES[(HUES.indexOf(cur.h) + 1) % HUES.length];
            }
            prevHue = cur.h;
        }
        // 每行从 cur 统一写四变量（首子行同源同渲染）；s/l/a 仅自定义存在
        const st = li.style;
        setVar(st, "--nb-h", cur ? String(cur.h) : null);
        setVar(st, "--nb-s", cur && typeof cur.s === "number" ? String(Math.round(cur.s) / 100) : null);
        setVar(st, "--nb-l", cur && typeof cur.l === "number" ? String(Math.round(cur.l) + "%") : null);
        setVar(st, "--nb-a", cur && typeof cur.a === "number" ? String(Math.round(cur.a) / 100) : null);
        if (!li.hasAttribute("data-nb-walked")) li.setAttribute("data-nb-walked", "");
        const blockEnd = i + 1 >= valid.length || isNb(valid[i + 1]);
        setAttr(li, "data-nb-block-start", isNb(li));
        setAttr(li, "data-nb-block-end", blockEnd);
    }
}

function setVar(st, name, value) {
    const curV = st.getPropertyValue(name);
    if (value === null) { if (curV) st.removeProperty(name); }
    else if (curV !== value) st.setProperty(name, value);
}
function setAttr(li, name, on) {
    if (on && !li.hasAttribute(name)) li.setAttribute(name, "");
    else if (!on && li.hasAttribute(name)) li.removeAttribute(name);
}

function walk(panel) {
    // 走查资格按行自证：面板里有带 aria-level 的行就是文档树（桌面
    // .sy__file / Web .file-tree / App 无类名容器统一覆盖）
    if (panel.querySelector("li[aria-level]")) walkTree(panel);
}

function walkWindow(panel) {
    const po = panelObservers.find((o) => o.panel === panel);
    if (!po) { walk(panel); return; }
    po.obs.disconnect();
    try { walk(panel); } finally { po.obs.observe(panel, OBS_CFG); }
}

function attach(panel) {
    if (panel.hasAttribute("data-nb-obs")) return;
    panel.setAttribute("data-nb-obs", "1");
    const po = { panel, obs: null };
    po.obs = new MutationObserver(() => walkWindow(panel));
    po.obs.observe(panel, OBS_CFG);
    panelObservers.push(po);
    walkWindow(panel);
}

function scan(force) {
    if (!force && Date.now() - lastScan < 2000) return;
    lastScan = Date.now();
    // 桌面：.file-tree.sy__file（dock 面板）；移动端 Web：sidebar-file 内的
    // .file-tree；手机 App：DOM 无 .file-tree 类（v0.7.2 角标实测 ft=0 sbf=1），
    // 直接观察 sidebar-file 容器本身——行判定按 aria 标记自证不依赖容器类名
    const panels = document.querySelectorAll(".file-tree.sy__file, [data-type=\"sidebar-file\"], [data-type=\"sidebar-file\"] .file-tree");
    panels.forEach((p) => attach(p));
}

export function startWatchers() {
    if (onMouseup) return;
    // 移动端没有 mouseup 主力（触摸），touchend 同样作为发现时机
    onMouseup = () => scan();
    document.addEventListener("mouseup", onMouseup);
    document.addEventListener("touchend", onMouseup, { passive: true });
    if (!dockObserver) {
        dockObserver = new MutationObserver(() => scan());
        // 桌面：dock 容器；移动端：侧栏面板容器（sidebar-file 首开挂载）
        ["dockLeft", "dockRight"].forEach((id) => {
            const dock = document.getElementById(id);
            if (dock) dockObserver.observe(dock, { childList: true, subtree: true });
        });
        // 移动端兜底：body childList（侧栏面板挂载/激活时触发；观察很轻——
        // 只记 childList 不记属性，且发现逻辑有 2s 节流）
        const mobileSidebar = document.querySelector(".side-panel") || document.body;
        dockObserver.observe(mobileSidebar, { childList: true, subtree: false });
    }
    scan(true);
}

export function stopWatchers() {
    if (onMouseup) {
        document.removeEventListener("mouseup", onMouseup);
        document.removeEventListener("touchend", onMouseup);
        onMouseup = null;
    }
    if (dockObserver) { dockObserver.disconnect(); dockObserver = null; }
    panelObservers.forEach((po) => po.obs.disconnect());
    panelObservers = [];
    document.querySelectorAll("[data-nb-obs]").forEach((p) => p.removeAttribute("data-nb-obs"));
}

export function clearMarks() {
    document.querySelectorAll("[data-nb-walked]").forEach((li) => {
        li.style.removeProperty("--nb-h");
        li.style.removeProperty("--nb-s");
        li.style.removeProperty("--nb-l");
        li.style.removeProperty("--nb-a");
        li.removeAttribute("data-nb-walked");
        li.removeAttribute("data-nb-block-start");
        li.removeAttribute("data-nb-block-end");
    });
}
