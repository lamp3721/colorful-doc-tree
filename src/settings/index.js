/**
 * 组件：设置面板 —— 官方 Setting（this.setting 存在性=集市齿轮图标条件）
 * + 折叠分组三区（基础/颜色调整/笔记本颜色）+ 自定义色专属参数区
 * 面板由设置项 addItem 挂载（row 项 + fn__block 全宽容器）。
 */
import { cfg, persistSoon } from '../shared/config.js';
import { applyStyle } from '../render/index.js';
import { HUES, HUE_NAMES, hashHue, hslToHex, hexToHsl } from '../shared/color.js';
import { walkAllNow } from '../walker/index.js';

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
        if (cfg.style === v) opt.selected = true;
        styleSel.append(opt);
    });
    styleSel.addEventListener("change", () => {
        cfg.style = styleSel.value;
        if (cfg.enabled) applyStyle();
        persistSoon();
    });
    styleRow.append(styleName, styleSel);
    gBase.append(styleRow);
    // ── 分组二：颜色调整 ──
    const gColor = mkGroup(L.gColor || "颜色调整", true);
    gColor.append(mkSlider(L.alpha || "染色浓度", "alpha", 5, 40, () => Math.round(cfg.alpha * 100), (v) => { cfg.alpha = v / 100; }, (v) => v + "%"));
    gColor.append(mkSlider(L.chroma || "饱和度", "chroma", 0, 20, () => Math.round(cfg.chroma * 100), (v) => { cfg.chroma = v / 100; }, (v) => v + "%"));
    gColor.append(mkSlider(L.light || "明度", "light", 40, 80, () => cfg.light, (v) => { cfg.light = v; }, (v) => v + "%"));
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
            Object.assign(cfg, PRESETS[key] || {});
            applyStyle();
            persistSoon();
            // 刷新三个滑条：先写新 value 再触发 input（handler 读 value 同步标签）
            ["alpha", "chroma", "light"].forEach((k) => {
                const sl = gColor.querySelector('[data-key="' + k + '"]');
                if (!sl) return;
                sl.value = String(k === "alpha" ? Math.round(cfg.alpha * 100)
                    : k === "chroma" ? Math.round(cfg.chroma * 100) : cfg.light);
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
                // v0.4.12：自定义色时不再显示快捷色下拉（"自动(哈希)"占位
                // 对已自定义的条目是误导）——改显示"自定义"徽标 + swatch；
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
                // "自定义…"选项（v0.5.1）：下拉四态一表——自动/十档色/自定义…，
                // 切换不必绕"清除"按钮
                const optCustom = document.createElement("option");
                optCustom.value = "__custom__";
                optCustom.textContent = L.customDots || "自定义…";
                quick.append(optCustom);
                HUES.forEach((h) => {
                    const o = document.createElement("option");
                    o.value = String(h);
                    o.textContent = HUE_NAMES[h];
                    quick.append(o);
                });
                const cur = cfg.overrides && cfg.overrides[nb.id];
                const hslOf = (o) => typeof o === "number" ? { h: o } : (o || null);
                const applyOverride = (val) => {
                    if (val === null) delete cfg.overrides[nb.id];
                    else cfg.overrides[nb.id] = val;
                    persistSoon();
                    walkAllNow();
                };
                const syncUI = () => {
                    const c = hslOf(cfg.overrides && cfg.overrides[nb.id]);
                    const isCustom = !!(c && typeof c === "object" && c.s !== undefined);
                    // 下拉永远显示（v0.5.1）：四态一表——自动/十档色/自定义…
                    const isQuick = !!(c && typeof c === "object" && c.h !== undefined && c.s === undefined);
                    quick.value = isCustom ? "__custom__" : (isQuick ? String(c.h) : "");
                    // swatch 初值：override 的 HSL → hex；无 override 显示全局公式色
                    const hh = c ? c.h : hashHue(nb.id);
                    const ss = c && c.s !== undefined ? c.s : Math.round(cfg.chroma * 100);
                    const ll = c && c.l !== undefined ? c.l : cfg.light;
                    swatch.value = hslToHex(hh, ss / 100, ll / 100);
                };

                swatch.addEventListener("input", () => {
                    const { h, ss, ll } = hexToHsl(swatch.value);
                    // a=1：自定义色所见即所得（v0.4.8 用户反馈"纯红变粉"——
                    // 全局 14% 透明度稀释了色板色，违背"我就要这个色"的语义）
                    applyOverride({ h: Math.round(h), s: Math.round(ss * 100), l: Math.round(ll * 100), a: 100 });
                    syncUI();
                    syncCustomPanel();
                    if (typeof syncFoldMark === "function") syncFoldMark();
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
                        persistSoon();
                        walkAllNow();
                    });
                    refresh();
                    box.append(nm, sl, vb);
                    return box;
                };
                const curOv = () => {
                    const o = cfg.overrides && cfg.overrides[nb.id];
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
                const clearBtn = document.createElement("button");
                clearBtn.className = "b3-button b3-button--outline";
                clearBtn.style.cssText = "font-size:12px;margin-top:4px";
                clearBtn.textContent = L.clearCustom || "回到自动";
                clearBtn.onclick = (ev) => {
                    ev.stopPropagation();
                    applyOverride(null);
                    syncUI();
                    syncCustomPanel();
                    syncFoldMark();
                };
                customBox.append(sAlpha, sChroma, sLight, clearBtn);
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
                // 唯一的下拉 change 处理（v0.5.1 曾短暂存在新旧两个监听器：
                // 旧版先跑 parseInt("__custom__")=NaN 写坏 override）
                quick.addEventListener("change", () => {
                    if (quick.value === "__custom__") {
                        // 进入自定义态：无完整自定义色时以当前显示色为起点
                        // 造全套默认（哈希/已有色相 + 全局饱和/明度），参数区可调
                        if (!curOv()) {
                            const base = hslOf(cfg.overrides && cfg.overrides[nb.id]);
                            const h0 = base ? base.h : hashHue(nb.id);
                            applyOverride({ h: h0, s: Math.round(cfg.chroma * 100), l: cfg.light, a: 100 });
                        }
                    } else if (quick.value === "") {
                        applyOverride(null);            // 自动：清 override
                    } else {
                        applyOverride({ h: parseInt(quick.value, 10) });   // 快捷色：纯色相
                    }
                    syncUI();
                    syncCustomPanel();
                });
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
    return setting;
}
