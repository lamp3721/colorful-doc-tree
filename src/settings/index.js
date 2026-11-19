/**
 * 组件：设置面板 —— 官方 Setting（this.setting 存在性=集市齿轮图标条件）
 * + 折叠分组三区（基础/颜色调整/笔记本颜色）+ 自定义色专属参数区
 * 面板由设置项 addItem 挂载（row 项 + fn__block 全宽容器）。
 */
import { cfg, persistSoon } from '../shared/config.js';
import { applyStyle } from '../render/index.js';
import { HUES, hashHue, hslToHex, hexToHsl } from '../shared/color.js';
import { walkAllNow } from '../walker/index.js';

// 预设（v0.4.9 引入；v0.5.1 拆分时曾丢失致预设失效，此处归位——
// 预设是滑条三参组合，属 settings 层而非 shared）
const PRESETS = {
    soft:  { alpha: 0.12, chroma: 0.08, light: 64 },
    vivid: { alpha: 0.24, chroma: 0.15, light: 60 },
};

export function buildSetting(siyuan, i18n) {
    const L = i18n || {};
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
            if (cfg.enabled) applyStyle();
            persistSoon();
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
        swT.checked = cfg[key] !== false;
        swT.addEventListener("change", () => {
            cfg[key] = swT.checked;
            applyStyle();
            persistSoon();
        });
        row.append(name, swT);
        return row;
    };
    // 折叠分组（v0.4.2）：官方 addItem 会给 actionElement 强加居中定宽类，
    // 长列表/多控件被压成一坨——整面板走单个 row 项挂全宽容器，
    // 内部用 <details> 自绘可折叠分组
    // v0.7.11 三页式导航栏：面板顶部三行导航（基础/全局色调/笔记本颜色，
    // 官方 entryVisibility location 形态——b3-list-item + 右箭头），点行切页；
    // 下方内容区只显示当前页（原 <details> 折叠组体系整个退役——单页不再
    // 会被全展开顶破，issue #2 的截断场景从结构上消失）
    const container = document.createElement("div");
    container.style.cssText = "width:100%;display:flex;flex-direction:column";
    const navBox = document.createElement("div");
    navBox.className = "b3-list b3-list--background";
    navBox.style.cssText = "margin:0 0 10px 0;border:1px solid var(--b3-border-color);border-radius:6px;flex-shrink:0";
    container.append(navBox);
    const pageBox = document.createElement("div");
    pageBox.style.cssText = "flex:1;overflow-y:auto;min-height:0";
    container.append(pageBox);
    const pages = {};   // key → {li, page}
    let curPageKey = null;
    const mkNavRow = (key, label, mkPage) => {
        const li = document.createElement("div");
        li.className = "b3-list-item";
        li.style.cssText = "display:flex;align-items:center;gap:8px;padding:7px 10px;cursor:pointer;border-radius:4px;margin:1px 2px";
        const txt = document.createElement("span");
        txt.className = "b3-list-item__text";
        txt.style.cssText = "font-size:13px;flex:1";
        txt.textContent = label;
        const arrow = document.createElement("span");
        arrow.style.cssText = "flex-shrink:0;opacity:.5;display:flex";
        arrow.innerHTML = '<svg style="width:14px;height:14px"><use xlink:href="#iconRight"></use></svg>';
        li.append(txt, arrow);
        const page = document.createElement("div");
        page.style.display = "none";
        pageBox.append(page);
        pages[key] = { li, page };
        mkPage(page);
        li.onclick = () => {
            Object.values(pages).forEach((p) => { p.li.style.background = ""; p.page.style.display = "none"; });
            li.style.background = "var(--b3-list-item-hover, rgba(128,128,128,.12))";
            page.style.display = "";
            curPageKey = key;
        };
        navBox.append(li);
        return { page };
    };
    const goKey = (key) => { if (pages[key]) pages[key].li.click(); };
    // ── 预览条（v0.5.7 面板第一公民）——三个模拟块即时反映浓度/形态/统一 ──
    const pvBox = document.createElement("div");
    pvBox.style.cssText = "display:flex;gap:6px;padding:8px 0;margin-bottom:4px;border-bottom:1px solid var(--b3-border-color)";
    const pvBlocks = [];
    [200, 150, 40].forEach((h, i) => {
        const b = document.createElement("div");
        b.style.cssText = "flex:1;height:34px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--b3-theme-on-surface-light)";
        b.textContent = ["笔记本 A", "笔记本 B", "笔记本 C"][i];
        pvBox.append(b);
        pvBlocks.push([b, h]);
    });
    const refreshPreview = () => {
        pvBlocks.forEach(([b, h]) => {
            if (cfg.style === "bar") {
                b.style.background = "transparent";
                b.style.borderLeft = "3px solid oklch(62% 0.12 " + h + ")";
            } else {
                b.style.borderLeft = "";
                b.style.background = "oklch(62% 0.12 " + h + " / " + cfg.alpha + ")";
            }
        });
    };
    refreshPreview();
    // ── 分组一：基础 ──
    // ── 页：基础 ──（预览条放本页顶部）
    const gBase = mkNavRow("base", L.gBasic || "基础", (page) => {
        page.append(pvBox);
    }).page;
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
        if (cfg.style === v) opt.selected = true;
        styleSel.append(opt);
    });
    styleSel.addEventListener("change", () => {
        cfg.style = styleSel.value;
        if (cfg.enabled) applyStyle();
        persistSoon();
        refreshPreview();
    });
    styleRow.append(styleName, styleSel);
    gBase.append(styleRow);
    // 浓度滑条（v0.5.7 并回基础组：全局色板已删——"选蓝全变蓝"与多本
    // 异色的设计冲突，语义立不住；全局回归哈希自动+浓度）
    // ── 全局色调（v0.6.1：色板+三滑条协作）──
    // v0.5.6 教训：选色后滑条不跟（起点断裂，选蓝出灰蓝）；v0.6.0 错误：
    // 矫枉过正砍滑条（按主题配色需要三参精修）。正解：色板选色把 hexToHsl
    // 的 s/l 写回 chroma/light（滑条联动到正确起点），滑条再微调质感；
    // 基色同时记录 __baseHue（全局色相——哈希分配围绕它旋转，配色跟主题走）。
    // ── 页：全局色调 ──
    const gTone = mkNavRow("tone", L.gTone || "全局色调", (page) => {}).page;
    const toneRow = document.createElement("div");
    toneRow.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin:6px 0";
    const toneName = document.createElement("span");
    toneName.textContent = L.baseColor || "配色基调";
    const toneHint = document.createElement("div");
    toneHint.style.cssText = "font-size:12px;opacity:.6;margin:2px 0 6px";
    toneHint.textContent = L.baseColorHint || "各笔记本围绕这个颜色展开邻近色，不是全部变成它";
    const toneSwatch = document.createElement("input");
    toneSwatch.type = "color";
    toneSwatch.className = "b3-color-picker";
    toneSwatch.style.cssText = "width:52px;height:26px;padding:0;border:1px solid var(--b3-border-color);background:transparent;cursor:pointer";
    toneSwatch.value = cfg.__baseHex || hslToHex(140, cfg.chroma, cfg.light / 100);
    const sAlpha = mkSlider(L.alpha || "染色浓度", "alpha", 5, 40, () => Math.round(cfg.alpha * 100), (v) => { cfg.alpha = v / 100; }, (v) => v + "%");
    const sChroma = mkSlider(L.chroma || "饱和度", "chroma", 0, 60, () => Math.round(cfg.chroma * 100), (v) => { cfg.chroma = v / 100; }, (v) => v + "%");
    const sLight = mkSlider(L.light || "明度", "light", 0, 100, () => cfg.light, (v) => { cfg.light = v; }, (v) => v + "%");
    const syncToneSliders = () => {
        // 只刷显示，不 dispatch input（handler 的 setVal 会用滑条旧值写回 cfg，
        // 把色板刚写的新 chroma/light 冲掉——v0.6.1 自反馈 bug：
        // baseHue 落盘了而 chroma/light 保持旧值的真凶）
        const vOf = (key) => key === "alpha" ? Math.round(cfg.alpha * 100)
            : key === "chroma" ? Math.round(cfg.chroma * 100) : cfg.light;
        [["alpha", v => v + "%"], ["chroma", v => v + "%"], ["light", v => v + "%"]].forEach(([key]) => {
            const box = key === "alpha" ? sAlpha : key === "chroma" ? sChroma : sLight;
            const sl = box.querySelector("input");
            const vb = box.querySelector("b");
            const v = vOf(key);
            sl.value = String(v);
            if (vb) vb.textContent = v + "%";
        });
    };
    toneSwatch.addEventListener("input", () => {
        const { h, ss, ll } = hexToHsl(toneSwatch.value);
        cfg.__baseHex = toneSwatch.value;
        cfg.__baseHue = Math.round(h);
        cfg.chroma = Math.round(ss * 100) / 100;
        cfg.light = Math.round(ll * 100);
        applyStyle();
        walkAllNow();
        persistSoon();
        refreshPreview();
        syncToneSliders();
    });
    toneRow.append(toneName, toneSwatch);
    gTone.append(toneRow, toneHint, sAlpha, sChroma, sLight);
    // 预设（v0.6.7）：柔和/鲜明——基色+三参数整套，一键即达（在色板选好
    // 基色后用预设快速试质感，滑条同步显示，想微调继续拖）
    const TONE_PRESETS = {
        soft:   { alpha: 0.12, chroma: 0.08, light: 64 },
        normal: { alpha: 0.16, chroma: 0.11, light: 62 },   // 默认档（v0.6.8）：介于柔和/鲜明之间
        vivid:  { alpha: 0.24, chroma: 0.16, light: 58 },
    };
    const tpRow = document.createElement("div");
    tpRow.style.cssText = "margin-top:6px";
    const tpName = document.createElement("span");
    tpName.style.cssText = "font-size:12px;opacity:.8";
    tpName.textContent = (L.preset || "预设") + "：";
    tpRow.append(tpName);
    Object.keys(TONE_PRESETS).forEach((key) => {
        const b = document.createElement("button");
        b.className = "b3-button b3-button--outline";
        b.style.marginLeft = "8px";
        b.textContent = key === "soft" ? (L.soft || "柔和")
            : key === "normal" ? (L.normal || "适中") : (L.vivid || "鲜明");
        b.onclick = () => {
            Object.assign(cfg, TONE_PRESETS[key]);   // 基色保留（用户选的），只调质感三参
            applyStyle();
            persistSoon();
            refreshPreview();
            syncToneSliders();
        };
        tpRow.append(b);
    });
    gTone.append(tpRow);

    [sAlpha, sChroma, sLight].forEach((box) => {
        const sl = box.querySelector("input");
        if (sl) sl.addEventListener("input", refreshPreview);
    });
    // 重新分配（真实诉求直达：不满意随机配色，重洗一轮——换 seed）
    const reRow = document.createElement("div");
    reRow.style.marginTop = "8px";
    const reBtn = document.createElement("button");
    reBtn.className = "b3-button b3-button--outline";
    reBtn.textContent = L.reshuffle || "🎲 重新分配颜色";
    reBtn.onclick = () => {
        cfg.shuffleSeed = (cfg.shuffleSeed || 0) + 1;
        applyStyle();
        walkAllNow();
        persistSoon();
    };
    reRow.append(reBtn);
    gBase.append(reRow);
    // ── 页：笔记本颜色 ──（v0.7.11 点行内容区切到该本调色页，不再弹窗）
    const gNb = mkNavRow("nb", L.nbColors || "笔记本颜色", (page) => {}).page;
    const nbBox = document.createElement("div");
    nbBox.className = "b3-list b3-list--background";
    nbBox.style.cssText = "margin:4px 0;border:1px solid var(--b3-border-color);border-radius:6px;overflow-y:auto";
    gNb.append(nbBox);
    // 全部恢复自动（v0.6.4 语义保留）：清空 override 回自动
    const resetRow = document.createElement("div");
    resetRow.style.cssText = "margin-top:6px";
    const resetBtn = document.createElement("button");
    resetBtn.className = "b3-button b3-button--outline";
    resetBtn.style.fontSize = "12px";
    resetBtn.textContent = L.resetAll || "全部恢复自动";
    resetBtn.onclick = () => {
        cfg.overrides = {};
        applyStyle();
        walkAllNow();
        persistSoon();
        buildList();
        refreshListDots();
    };
    resetRow.append(resetBtn);
    gNb.append(resetRow);

    // 一本的颜色解析（walker descOf 同语义的独立版）：override → {h,s?,l?,a?}，
    // 自动 → 哈希档 + 全局质感。显示与编辑都用它。
    const descOf = (nbid) => {
        const ov = cfg.overrides && Object.prototype.hasOwnProperty.call(cfg.overrides, nbid)
            ? cfg.overrides[nbid] : null;
        if (ov) return typeof ov === "number" ? { h: ov } : ov;
        let h = hashHue("notebook:" + nbid + (cfg.shuffleSeed ? "#" + cfg.shuffleSeed : ""));
        if (typeof cfg.__baseHue === "number") {
            h = (cfg.__baseHue + (HUES.indexOf(h) - HUES.indexOf(HUES.reduce((a, b) => Math.abs(b - cfg.__baseHue) < Math.abs(a - cfg.__baseHue) ? b : a, HUES[0])) + 5) * (360 / HUES.length) + 36000) % 360;
        }
        return { h: h };
    };
    const curColorHex = (nbid) => {
        const d = descOf(nbid);
        const hh = d.h;
        const ss = typeof d.s === "number" ? d.s : Math.round(cfg.chroma * 100);
        const ll = typeof d.l === "number" ? d.l : cfg.light;
        return hslToHex(hh, ss / 100, ll / 100);
    };

    const buildList = () => {
        nbBox.textContent = "";
        fetch("/api/notebook/lsNotebooks", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
            .then((r) => r.json())
            .then((data) => {
                const notebooks = (data && data.data && data.data.notebooks) || [];
                if (!notebooks.length) { nbBox.textContent = L.noNotebooks || "（未获取到笔记本）"; return; }
                notebooks.forEach((nb) => {
                    if (nb.closed) return;
                    const li = document.createElement("div");
                    li.className = "b3-list-item";
                    li.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer;border-radius:4px;margin:1px 2px";
                    // 色点：当前生效色（override 或自动哈希）所见即所得
                    const dot = document.createElement("span");
                    dot.style.cssText = "width:14px;height:14px;border-radius:50%;flex-shrink:0;border:1px solid var(--b3-border-color)";
                    const name = document.createElement("span");
                    name.className = "b3-list-item__text";
                    name.style.cssText = "font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1";
                    name.textContent = nb.name;   // v0.7.10 重构时曾丢失→行只剩"自动"徽标
                    const isCustom = !!(cfg.overrides && cfg.overrides[nb.id]);
                    const customBadge = document.createElement("span");
                    customBadge.textContent = isCustom ? (L.customDots || "自定义") : (L.auto || "自动");
                    customBadge.style.cssText = "font-size:11px;opacity:.6;flex-shrink:0";
                    // 官方导航箭头（entryVisibility location-arrow 同形态）
                    const arrow = document.createElement("span");
                    arrow.style.cssText = "flex-shrink:0;opacity:.5;display:flex";
                    arrow.innerHTML = '<svg style="width:14px;height:14px"><use xlink:href="#iconRight"></use></svg>';
                    li.append(dot, name, customBadge, arrow);
                    li.onclick = () => openNbEditor(nb);
                    nbBox.append(li);
                    // 色点随时反映当前态（打开编辑窗改动后也要刷）
                    const sync = () => {
                        dot.style.background = curColorHex(nb.id);
                        customBadge.textContent = cfg.overrides && cfg.overrides[nb.id] ? (L.customDots || "自定义") : (L.auto || "自动");
                    };
                    li._cftreeSync = sync;
                    sync();
                });
                refreshListDots();
            })
            .catch(() => { nbBox.textContent = L.noNotebooks || "（未获取到笔记本）"; });
    };
    // 打开中的编辑窗集合（v0.7.10）：批量恢复自动后，各窗的
    // 下拉/色板/滑条要同步回自动态——旧结构的 rowRefreshers 同职责
    const openEditors = [];
    const refreshListDots = () => {
        nbBox.querySelectorAll(".b3-list-item").forEach((li) => { if (li._cftreeSync) li._cftreeSync(); });
        openEditors.forEach((fn) => { try { fn(); } catch (e) { console.error("[cftree] 编辑窗刷新失败:", e); } });
    };
    buildList();

    // ── 独立编辑窗（点一下打开）：两态（自动/自定义…）+ 色板 + 三滑条 ──
    const openNbEditor = (nb) => {
        const d = document.createElement("div");
        d.style.cssText = "display:flex;flex-direction:column;gap:2px";
        const head = document.createElement("div");
        head.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:6px";
        const dot = document.createElement("span");
        dot.style.cssText = "width:16px;height:16px;border-radius:50%;border:1px solid var(--b3-border-color)";
        const title = document.createElement("b");
        title.textContent = nb.name;
        head.append(dot, title);
        d.append(head);
        const modeRow = document.createElement("div");
        modeRow.style.cssText = "display:flex;align-items:center;gap:8px;margin:4px 0 8px";
        const quick = document.createElement("select");
        quick.className = "b3-select";
        quick.style.cssText = "width:110px;font-size:12px";
        const optAuto = document.createElement("option");
        optAuto.value = "";
        optAuto.textContent = L.auto || "自动";
        const optCustom = document.createElement("option");
        optCustom.value = "__custom__";
        optCustom.textContent = L.customDots || "自定义…";
        quick.append(optAuto, optCustom);
        const swatch = document.createElement("input");
        swatch.type = "color";
        swatch.className = "b3-color-picker";
        swatch.style.cssText = "width:34px;height:26px;padding:0;border:1px solid var(--b3-border-color);background:transparent;cursor:pointer";
        modeRow.append(quick, swatch);
        d.append(modeRow);
        const mkNbSlider = (label, getVal, setVal) => {
            const box = document.createElement("div");
            box.style.cssText = "display:flex;align-items:center;gap:6px;margin:3px 0";
            const nm = document.createElement("span");
            nm.style.cssText = "font-size:12px;width:56px;flex-shrink:0;opacity:.8";
            nm.textContent = label;
            const sl = document.createElement("input");
            sl.type = "range";
            sl.className = "b3-slider";
            sl.min = "5"; sl.max = "100";
            sl.style.flex = "1";
            const vb = document.createElement("b");
            vb.style.cssText = "font-size:12px;width:38px;text-align:right";
            const refresh = () => { const v = getVal(); sl.value = String(v); vb.textContent = v + "%"; };
            sl.addEventListener("input", () => { setVal(parseInt(sl.value, 10)); vb.textContent = sl.value + "%"; commit(); });
            box.append(nm, sl, vb);
            box._cftreeRefresh = refresh;
            return box;
        };
        const curOv = () => {
            const o = cfg.overrides && cfg.overrides[nb.id];
            if (!o || typeof o === "number" || typeof o.s !== "number") return null;
            return o;
        };
        const sAlpha = mkNbSlider(L.alpha || "浓度", () => { const o = curOv(); return o && typeof o.a === "number" ? o.a : 100; },
            (v) => { const o = curOv(); if (o) o.a = v; });
        const sChroma = mkNbSlider(L.chroma || "饱和", () => { const o = curOv(); return o ? o.s : Math.round(cfg.chroma * 100); },
            (v) => { const o = curOv(); if (o) o.s = v; });
        const sLight = mkNbSlider(L.light || "明度", () => { const o = curOv(); return o ? o.l : cfg.light; },
            (v) => { const o = curOv(); if (o) o.l = v; });
        const sliders = [sAlpha, sChroma, sLight];
        d.append(...sliders);
        const clearBtn = document.createElement("button");
        clearBtn.className = "b3-button b3-button--outline";
        clearBtn.style.cssText = "font-size:12px;margin-top:8px;align-self:flex-start";
        clearBtn.textContent = L.clearCustom || "回到自动";
        clearBtn.onclick = () => { applyOverride(null); };
        d.append(clearBtn);
        const commit = () => {
            persistSoon();
            walkAllNow();
            syncUI();
            refreshListDots();
        };
        const applyOverride = (val) => {
            if (val === null) delete cfg.overrides[nb.id];
            else cfg.overrides[nb.id] = val;
            commit();
        };
        const syncUI = () => {
            const o = curOv();
            quick.value = o ? "__custom__" : "";
            const hex = curColorHex(nb.id);
            swatch.value = hex;
            dot.style.background = hex;
            clearBtn.style.display = o ? "" : "none";
            sliders.forEach((b) => b._cftreeRefresh());
        };
        swatch.addEventListener("input", () => {
            const { h, ss, ll } = hexToHsl(swatch.value);
            applyOverride({ h: Math.round(h), s: Math.round(ss * 100), l: Math.round(ll * 100), a: curOv() ? curOv().a : 100 });
        });
        quick.addEventListener("change", () => {
            if (quick.value === "__custom__") {
                if (!curOv()) {
                    const base = descOf(nb.id);
                    applyOverride({ h: base.h, s: Math.round(cfg.chroma * 100), l: cfg.light, a: 100 });
                }
            } else {
                applyOverride(null);
            }
        });
        syncUI();
        // 注册进批量刷新链；离开该页时注销（页面不再显示就不该被刷）
        openEditors.push(syncUI);
        // v0.7.11：不再弹独立窗——内容区整页切到该本的调色页。
        // 顶部返回行（官方 entryVisibility back-entry 形态）
        const back = document.createElement("div");
        back.style.cssText = "display:flex;align-items:center;gap:6px;cursor:pointer;padding:4px 0 10px;border-bottom:1px solid var(--b3-border-color);margin-bottom:8px;font-size:13px;opacity:.8";
        back.innerHTML = '<svg style="width:14px;height:14px"><use xlink:href="#iconLeft"></use></svg>';
        back.append(document.createTextNode(L.back || "返回"));
        back.onclick = () => { unreg(); d.remove(); goKey("nb"); };
        const unreg = () => {
            const i = openEditors.indexOf(syncUI);
            if (i >= 0) openEditors.splice(i, 1);
        };
        // 借用 nb 导航页"选中"位：先移内容再挂（pageBox 一次只显示一页）
        Object.values(pages).forEach((p) => { p.li.style.background = ""; p.page.style.display = "none"; });
        pages.nb.li.style.background = "var(--b3-list-item-hover, rgba(128,128,128,.12))";
        d.prepend(back);
        pageBox.append(d);
    };
    // 官方 Setting：单 row 项挂全宽容器（fn__block 不受 fn__size200 定宽挤压）
    // 高度 76vh（v0.7.9 修 #2 底部截断）：auto 跟随内容超屏时容器被裁
// （b3-dialog__container 无视口上限，超出视口部分不可达），官方默认即 80vh
// ——面板三组全展开超屏时内容区自滚，始终完整可达
const setting = new siyuan.Setting({ width: "560px", height: "76vh" });
    setting.addItem({ title: "", direction: "row", actionElement: container });
    goKey("base");   // 默认落在基础页
    return setting;
}
