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

// v0.7.7 行归属解析：root 行键 notebook:<id>；子行键 <nbid>/<docid>
// （内核 DocTreeController.ts:165 同款解析）。移动端虚拟化会卸载滚出视口的行，
// root 行卸载后继承式染色断链（子行回退默认 231 灰蓝）——改为每行按自身键
// 独立解析所属笔记本，与 root 行是否在场无关。
function nbOwnerOf(li) {
    // 键是递归拼接（DocTreeModel.ts:106 occurrenceKey = parentKey + "/" + id）：
    // root = notebook:<id>，子行 = notebook:<id>/<docId>，孙行再叠 /<docId>…
    // 剥 notebook: 前缀后截第一个斜杠，剩下的第一段才是所属笔记本 id
    const key = li.getAttribute("data-tree-key") || "";
    if (!key) return null;
    const k = key.startsWith("notebook:") ? key.slice(9) : key;
    const slash = k.indexOf("/");
    return slash > 0 ? k.slice(0, slash) : (k || null);
}

function walkTree(panel) {
    const rows = Array.prototype.slice.call(panel.querySelectorAll("li[aria-level]"));
    const valid = rows.filter((li) => !li.closest(".file-tree__pins") &&
        parseInt(li.getAttribute("aria-level"), 10) >= 1);
    // 按笔记本 id 缓存色描述：一次走查内同本复用；跨走查由哈希/override 决定，
    // 与行的挂载集合无关——滚动卸载/回挂不再引起颜色跳变
    const descCache = new Map();
    let prevHue = -1;
    const descOf = (nbid) => {
        let d = descCache.get(nbid);
        if (d) return d;
        const ov = cfg.overrides && Object.prototype.hasOwnProperty.call(cfg.overrides, nbid)
            ? cfg.overrides[nbid] : null;
        if (ov) {
            d = typeof ov === "number" ? { h: ov } : ov;
        } else {
            // shuffleSeed：'重新分配'换 seed 重洗；__baseHue（全局基色，v0.6.1）：
            // 设了基色 → 色相围绕基色旋转（相邻档 ±360/档数，配色跟主题/基色走）；
            // 未设 → 纯哈希档位。键固定用 notebook:<id>（root 行原键，颜色不重洗）
            const seedKey = "notebook:" + nbid + (cfg.shuffleSeed ? "#" + cfg.shuffleSeed : "");
            let h = hashHue(seedKey);
            if (typeof cfg.__baseHue === "number") {
                h = (cfg.__baseHue + (HUES.indexOf(h) - HUES.indexOf(HUES.reduce((a, b) => Math.abs(b - cfg.__baseHue) < Math.abs(a - cfg.__baseHue) ? b : a, HUES[0])) + 5) * (360 / HUES.length) + 36000) % 360;
            }
            if (h === prevHue) h = HUES[(HUES.indexOf(h) + 1) % HUES.length];
            d = { h: h };
        }
        descCache.set(nbid, d);
        prevHue = d.h;
        return d;
    };
    for (let i = 0; i < valid.length; i++) {
        const li = valid[i];
        const nbid = nbOwnerOf(li);
        const cur = nbid ? descOf(nbid) : null;
        // 每行从所属笔记本统一写四变量（首子行同源同渲染）；s/l/a 仅自定义存在
        const st = li.style;
        setVar(st, "--nb-h", cur ? String(cur.h) : null);
        setVar(st, "--nb-s", cur && typeof cur.s === "number" ? String(Math.round(cur.s) / 100) : null);
        setVar(st, "--nb-l", cur && typeof cur.l === "number" ? String(Math.round(cur.l) + "%") : null);
        setVar(st, "--nb-a", cur && typeof cur.a === "number" ? String(Math.round(cur.a) / 100) : null);
        if (!li.hasAttribute("data-nb-walked")) li.setAttribute("data-nb-walked", "");
        // 块边界同样按归属判定（不再按"下一行是不是 root"）：块尾=下一行属不同
        // 笔记本；列表末行的归属可能还有未挂载的子行（虚拟化），子行不判块尾
        // （root 自成一块时除外——折叠笔记本）。
        const next = valid[i + 1];
        const nextNb = next ? nbOwnerOf(next) : null;
        const blockEnd = next ? (nextNb !== nbid) : isNb(li);
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

// 强制重扫（v0.7.13 刷新迟色回归修复）：onLayoutReady 必须再扫一次——
// onload 首扫时桌面 dock 未建（扫空），而 startWatchers 的 onMouseup 哨兵
// 让 onLayoutReady 的 startWatchers() 早退，面板建好后无人走查，
// 颜色只能等第一次 mouseup 才出现（"刷新后颜色加载很慢"根因）
export function rescan() { scan(true); }

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
