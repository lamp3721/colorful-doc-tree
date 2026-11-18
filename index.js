/**
 * 彩色文档树 —— 按笔记本一色给文档树染底 + 标签面板按名染色
 *
 * v0.1.1 色彩调优：染底公式 62%/0.12（暗底明快不闷）；调色板避开浑浊区；
 * 相邻防撞（哈希撞邻块色相顺移一档——相邻块同色会失去分界意义）
 *
 * 机制（与主题版同构，独立零依赖）：
 *   · 面板级 MutationObserver 跟踪 .file-tree（文档树是虚拟化 DOM，
 *     行随滚动/开合变化）——走查给每行打 --nb-h 色相：
 *     文档树 = notebook 行 data-tree-key 哈希定色、子行继承到下一笔记本行；
 *     标签面板 = 标签名哈希。
 *   · CSS ::after 低透明叠层染底（isolation 隔离在行内），块首/末圆角、
 *     块间留缝——同一笔记本连成一整块。文字/图标一律不动。
 *
 * 回环防护：走查写行 style 会触发 observer（filter 含 style）——
 *   走查窗口 disconnect→walk→re-observe 根治（甄别法全败，勿再试）。
 * 边界纪律：只观察面板容器，绝不进编辑器内容区（.protyle-wysiwyg）。
 *
 * 入口：装上即生效（默认开）。命令面板两条：切换 / 设置
 * （启用开关 + 浓度/饱和/明度三滑条实时预览 + 柔和/鲜明预设，防抖持久化）。
 */
const siyuan = require("siyuan");

const STYLE_ID = "colorful-doc-tree-style";
const CFG_KEY = "config.json";
// 10 档色相调色板（暗亮主题通用：染底是低透明叠层）——
// v0.1.1 调优：避开暗底下浑浊的色相区（原 20 橙棕/325 品红偏闷），
// 十档在明度感知上尽量均匀（黄绿区密集是感知特性）
const HUES = [15, 45, 90, 140, 170, 200, 230, 262, 298, 335];
const DEFAULTS = { enabled: true, alpha: 0.14, chroma: 0.12, light: 62, style: "block", tree: true };
// overrides：笔记本 id → 色相数字（HUES 档位）——手动指定优先于哈希；
// 哈希管"默认好看"，override 管"我就要这个色"
// HSL ↔ HEX 工具（v0.4.4 自定义色板）
function hslToHex(h, s, l) {
    const a = s * Math.min(l, 1 - l);
    const f = (n) => { const k = (n + h / 30) % 12; const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(255 * c).toString(16).padStart(2, "0"); };
    return "#" + f(0) + f(8) + f(4);
}
function hexToHsl(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (mx + mn) / 2;
    if (mx !== mn) {
        const d = mx - mn;
        s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
        if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
        else if (mx === g) h = ((b - r) / d + 2);
        else h = ((r - g) / d + 4);
        h *= 60;
    }
    return { h: h < 0 ? h + 360 : h, ss: s, ll: l };
}
const HUE_NAMES = { 15: "橙", 45: "黄", 90: "黄绿", 140: "绿", 170: "青绿", 200: "青", 230: "蓝", 262: "靛", 298: "紫", 335: "玫红" };
// 预设：柔和（低饱和淡染）/ 鲜明（高饱和浓染）
const PRESETS = { soft: { alpha: 0.12, chroma: 0.08, light: 64 }, vivid: { alpha: 0.24, chroma: 0.15, light: 60 } };

function hashHue(key) {
    let h = 5381;
    for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) >>> 0;
    // 雪崩混合（djb2 直取模混合不足）；注意位运算产带符号数，取模前归无符号
    h ^= h >>> 16; h = (h * 0x7feb352d) >>> 0;
    h ^= h >>> 15; h = (h * 0x846ca68b) >>> 0;
    h ^= h >>> 16;
    return HUES[(h >>> 0) % HUES.length];
}

