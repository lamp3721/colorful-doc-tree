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

    onunload() {
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
            "  background: oklch(" + this.cfg.light + "% " + this.cfg.chroma + " var(--nb-h, 231) / " + a + ");" +
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
            "  background: oklch(" + this.cfg.light + "% " + this.cfg.chroma + " var(--nb-h, 231));" +
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
        for (let i = 0; i < valid.length; i++) {
            const li = valid[i];
            if (isNb(li)) {
                // override 优先（v0.4.0）：手动指定的笔记本直接用；未指定走哈希+相邻防撞
                const nbId = li.getAttribute("data-node-id") || li.getAttribute("data-tree-key") || "";
                let h = this.cfg.overrides && Object.prototype.hasOwnProperty.call(this.cfg.overrides, nbId)
                    ? this.cfg.overrides[nbId]
                    : null;
                if (h === null || h === undefined) {
                    h = hashHue(li.getAttribute("data-tree-key") || "");
                    if (h === prevHue) h = HUES[(HUES.indexOf(h) + 1) % HUES.length];
                }
                hue = h;
                prevHue = h;
            }
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
            box.style.cssText = "width:280px";
            const head = document.createElement("div");
            head.className = "fn__flex";
            head.style.cssText = "justify-content:space-between;margin-bottom:4px;font-size:12px;opacity:.8";
            const name = document.createElement("span");
            name.textContent = label;
            const val = document.createElement("b");
            head.append(name, val);
            const sl = document.createElement("input");
            sl.className = "b3-slider";
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
        const setting = new siyuan.Setting({
            width: "520px",
            height: "auto",
            confirmCallback: () => { this.persist(); this.applyStyle(); },
        });
        const styleBox = document.createElement("div");
        const styleSel = document.createElement("select");
        styleSel.className = "b3-select";
        styleSel.style.width = "140px";
        [
            ["block", L.styleBlock || "整块背景"],
            ["bar", L.styleBar || "行首色条"],
        ].forEach(([v, label]) => {
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
        styleBox.append(styleSel);
        setting.addItem({ title: L.style || "渲染形态", actionElement: styleBox });
        // 面板独立开关（v0.4.0）：文档树 / 标签面板
        const mkToggle = (label, key, extra) => {
            const box = document.createElement("div");
            const swT = document.createElement("input");
            swT.className = "b3-switch";
            swT.type = "checkbox";
            swT.checked = this.cfg[key] !== false;
            swT.addEventListener("change", () => {
                this.cfg[key] = swT.checked;
                this.applyStyle();
                if (key === "tags" && swT.checked) this.scan(true);
                this.persistSoon();
            });
            box.append(swT);
            setting.addItem({ title: label, description: extra || "", actionElement: box });
            return box;
        };
        mkToggle(L.treeOn === undefined ? "文档树染色" : L.treeOn, "tree");
        // 笔记本颜色指定（v0.4.0）：override 表——内核 API 拉全部笔记本，
        // 每本一个色相下拉（含"自动"）；改完即时重走查
        const nbBox = document.createElement("div");
        nbBox.style.cssText = "display:flex;flex-direction:column;gap:4px;width:280px";
        fetch("/api/notebook/lsNotebooks", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
            .then((r) => r.json())
            .then((data) => {
                const notebooks = (data && data.data && data.data.notebooks) || [];
                if (!notebooks.length) {
                    nbBox.textContent = L.noNotebooks || "（未获取到笔记本）";
                    return;
                }
                notebooks.forEach((nb) => {
                    if (nb.closed) return;
                    const row = document.createElement("div");
                    row.style.cssText = "display:flex;justify-content:space-between;align-items:center";
                    const name = document.createElement("span");
                    name.style.cssText = "font-size:12px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
                    name.textContent = nb.name;
                    const sel = document.createElement("select");
                    sel.className = "b3-select";
                    sel.style.width = "110px";
                    const optAuto = document.createElement("option");
                    optAuto.value = "";
                    optAuto.textContent = L.auto || "自动（哈希）";
                    sel.append(optAuto);
                    HUES.forEach((h) => {
                        const o = document.createElement("option");
                        o.value = String(h);
                        o.textContent = HUE_NAMES[h] + " " + h + "°";
                        const cur = this.cfg.overrides && this.cfg.overrides[nb.id];
                        if (cur === h) o.selected = true;
                        sel.append(o);
                    });
                    if (!(this.cfg.overrides && this.cfg.overrides[nb.id])) optAuto.selected = true;
                    sel.addEventListener("change", () => {
                        if (sel.value === "") delete this.cfg.overrides[nb.id];
                        else this.cfg.overrides[nb.id] = parseInt(sel.value, 10);
                        this.persistSoon();
                        this.panelObservers.forEach((po) => this.walkWindow(po.panel));
                    });
                    row.append(name, sel);
                    nbBox.append(row);
                });
            })
            .catch(() => { nbBox.textContent = L.noNotebooks || "（未获取到笔记本）"; });
        setting.addItem({ title: L.nbColors || "笔记本颜色", description: L.nbColorsDesc || "手动指定优先，未指定的自动分配", actionElement: nbBox });
        const swBox = document.createElement("div");
        const sw = document.createElement("input");
        sw.className = "b3-switch";
        sw.type = "checkbox";
        sw.checked = this.cfg.enabled;
        sw.addEventListener("change", () => {
            const wasOn = this.cfg.enabled;
            this.cfg.enabled = sw.checked;
            this.persistSoon();
            this.applyStyle();
            if (this.cfg.enabled && !wasOn) this.startWatchers();
            if (!this.cfg.enabled && wasOn) { this.stopWatchers(); this.clearMarks(); }
        });
        swBox.append(sw);
        setting.addItem({ title: L.enabled || "启用彩色背景", actionElement: swBox });
        setting.addItem({
            title: L.alpha || "染色浓度",
            actionElement: mkSlider(L.alpha || "染色浓度", "alpha", 5, 40,
                () => Math.round(this.cfg.alpha * 100),
                (v) => { this.cfg.alpha = v / 100; },
                (v) => v + "%"),
        });
        setting.addItem({
            title: L.chroma || "饱和度",
            actionElement: mkSlider(L.chroma || "饱和度", "chroma", 0, 20,
                () => Math.round(this.cfg.chroma * 100),
                (v) => { this.cfg.chroma = v / 100; },
                (v) => v + "%"),
        });
        setting.addItem({
            title: L.light || "明度",
            actionElement: mkSlider(L.light || "明度", "light", 40, 80,
                () => this.cfg.light,
                (v) => { this.cfg.light = v; },
                (v) => v + "%"),
        });
        // 预设：柔和 / 鲜明（点击即三参生效，滑条状态由 confirmCallback 后重开同步）
        const pBox = document.createElement("div");
        const mkPreset = (key, label) => {
            const b = document.createElement("button");
            b.className = "b3-button b3-button--outline";
            b.style.marginRight = "8px";
            b.textContent = label;
            b.onclick = () => {
                Object.assign(this.cfg, PRESETS[key] || {});
                this.applyStyle();
                this.persistSoon();
            };
            return b;
        };
        pBox.append(mkPreset("soft", "柔和"), mkPreset("vivid", "鲜明"));
        setting.addItem({ title: "预设", actionElement: pBox });
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
        clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => this.persist(), 300);
    }
}

module.exports = ColorfulDocTree;
