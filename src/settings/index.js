/**
 * 组件：设置面板 —— 官方 Setting（this.setting 存在性=集市齿轮图标条件）
 * + 折叠分组三区（基础/颜色调整/笔记本颜色）+ 自定义色专属参数区
 * 面板由设置项 addItem 挂载（row 项 + fn__block 全宽容器）。
 */
import { cfg, persistSoon } from '../shared/config.js';
import { applyStyle } from '../render/index.js';
import { HUES, HUE_NAMES, hashHue, hslToHex, hexToHsl } from '../shared/color.js';
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
    container.append(pvBox);
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
        refreshPreview();
    });
    styleRow.append(styleName, styleSel);
    gBase.append(styleRow);
    // 浓度滑条（v0.5.7 并回基础组：全局色板已删——"选蓝全变蓝"与多本
    // 异色的设计冲突，语义立不住；全局回归哈希自动+浓度）
    const alphaBox = mkSlider(L.alpha || "染色浓度", "alpha", 5, 40, () => Math.round(cfg.alpha * 100), (v) => { cfg.alpha = v / 100; }, (v) => v + "%");
    gBase.append(alphaBox);
    const alphaSl = alphaBox.querySelector("input");
    if (alphaSl) alphaSl.addEventListener("input", refreshPreview);
    // ── 全局色调（v0.6.1：色板+三滑条协作）──
    // v0.5.6 教训：选色后滑条不跟（起点断裂，选蓝出灰蓝）；v0.6.0 错误：
    // 矫枉过正砍滑条（按主题配色需要三参精修）。正解：色板选色把 hexToHsl
    // 的 s/l 写回 chroma/light（滑条联动到正确起点），滑条再微调质感；
    // 基色同时记录 __baseHue（全局色相——哈希分配围绕它旋转，配色跟主题走）。
    const gTone = mkGroup(L.gTone || "全局色调", false);   // 默认收起：装上即用，精调再展开
    const toneRow = document.createElement("div");
    toneRow.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin:6px 0";
    const toneName = document.createElement("span");
    toneName.textContent = L.baseColor || "基色";
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
    gTone.append(toneRow, sAlpha, sChroma, sLight);
    // mkGroup 返回 body（details 的内容容器）——移动要移父级 details，否则
    // body 被从 details 抽走、组变空壳（v0.6.1 排查实录）
    gBase.parentNode.insertBefore(gTone.parentElement, gBase.nextSibling);
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
    // ── 分组三：笔记本颜色 ──
    const gNb = mkGroup(L.nbColors || "笔记本颜色", true);
    // 批量恢复（v0.6.4）：一键清空所有 override 回自动——修复"误选自定义
    // 全套落盘"后的恢复路径（逐本选回自动太折磨）
    const resetRow = document.createElement("div");
    resetRow.style.marginBottom = "8px";
    const resetBtn = document.createElement("button");
    resetBtn.className = "b3-button b3-button--outline";
    resetBtn.style.fontSize = "12px";
    resetBtn.textContent = L.resetAll || "全部恢复自动";
    resetBtn.onclick = () => {
        cfg.overrides = {};
        applyStyle();
        walkAllNow();
        persistSoon();
        // 刷新全部笔记本行 UI（重建面板最稳）
        const host = resetBtn.closest("details");
        if (host) { const details = host; details.open = false; setTimeout(() => { details.open = true; }, 50); }
    };
    resetRow.append(resetBtn);
    gNb.append(resetRow);
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
                HUES.forEach((h) => {
                    const o = document.createElement("option");
                    o.value = String(h);
                    o.textContent = HUE_NAMES[h];
                    quick.append(o);
                });
                    // "自定义…"排最末（v0.6.4 修误触：曾排第二紧挨"自动"，
                    // 选十档色时易误选 → 全套 override 落盘 → "全是自定义"）
                    const optCustom = document.createElement("option");
                    optCustom.value = "__custom__";
                    optCustom.textContent = L.customDots || "自定义…";
                    quick.append(optCustom);
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
                const sLight = mkNbSlider(L.light || "明度", "light", 0, 100,
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