class ColorfulDocTree extends siyuan.Plugin {
    constructor(options) {
        super(options);
        this.cfg = Object.assign({}, DEFAULTS);
        this.panelObservers = [];
        this.dockObserver = null;
        this._onMouseup = null;
        this._lastScan = 0;
    }

    async onload() {
        try {
            const saved = await this.loadData(CFG_KEY);
            if (saved && typeof saved === "object") Object.assign(this.cfg, saved);
        } catch (e) {}
        if (typeof this.cfg.overrides !== "object" || this.cfg.overrides === null) this.cfg.overrides = {};
        this.applyStyle();
        if (this.cfg.enabled) this.startWatchers();
        this.addCommand({ command: "toggle", hotkey: "", callback: () => this.toggle() });
        this.addCommand({ command: "settings", hotkey: "", callback: () => this.openSettings() });
        this.buildSetting();
    }

    // 覆写即免重载（plugin/lifecycle.ts:469——未覆写时 data change 任务原位
    // 提升为 reload）。本实例内存 cfg 即权威，自身写入无需回读；跨实例变更
    // 极罕见，接受重开面板时读到新值
    onDataChanged() {}

    onunload() {
        if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = 0; }
        this.persist();
        this.stopWatchers();
        const style = document.getElementById(STYLE_ID);
        if (style) style.remove();
        delete document.documentElement.dataset.cftree;
        delete document.documentElement.dataset.cftreestyle;
        this.clearMarks();
    }

    // ---- 配置与样式 ----

    persist() { this.saveData(CFG_KEY, this.cfg); }

    applyStyle() {
        let el = document.getElementById(STYLE_ID);
        if (!el) {
            el = document.createElement("style");
            el.id = STYLE_ID;
            document.head.appendChild(el);
        }
        document.documentElement.dataset.cftree = this.cfg.enabled ? "on" : "off";
        document.documentElement.dataset.cftreestyle = this.cfg.style === "bar" ? "bar" : "block";
        const a = this.cfg.alpha;
        // 与主题版同款公式：oklch 固定亮度饱和度只变色相；
        // 行自建层叠上下文（isolation）防染层穿到面板背景后（z-index:-1）
        el.textContent =
            'html[data-cftree="on"] .file-tree .b3-list-item[data-nb-walked] {' +
            "  position: relative; isolation: isolate;" +
            "}\n" +
            // —— 形态一：整块背景（跨行距缝 + 块首/末圆角 + 块间留缝）——
            'html[data-cftree="on"][data-cftreestyle="block"] .file-tree.sy__file .b3-list-item[data-nb-walked]::after {' +
            '  content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none;' +
            "  background: oklch(var(--nb-l, " + this.cfg.light + "%) var(--nb-s, " + this.cfg.chroma + ") var(--nb-h, 231) / var(--nb-a, " + a + "));" +
            "}\n" +
            'html[data-cftree="on"][data-cftreestyle="block"] .file-tree.sy__file .b3-list-item[data-nb-walked]::after {' +
            "  inset-block: -1px;" +
            "}\n" +
            'html[data-cftree="on"][data-cftreestyle="block"] .file-tree.sy__file .b3-list-item[data-nb-block-start]::after {' +
            "  top: 3px; border-top-left-radius: 6px; border-top-right-radius: 6px;" +
            "}\n" +
            'html[data-cftree="on"][data-cftreestyle="block"] .file-tree.sy__file .b3-list-item[data-nb-block-end]::after {' +
            "  bottom: 3px; border-bottom-left-radius: 6px; border-bottom-right-radius: 6px;" +
            "}\n" +
            // —— 形态二：行首色条（3px 竖线，同笔记本连续成轨、块间留缝；
            //     细条不吃浓度透明度——低 alpha 下不可见，直接实色，明度/饱和仍可调）——
            //     端头圆角策略（v0.3.2）：整条轨道只有两个真正端点（块首顶/块末底）
            //     做圆角——且只做外端单侧 1.5px（3px 条的双侧全圆角占宽 2/3，观感成
            //     "半圆帽"；v0.3.1 的全方角又显断口生硬）。块内接缝保持方正 -1px
            //     叠接（连续轨道感），中段行零圆角——圆角只在轨道尽头出现
            'html[data-cftree="on"][data-cftreestyle="bar"] .file-tree .b3-list-item[data-nb-walked]::after {' +
            '  content: ""; position: absolute; z-index: -1; pointer-events: none;' +
            "  width: 3px; inset-inline: 0 auto; inset-block: -1px;" +
            "  background: oklch(var(--nb-l, " + this.cfg.light + "%) var(--nb-s, " + this.cfg.chroma + ") var(--nb-h, 231));" +
            "}\n" +
            // 轨道顶点（块首行）：上端外圆角——顶左角收，顶右角保持直边贴行首
            'html[data-cftree="on"][data-cftreestyle="bar"] .file-tree .b3-list-item[data-nb-block-start]::after {' +
            "  top: 3px; border-top-left-radius: 1.5px; border-top-right-radius: 1.5px;" +
            "}\n" +
            'html[data-cftree="on"][data-cftreestyle="bar"] .file-tree .b3-list-item[data-nb-block-end]::after {' +
            "  bottom: 3px; border-bottom-left-radius: 1.5px; border-bottom-right-radius: 1.5px;" +
            "}";
    }

    toggle() {
        this.cfg.enabled = !this.cfg.enabled;
        this.persist();
        this.applyStyle();
        if (this.cfg.enabled) this.startWatchers();
        else { this.stopWatchers(); this.clearMarks(); }
    }

    // ---- 观察 ----

    startWatchers() {
        if (this._onMouseup) return;
        this._onMouseup = () => this.scan();
        document.addEventListener("mouseup", this._onMouseup);
        const cfg = { childList: true, subtree: true, attributeFilter: ["style", "class", "data-type"] };
        this._obsCfg = cfg;
        if (!this.dockObserver) {
            this.dockObserver = new MutationObserver(() => this.scan());
            ["dockLeft", "dockRight"].forEach((id) => {
                const dock = document.getElementById(id);
                if (dock) this.dockObserver.observe(dock, { childList: true });
            });
        }
        // 重新启用必须立即挂载——scan 的 2s 节流是给 mouseup 发现路径的，
        // 不放行会把重开后的染色拖到 2s 后的鼠标事件（v0.1.0 实测 bug）
        this.scan(true);
    }

    stopWatchers() {
        if (this._onMouseup) { document.removeEventListener("mouseup", this._onMouseup); this._onMouseup = null; }
        if (this.dockObserver) { this.dockObserver.disconnect(); this.dockObserver = null; }
        this.panelObservers.forEach((po) => po.obs.disconnect());
        this.panelObservers = [];
        document.querySelectorAll("[data-nb-obs]").forEach((p) => p.removeAttribute("data-nb-obs"));
    }

    scan(force) {
        if (!force && Date.now() - this._lastScan < 2000) return;
        this._lastScan = Date.now();
        const panels = document.querySelectorAll(".file-tree.sy__file");
        panels.forEach((p) => this.attach(p));
    }

    attach(panel) {
        if (panel.hasAttribute("data-nb-obs")) return;
        panel.setAttribute("data-nb-obs", "1");
        const po = { panel, obs: null };
        po.obs = new MutationObserver(() => this.walkWindow(panel));
        po.obs.observe(panel, this._obsCfg);
        this.panelObservers.push(po);
        this.walkWindow(panel);
    }

    // 走查窗口（回环根治）：disconnect → walk → finally re-observe
    walkWindow(panel) {
        const po = this.panelObservers.find((o) => o.panel === panel);
        if (!po) { this.walk(panel); return; }
        po.obs.disconnect();
        try { this.walk(panel); } finally { po.obs.observe(panel, this._obsCfg); }
    }

    walk(panel) {
        // v0.4.1 起只做文档树（用户定调：插件专注于文档树，不做标签面板染色）
        if (panel.classList.contains("sy__file")) this.walkTree(panel);
    }

    walkTree(panel) {
        const rows = Array.prototype.slice.call(panel.querySelectorAll("li[aria-level]"));
        const valid = rows.filter((li) => !li.closest(".file-tree__pins") &&
            parseInt(li.getAttribute("aria-level"), 10) >= 1);
        let hue;
        const isNb = (li) => {
            const dt = li.getAttribute("data-type");
            return dt === "navigation-root" || dt === "navigation-closed";
        };
        let prevHue = -1;
        let cur = null;   // 当前笔记本的完整色描述 {h, s?, l?}（v0.4.7：s/l 随笔记本传递）
        for (let i = 0; i < valid.length; i++) {
            const li = valid[i];
            if (isNb(li)) {
                // override 优先（v0.4.0；v0.4.4 值域升级为 HSL 对象）：
                // 手动指定的笔记本直接用；未指定走哈希+相邻防撞。
                // override 可带自定义明度/饱和（{h,s,l}），只填 h 时沿用全局滑条
                // 笔记本稳定键（v0.4.6 事故修复）：notebook 根行 data-node-id 为空串
                // （row.ts:39 nodeID = root && !boxDoc ? "" : item.id），occurrenceKey
                // 含路径不稳定。notebook 行的 data-tree-key 恒为 "notebook:<笔记本ID>"
                // （rowData.ts:20），剥前缀即 lsNotebooks 的 nb.id——与设置面板
                // override 的键同源
                const rawKey = li.getAttribute("data-tree-key") || "";
                const nbId = rawKey.startsWith("notebook:") ? rawKey.slice(9) : rawKey;
                const ov = this.cfg.overrides && Object.prototype.hasOwnProperty.call(this.cfg.overrides, nbId)
                    ? this.cfg.overrides[nbId] : null;
                let h;
                if (ov) {
                    cur = typeof ov === "number" ? { h: ov } : ov;
                } else {
                    cur = { h: hashHue(li.getAttribute("data-tree-key") || "") };
                    if (cur.h === prevHue) cur.h = HUES[(HUES.indexOf(cur.h) + 1) % HUES.length];
                }
                hue = cur.h;
                prevHue = cur.h;
            }

            // 每行从 cur 统一写三变量（v0.4.7 修复"notebook 行与子行颜色不一致"：
            // 旧版 s/l 只写 notebook 行自己、子行零继承，色板自定义色下首行
            // 与内容行必然两色）。s/l 仅在自定义存在时写——缺席即公式回退全局
            if (cur && typeof cur.s === "number") li.style.setProperty("--nb-s", String(Math.round(cur.s) / 100));
            else li.style.removeProperty("--nb-s");
            if (cur && typeof cur.l === "number") li.style.setProperty("--nb-l", String(Math.round(cur.l) + "%"));
            else li.style.removeProperty("--nb-l");
            // v0.4.8：色板自定义色自带透明度（所见即所得，不吃全局浓度稀释）；
            // 自动/快捷色缺席 → 回退全局 alpha
            if (cur && typeof cur.a === "number") li.style.setProperty("--nb-a", String(Math.round(cur.a) / 100));
            else li.style.removeProperty("--nb-a");
            this.setHue(li, hue);
            // 块边界：首=notebook 行；末=下一有效行是 notebook 行或走到尾
            const blockEnd = i + 1 >= valid.length || isNb(valid[i + 1]);
            this.setAttr(li, "data-nb-block-start", isNb(li));
            this.setAttr(li, "data-nb-block-end", blockEnd);
        }
    }

    setHue(li, hue) {
        const st = li.style;
        if (hue === undefined || hue === null) {
            if (st.getPropertyValue("--nb-h")) st.removeProperty("--nb-h");
        } else if (st.getPropertyValue("--nb-h") !== String(hue)) {
            st.setProperty("--nb-h", String(hue));
        }
        if (!li.hasAttribute("data-nb-walked")) li.setAttribute("data-nb-walked", "");
    }

    setAttr(li, name, on) {
        if (on && !li.hasAttribute(name)) li.setAttribute(name, "");
        else if (!on && li.hasAttribute(name)) li.removeAttribute(name);
    }

    clearMarks() {
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

    // ---- 设置 ----

    /**
     * 官方设置入口（v0.2.1）：this.setting 存在 ⇒ 思源在
     * 设置 → 集市 → 已下载 → 插件 列表里显示齿轮图标，点击即 open()。
     * 项由 addItem 提供（title + 自建 actionElement），确认时 confirmCallback
     * 落盘。命令面板的 settings 命令同走这里。
     */
    buildSetting() {
        const L = this.i18n || {};
        const mkSlider = (label, key, min, max, getVal, setVal, fmt) => {
            const box = document.createElement("div");
            box.style.cssText = "margin:6px 0";
            const head = document.createElement("div");
            head.className = "fn__flex";
            head.style.cssText = "justify-content:space-between;margin-bottom:2px;font-size:12px";
            const name = document.createElement("span");
            name.textContent = label;
            const val = document.createElement("b");
            head.append(name, val);
            const sl = document.createElement("input");
            sl.className = "b3-slider";
            sl.dataset.key = key;
            sl.type = "range";
            sl.min = String(min);
            sl.max = String(max);
            sl.step = "1";
            sl.style.width = "100%";
            const refresh = () => { val.textContent = fmt(getVal()); sl.value = String(getVal()); };
            sl.addEventListener("input", () => {
                setVal(parseInt(sl.value, 10));
                refresh();
                if (this.cfg.enabled) this.applyStyle();
                this.persistSoon();
            });
            refresh();
            box.append(head, sl);
            return box;
        };
        const mkToggle = (label, key) => {
            const row = document.createElement("div");
            row.className = "fn__flex";
            row.style.cssText = "justify-content:space-between;align-items:center;margin:6px 0";
            const name = document.createElement("span");
            name.textContent = label;
            const swT = document.createElement("input");
            swT.className = "b3-switch";
            swT.type = "checkbox";
            swT.checked = this.cfg[key] !== false;
            swT.addEventListener("change", () => {
                this.cfg[key] = swT.checked;
                this.applyStyle();
                this.persistSoon();
            });
            row.append(name, swT);
            return row;
        };
        // 折叠分组（v0.4.2）：官方 addItem 会给 actionElement 强加居中定宽类，
        // 长列表/多控件被压成一坨——整面板走单个 row 项挂全宽容器，
        // 内部用 <details> 自绘可折叠分组
        const container = document.createElement("div");
        container.style.cssText = "width:100%";
        const mkGroup = (title, open) => {
            const det = document.createElement("details");
            det.open = open !== false;
            det.style.marginBottom = "8px";
            const sum = document.createElement("summary");
            sum.textContent = title;
            sum.style.cssText = "cursor:pointer;font-weight:600;padding:6px 0;border-bottom:1px solid var(--b3-border-color);user-select:none";
            const body = document.createElement("div");
            body.style.paddingTop = "4px";
            det.append(sum, body);
            container.append(det);
            return body;
        };
        // ── 分组一：基础 ──
        const gBase = mkGroup(L.gBasic || "基础", true);
        gBase.append(mkToggle(L.enabled || "启用彩色背景", "enabled"));
        const styleRow = document.createElement("div");
        styleRow.className = "fn__flex";
        styleRow.style.cssText = "justify-content:space-between;align-items:center;margin:6px 0";
        const styleName = document.createElement("span");
        styleName.textContent = L.style || "渲染形态";
        const styleSel = document.createElement("select");
        styleSel.className = "b3-select";
        styleSel.style.width = "140px";
        [["block", L.styleBlock || "整块背景"], ["bar", L.styleBar || "行首色条"]].forEach(([v, label]) => {
            const opt = document.createElement("option");
            opt.value = v;
            opt.textContent = label;
            if (this.cfg.style === v) opt.selected = true;
            styleSel.append(opt);
        });
        styleSel.addEventListener("change", () => {
            this.cfg.style = styleSel.value;
            if (this.cfg.enabled) this.applyStyle();
            this.persistSoon();
        });
        styleRow.append(styleName, styleSel);
        gBase.append(styleRow);
        gBase.append(mkToggle(L.treeOn || "文档树染色", "tree"));
        // ── 分组二：颜色调整 ──
        const gColor = mkGroup(L.gColor || "颜色调整", true);
        gColor.append(mkSlider(L.alpha || "染色浓度", "alpha", 5, 40, () => Math.round(this.cfg.alpha * 100), (v) => { this.cfg.alpha = v / 100; }, (v) => v + "%"));
        gColor.append(mkSlider(L.chroma || "饱和度", "chroma", 0, 20, () => Math.round(this.cfg.chroma * 100), (v) => { this.cfg.chroma = v / 100; }, (v) => v + "%"));
        gColor.append(mkSlider(L.light || "明度", "light", 40, 80, () => this.cfg.light, (v) => { this.cfg.light = v; }, (v) => v + "%"));
        const pRow = document.createElement("div");
        pRow.style.marginTop = "10px";
        const pName = document.createElement("span");
        pName.textContent = (L.preset || "预设") + "：";
        pName.style.fontSize = "12px";
        pRow.append(pName);
        [["soft", "柔和"], ["vivid", "鲜明"]].forEach(([key, label]) => {
            const b = document.createElement("button");
            b.className = "b3-button b3-button--outline";
            b.style.marginLeft = "8px";
            b.textContent = label;
            b.onclick = () => {
                Object.assign(this.cfg, PRESETS[key] || {});
                this.applyStyle();
                this.persistSoon();
                // 刷新三个滑条：先写新 value 再触发 input（handler 读 value 同步标签）
                ["alpha", "chroma", "light"].forEach((k) => {
                    const sl = gColor.querySelector('[data-key="' + k + '"]');
                    if (!sl) return;
                    sl.value = String(k === "alpha" ? Math.round(this.cfg.alpha * 100)
                        : k === "chroma" ? Math.round(this.cfg.chroma * 100) : this.cfg.light);
                    sl.dispatchEvent(new Event("input"));
                });
            };
            pRow.append(b);
        });
        gColor.append(pRow);
        // ── 分组三：笔记本颜色 ──
        const gNb = mkGroup((L.nbColors || "笔记本颜色") + "（" + (L.nbColorsDesc || "手动优先，其余自动") + "）", true);
        const nbBox = document.createElement("div");
        // 列表内部滚动上限（v0.4.3）：笔记本多时不许顶高面板——
        // max-height 12 行（每行 26px 出头）+ 内部滚动；分组外的整体
        // 70vh 上限仍兜底（设置→打开的面板本身）
        nbBox.style.cssText = "display:flex;flex-direction:column;gap:4px;max-height:288px;overflow-y:auto";
        gNb.append(nbBox);
        fetch("/api/notebook/lsNotebooks", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
            .then((r) => r.json())
            .then((data) => {
                const notebooks = (data && data.data && data.data.notebooks) || [];
                if (!notebooks.length) { nbBox.textContent = L.noNotebooks || "（未获取到笔记本）"; return; }
                notebooks.forEach((nb) => {
                    if (nb.closed) return;
                    const row = document.createElement("div");
                    row.style.cssText = "display:flex;justify-content:space-between;align-items:center";
                    const name = document.createElement("span");
                    name.style.cssText = "font-size:12px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
                    name.textContent = nb.name;
                    // v0.4.4：任意颜色——原生色板 + 十档快捷色 + 自动。
                    // 存 HSL（{h,s,l}）：色板挑的色完整还原；十档快捷色只存 {h}
                    // （s/l 走全局滑条，跟整体风格协调）
                    const ctrl = document.createElement("div");
                    ctrl.style.cssText = "display:flex;align-items:center;gap:4px";
                    const swatch = document.createElement("input");
                    swatch.type = "color";
                    swatch.className = "b3-color-picker";
                    swatch.style.cssText = "width:26px;height:22px;padding:0;border:1px solid var(--b3-border-color);background:transparent;cursor:pointer";
                    const quick = document.createElement("select");
                    quick.className = "b3-select";
                    quick.style.cssText = "width:90px;font-size:12px";
                    const optAuto = document.createElement("option");
                    optAuto.value = "";
                    optAuto.textContent = L.auto || "自动";
                    quick.append(optAuto);
                    HUES.forEach((h) => {
                        const o = document.createElement("option");
                        o.value = String(h);
                        o.textContent = HUE_NAMES[h];
                        quick.append(o);
                    });
                    const cur = this.cfg.overrides && this.cfg.overrides[nb.id];
                    const hslOf = (o) => typeof o === "number" ? { h: o } : (o || null);
                    const applyOverride = (val) => {
                        if (val === null) delete this.cfg.overrides[nb.id];
                        else this.cfg.overrides[nb.id] = val;
                        this.persistSoon();
                        this.panelObservers.forEach((po) => this.walkWindow(po.panel));
                    };
                    const syncUI = () => {
                        const c = hslOf(this.cfg.overrides && this.cfg.overrides[nb.id]);
                        // 快捷下拉只在"纯色相 override"（十档色）时显示选中；色板值以 swatch 呈现
                        quick.value = (c && typeof c === "object" && c.h !== undefined && c.s === undefined) ? String(c.h) : "";
                        // swatch 初值：override 的 HSL → hex；无 override 显示全局公式色
                        const hh = c ? c.h : hashHue(nb.id);
                        const ss = c && c.s !== undefined ? c.s : Math.round(this.cfg.chroma * 100);
                        const ll = c && c.l !== undefined ? c.l : this.cfg.light;
                        swatch.value = hslToHex(hh, ss / 100, ll / 100);
                    };
                    quick.addEventListener("change", () => {
                        if (quick.value === "") applyOverride(null);
                        else applyOverride({ h: parseInt(quick.value, 10) });
                        syncUI();
                    });
                    swatch.addEventListener("input", () => {
                        const { h, ss, ll } = hexToHsl(swatch.value);
                        // a=1：自定义色所见即所得（v0.4.8 用户反馈"纯红变粉"——
                        // 全局 14% 透明度稀释了色板色，违背"我就要这个色"的语义）
                        applyOverride({ h: Math.round(h), s: Math.round(ss * 100), l: Math.round(ll * 100), a: 100 });
                        syncUI();
                        syncCustomPanel();
                    });
                    // v0.4.11：自定义色专属参数区可折叠——点条目行切换展开/收起
                    // （v0.4.9 是选色即常驻展开，用户要能收起）。仅自定义色时可折，
                    // 快捷色/自动时整体隐藏。结构：wrap=row(可点)+paramBox(显隐由折叠态定)
                    const folded = { on: false };
                    const customBox = document.createElement("div");
                    customBox.style.cssText = "display:none;padding:2px 0 6px 0;margin-top:2px;border-top:1px dashed var(--b3-border-color)";
                    const mkNbSlider = (label, key, min, max, getVal, setVal, fmt) => {
                        const box = document.createElement("div");
                        box.style.cssText = "display:flex;align-items:center;gap:6px;margin:3px 0";
                        const nm = document.createElement("span");
                        nm.style.cssText = "font-size:12px;width:56px;flex-shrink:0;opacity:.8";
                        nm.textContent = label;
                        const sl = document.createElement("input");
                        sl.type = "range";
                        sl.className = "b3-slider";
                        sl.min = String(min);
                        sl.max = String(max);
                        sl.style.flex = "1";
                        const vb = document.createElement("b");
                        vb.style.cssText = "font-size:12px;width:38px;text-align:right";
                        const refresh = () => { const v = getVal(); sl.value = String(v); vb.textContent = fmt(v); };
                        sl.addEventListener("input", () => {
                            setVal(parseInt(sl.value, 10));
                            vb.textContent = fmt(parseInt(sl.value, 10));
                            this.persistSoon();
                            this.panelObservers.forEach((po) => this.walkWindow(po.panel));
                        });
                        refresh();
                        box.append(nm, sl, vb);
                        return box;
                    };
                    const curOv = () => {
                        const o = this.cfg.overrides && this.cfg.overrides[nb.id];
                        if (!o || typeof o === "number" || typeof o.s !== "number") return null;
                        return o;
                    };
                    const sAlpha = mkNbSlider(L.alpha || "浓度", "alpha", 5, 100,
                        () => { const o = curOv(); return o && typeof o.a === "number" ? o.a : 100; },
                        (v) => { const o = curOv(); if (o) o.a = v; },
                        (v) => v + "%");
                    const sChroma = mkNbSlider(L.chroma || "饱和", "chroma", 0, 100,
                        () => { const o = curOv(); return o ? o.s : 0; },
                        (v) => { const o = curOv(); if (o) o.s = v; },
                        (v) => v + "%");
                    const sLight = mkNbSlider(L.light || "明度", "light", 20, 90,
                        () => { const o = curOv(); return o ? o.l : 62; },
                        (v) => { const o = curOv(); if (o) o.l = v; },
                        (v) => v + "%");
                    customBox.append(sAlpha, sChroma, sLight);
                    const syncCustomPanel = () => {
                        const o = curOv();
                        // 无自定义色：参数区整体隐藏、折叠态复位；
                        // 有：可折叠——folded.on 时收起（条目行仍可点开）
                        customBox.style.display = (o && !folded.on) ? "block" : "none";
                        if (o && !folded.on) {
                            [sAlpha, sChroma, sLight].forEach((slBox) => {
                                const sl = slBox.querySelector("input");
                                sl.dispatchEvent(new Event("input"));
                            });
                        }
                    };
                    // 点条目行（名字区）切换折叠——有自定义色才响应；
                    // 控件点击不冒泡误触发（select/swatch 上 stopPropagation）
                    row.addEventListener("click", (ev) => {
                        if (!curOv()) return;
                        if (ev.target.closest("select, input")) return;
                        folded.on = !folded.on;
                        customBox.style.display = folded.on ? "none" : "block";
                    });
                    syncUI();
                    syncCustomPanel();
                    quick.addEventListener("change", () => { setTimeout(syncCustomPanel, 0); });
                    // 可折叠视觉暗示：有自定义色时条目名前加 ▸/▾
                    const syncFoldMark = () => {
                        name.textContent = (curOv() ? (folded.on ? "▸ " : "▾ ") : "") + nb.name;
                    };
                    row.addEventListener("click", () => setTimeout(syncFoldMark, 0));
                    syncFoldMark();
                    ctrl.append(quick, swatch);
                    row.append(name, ctrl);
                    const wrap = document.createElement("div");
                    wrap.append(row, customBox);
                    nbBox.append(wrap);
                });
            })
            .catch(() => { nbBox.textContent = L.noNotebooks || "（未获取到笔记本）"; });
        // 官方 Setting：单 row 项挂全宽容器（fn__block 不受 fn__size200 定宽挤压）
        const setting = new siyuan.Setting({ width: "560px", height: "auto" });
        setting.addItem({ title: "", direction: "row", actionElement: container });
        this.setting = setting;
    }

    openSettings() {
        if (!this.setting) return;
        this.setting.open(this.displayName || this.name);
        // v0.4.1：内容超出窗口高度时可滚动（笔记本多时列表很长）——
        // Setting 构造的 height:"auto" 不限高，超过视口就溢出且不可滚
        const dlg = this.setting.dialog;
        const content = dlg && dlg.element ? dlg.element.querySelector(".b3-dialog__content") : null;
        if (content) content.style.maxHeight = "70vh";
    }

    persistSoon() {
        // 1500ms 防抖（v0.4.10：300ms 时拖滑条 = 连续落盘 = 连续 data change）；
        // onunload 时 persist 兜底 flush
        clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => this.persist(), 1500);
    }
}

module.exports = ColorfulDocTree;
