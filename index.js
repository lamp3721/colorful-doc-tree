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
const DEFAULTS = { enabled: true, alpha: 0.14, chroma: 0.12, light: 62 };
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
        this.applyStyle();
        if (this.cfg.enabled) this.startWatchers();
        this.addCommand({ command: "toggle", hotkey: "", callback: () => this.toggle() });
        this.addCommand({ command: "settings", hotkey: "", callback: () => this.openSettings() });
    }

    onunload() {
        this.stopWatchers();
        const style = document.getElementById(STYLE_ID);
        if (style) style.remove();
        delete document.documentElement.dataset.cftree;
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
        const a = this.cfg.alpha;
        // 与主题版同款公式：oklch 固定亮度饱和度只变色相；
        // 行自建层叠上下文（isolation）防染层穿到面板背景后（z-index:-1）
        el.textContent =
            'html[data-cftree="on"] .file-tree .b3-list-item[data-nb-walked] {' +
            "  position: relative; isolation: isolate;" +
            "}\n" +
            'html[data-cftree="on"] .file-tree.sy__file .b3-list-item[data-nb-walked]::after,' +
            'html[data-cftree="on"] .file-tree.sy__tag .b3-list-item[data-nb-walked]::after {' +
            '  content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none;' +
            "  background: oklch(" + this.cfg.light + "% " + this.cfg.chroma + " var(--nb-h, 231) / " + a + ");" +
            "}\n" +
            // 文档树：整块连续（跨行距缝）+ 块首/末圆角 + 块间留缝
            'html[data-cftree="on"] .file-tree.sy__file .b3-list-item[data-nb-walked]::after {' +
            "  inset-block: -1px;" +
            "}\n" +
            'html[data-cftree="on"] .file-tree.sy__file .b3-list-item[data-nb-block-start]::after {' +
            "  top: 3px; border-top-left-radius: 6px; border-top-right-radius: 6px;" +
            "}\n" +
            'html[data-cftree="on"] .file-tree.sy__file .b3-list-item[data-nb-block-end]::after {' +
            "  bottom: 3px; border-bottom-left-radius: 6px; border-bottom-right-radius: 6px;" +
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
        const panels = document.querySelectorAll(".file-tree.sy__file, .file-tree.sy__tag");
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
        if (panel.classList.contains("sy__file")) this.walkTree(panel);
        else if (panel.classList.contains("sy__tag")) this.walkTags(panel);
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
                let h = hashHue(li.getAttribute("data-tree-key") || "");
                // 相邻防撞（v0.1.1）：哈希撞上前一个笔记本的色相 → 顺移一档
                if (h === prevHue) h = HUES[(HUES.indexOf(h) + 1) % HUES.length];
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

    walkTags(panel) {
        let prevHue = -1;
        panel.querySelectorAll("li.b3-list-item").forEach((li) => {
            const name = (li.querySelector(".b3-list-item__text") || li).textContent || "";
            let h = hashHue(name);
            if (h === prevHue) h = HUES[(HUES.indexOf(h) + 1) % HUES.length];
            prevHue = h;
            this.setHue(li, h);
            this.setAttr(li, "data-nb-block-start", false);
            this.setAttr(li, "data-nb-block-end", false);
        });
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

    // ---- 设置对话框 ----

    openSettings() {
        const L = this.i18n || {};
        const slide = (label, key, min, max, val, unit) =>
            '<div style="margin-bottom:14px">' +
                '<div class="fn__flex" style="justify-content:space-between;margin-bottom:4px">' +
                    '<span>' + label + '</span><b data-val="' + key + '">' + val + unit + "</b>" +
                "</div>" +
                '<input class="b3-slider" type="range" min="' + min + '" max="' + max + '" step="1"' +
                    ' style="width:100%" value="' + val + '" data-slider="' + key + '" data-unit="' + unit + '">' +
            "</div>";
        const preset = (key, label) =>
            '<button class="b3-button b3-button--outline" style="margin-right:8px" data-preset="' + key + '">' + label + "</button>";
        const dialog = new siyuan.Dialog({
            title: L.settings || "彩色文档树设置",
            content:
                '<div style="padding:16px">' +
                '<label class="fn__flex" style="align-items:center;justify-content:space-between;margin-bottom:16px">' +
                    '<span>' + (L.enabled || "启用彩色背景") + '</span>' +
                    '<input class="b3-switch" type="checkbox"' + (this.cfg.enabled ? " checked" : "") + ' data-cfg="enabled">' +
                "</label>" +
                slide(L.alpha || "染色浓度", "alpha", 5, 40, Math.round(this.cfg.alpha * 100), "%") +
                slide(L.chroma || "饱和度", "chroma", 0, 20, Math.round(this.cfg.chroma * 100), "%") +
                slide(L.light || "明度", "light", 40, 80, this.cfg.light, "%") +
                '<div style="margin-bottom:8px">预设：' + preset("soft", "柔和") + preset("vivid", "鲜明") + "</div>" +
                '<div style="text-align:center">' +
                    '<button class="b3-button b3-button--outline" data-cfg="save">' + (L.save || "保存") + "</button>" +
                "</div></div>",
            width: "420px",
        });
        const root = dialog.element;
        const sw = root.querySelector('[data-cfg="enabled"]');
        let saveTimer = 0;
        const persistSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => this.persist(), 300); };
        // 滑条：拖动即时预览（重写样式，不动 watchers），防抖持久化
        root.querySelectorAll("[data-slider]").forEach((slider) => {
            slider.oninput = () => {
                const key = slider.getAttribute("data-slider");
                const unit = slider.getAttribute("data-unit") || "";
                const v = parseInt(slider.value, 10);
                const valEl = root.querySelector('[data-val="' + key + '"]');
                if (valEl) valEl.textContent = v + unit;
                if (key === "alpha") this.cfg.alpha = v / 100;
                if (key === "chroma") this.cfg.chroma = v / 100;
                if (key === "light") this.cfg.light = v;
                if (this.cfg.enabled) this.applyStyle();
                persistSoon();
            };
        });
        // 预设：三参同设 + 即时预览 + 立即持久化
        root.querySelectorAll("[data-preset]").forEach((btn) => {
            btn.onclick = () => {
                Object.assign(this.cfg, PRESETS[btn.getAttribute("data-preset")] || {});
                this.applyStyle();
                this.persist();
                root.querySelectorAll("[data-slider]").forEach((slider) => {
                    const key = slider.getAttribute("data-slider");
                    const v = key === "alpha" ? Math.round(this.cfg.alpha * 100)
                        : key === "chroma" ? Math.round(this.cfg.chroma * 100) : this.cfg.light;
                    slider.value = v;
                    const valEl = root.querySelector('[data-val="' + key + '"]');
                    if (valEl) valEl.textContent = v + (slider.getAttribute("data-unit") || "");
                });
            };
        });
        const saveBtn = root.querySelector('[data-cfg="save"]');
        if (saveBtn) saveBtn.onclick = () => {
            const wasOn = this.cfg.enabled;
            if (sw) this.cfg.enabled = sw.checked;
            this.persist();
            this.applyStyle();
            if (this.cfg.enabled && !wasOn) this.startWatchers();
            if (!this.cfg.enabled && wasOn) { this.stopWatchers(); this.clearMarks(); }
            clearTimeout(saveTimer);
            dialog.destroy();
        };
    }
}

module.exports = ColorfulDocTree;
