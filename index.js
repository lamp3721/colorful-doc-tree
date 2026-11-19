/** 彩色文档树 — 构建产物（源码 src/*.js，勿手改；构建：npm run build） */

// src/shared/config.js
var DEFAULTS = { enabled: true, alpha: 0.16, chroma: 0.11, light: 62, style: "block" };
var CFG_KEY = "config.json";
var cfg = Object.assign({}, DEFAULTS);
if (typeof cfg.overrides !== "object" || cfg.overrides === null) cfg.overrides = {};
var host = null;
function bindHost(plugin) {
  host = plugin;
}
async function loadCfg() {
  if (!host) return;
  try {
    const saved = await host.loadData(CFG_KEY);
    if (saved && typeof saved === "object") deepMerge(cfg, saved);
  } catch (e) {
    console.error("[cftree] \u914D\u7F6E\u8BFB\u53D6\u5931\u8D25:", e);
  }
  for (const k of Object.keys(cfg.overrides || {})) {
    const o = cfg.overrides[k];
    if (typeof o === "number") cfg.overrides[k] = { h: o };
  }
}
function deepMerge(target, src) {
  for (const k of Object.keys(src)) {
    if (src[k] && typeof src[k] === "object" && !Array.isArray(src[k]) && target[k] && typeof target[k] === "object") deepMerge(target[k], src[k]);
    else target[k] = src[k];
  }
}
function persist() {
  if (host) host.saveData(CFG_KEY, cfg);
}
var saveTimer = 0;
function persistSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 1500);
}
function flushCfg() {
  clearTimeout(saveTimer);
  persist();
}

// src/render/index.js
var STYLE_ID = "colorful-doc-tree-style";
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
  el.textContent = 'html[data-cftree="on"][data-cftreestyle="block"] [data-nb-walked] {  position: relative; isolation: isolate;}\nhtml[data-cftree="on"][data-cftreestyle="block"] [data-nb-walked]::after {  content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none;  background: oklch(var(--nb-l, ' + cfg.light + "%) var(--nb-s, " + cfg.chroma + ") var(--nb-h, 231) / var(--nb-a, " + a + '));}\nhtml[data-cftree="on"][data-cftreestyle="block"] [data-nb-walked]::after {  inset-block: -1px;}\nhtml[data-cftree="on"][data-cftreestyle="block"] [data-nb-block-start]::after {  top: 3px; border-top-left-radius: 6px; border-top-right-radius: 6px;}\nhtml[data-cftree="on"][data-cftreestyle="block"] [data-nb-block-end]::after {  bottom: 3px; border-bottom-left-radius: 6px; border-bottom-right-radius: 6px;}\nhtml[data-cftree="on"][data-cftreestyle="bar"] [data-nb-walked] {  position: relative; isolation: isolate;}\nhtml[data-cftree="on"][data-cftreestyle="bar"] [data-nb-walked]::after {  content: ""; position: absolute; z-index: -1; pointer-events: none;  width: 3px; inset-inline: 0 auto; inset-block: -1px;  background: oklch(var(--nb-l, ' + cfg.light + "%) var(--nb-s, " + cfg.chroma + ') var(--nb-h, 231));}\nhtml[data-cftree="on"][data-cftreestyle="bar"] [data-nb-block-start]::after {  top: 3px; border-top-left-radius: 1.5px; border-top-right-radius: 1.5px;}\nhtml[data-cftree="on"][data-cftreestyle="bar"] [data-nb-block-end]::after {  bottom: 3px; border-bottom-left-radius: 1.5px; border-bottom-right-radius: 1.5px;}\n';
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

// src/shared/color.js
var HUES = [12, 30, 48, 66, 84, 102, 120, 138, 156, 174, 192, 210, 228, 246, 264, 281, 301, 319, 336, 354];
function hashHue(key) {
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = (h << 5) + h + key.charCodeAt(i) >>> 0;
  h ^= h >>> 16;
  h = h * 2146121005 >>> 0;
  h ^= h >>> 15;
  h = h * 2221713035 >>> 0;
  h ^= h >>> 16;
  return HUES[(h >>> 0) % HUES.length];
}
function hslToHex(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, "0");
  };
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
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h: h < 0 ? h + 360 : h, ss: s, ll: l };
}

// src/walker/index.js
var panelObservers = [];
var dockObserver = null;
var onMouseup = null;
var lastScan = 0;
var OBS_CFG = { childList: true, subtree: true, attributeFilter: ["style", "class", "data-type"] };
function walkAllNow() {
  panelObservers.forEach((po) => walkWindow(po.panel));
}
function isNb(li) {
  const dt = li.getAttribute("data-type");
  return dt === "navigation-root" || dt === "navigation-closed";
}
function nbOwnerOf(li) {
  const key = li.getAttribute("data-tree-key") || "";
  if (!key) return null;
  const k = key.startsWith("notebook:") ? key.slice(9) : key;
  const slash = k.indexOf("/");
  return slash > 0 ? k.slice(0, slash) : k || null;
}
function walkTree(panel) {
  const rows = Array.prototype.slice.call(panel.querySelectorAll("li[aria-level]"));
  const valid = rows.filter((li) => !li.closest(".file-tree__pins") && parseInt(li.getAttribute("aria-level"), 10) >= 1);
  const descCache = /* @__PURE__ */ new Map();
  let prevHue = -1;
  const descOf = (nbid) => {
    let d = descCache.get(nbid);
    if (d) return d;
    const ov = cfg.overrides && Object.prototype.hasOwnProperty.call(cfg.overrides, nbid) ? cfg.overrides[nbid] : null;
    if (ov) {
      d = typeof ov === "number" ? { h: ov } : ov;
    } else {
      const seedKey = "notebook:" + nbid + (cfg.shuffleSeed ? "#" + cfg.shuffleSeed : "");
      let h = hashHue(seedKey);
      if (typeof cfg.__baseHue === "number") {
        h = (cfg.__baseHue + (HUES.indexOf(h) - HUES.indexOf(HUES.reduce((a, b) => Math.abs(b - cfg.__baseHue) < Math.abs(a - cfg.__baseHue) ? b : a, HUES[0])) + 5) * (360 / HUES.length) + 36e3) % 360;
      }
      if (h === prevHue) h = HUES[(HUES.indexOf(h) + 1) % HUES.length];
      d = { h };
    }
    descCache.set(nbid, d);
    prevHue = d.h;
    return d;
  };
  for (let i = 0; i < valid.length; i++) {
    const li = valid[i];
    const nbid = nbOwnerOf(li);
    const cur = nbid ? descOf(nbid) : null;
    const st = li.style;
    setVar(st, "--nb-h", cur ? String(cur.h) : null);
    setVar(st, "--nb-s", cur && typeof cur.s === "number" ? String(Math.round(cur.s) / 100) : null);
    setVar(st, "--nb-l", cur && typeof cur.l === "number" ? String(Math.round(cur.l) + "%") : null);
    setVar(st, "--nb-a", cur && typeof cur.a === "number" ? String(Math.round(cur.a) / 100) : null);
    if (!li.hasAttribute("data-nb-walked")) li.setAttribute("data-nb-walked", "");
    const next = valid[i + 1];
    const nextNb = next ? nbOwnerOf(next) : null;
    const blockEnd = next ? nextNb !== nbid : isNb(li);
    setAttr(li, "data-nb-block-start", isNb(li));
    setAttr(li, "data-nb-block-end", blockEnd);
  }
}
function setVar(st, name, value) {
  const curV = st.getPropertyValue(name);
  if (value === null) {
    if (curV) st.removeProperty(name);
  } else if (curV !== value) st.setProperty(name, value);
}
function setAttr(li, name, on) {
  if (on && !li.hasAttribute(name)) li.setAttribute(name, "");
  else if (!on && li.hasAttribute(name)) li.removeAttribute(name);
}
function walk(panel) {
  if (panel.querySelector("li[aria-level]")) walkTree(panel);
}
function walkWindow(panel) {
  const po = panelObservers.find((o) => o.panel === panel);
  if (!po) {
    walk(panel);
    return;
  }
  po.obs.disconnect();
  try {
    walk(panel);
  } finally {
    po.obs.observe(panel, OBS_CFG);
  }
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
  if (!force && Date.now() - lastScan < 2e3) return;
  lastScan = Date.now();
  const panels = document.querySelectorAll('.file-tree.sy__file, [data-type="sidebar-file"], [data-type="sidebar-file"] .file-tree');
  panels.forEach((p) => attach(p));
}
function startWatchers() {
  if (onMouseup) return;
  onMouseup = () => scan();
  document.addEventListener("mouseup", onMouseup);
  document.addEventListener("touchend", onMouseup, { passive: true });
  if (!dockObserver) {
    dockObserver = new MutationObserver(() => scan());
    ["dockLeft", "dockRight"].forEach((id) => {
      const dock = document.getElementById(id);
      if (dock) dockObserver.observe(dock, { childList: true, subtree: true });
    });
    const mobileSidebar = document.querySelector(".side-panel") || document.body;
    dockObserver.observe(mobileSidebar, { childList: true, subtree: false });
  }
  scan(true);
}
function stopWatchers() {
  if (onMouseup) {
    document.removeEventListener("mouseup", onMouseup);
    document.removeEventListener("touchend", onMouseup);
    onMouseup = null;
  }
  if (dockObserver) {
    dockObserver.disconnect();
    dockObserver = null;
  }
  panelObservers.forEach((po) => po.obs.disconnect());
  panelObservers = [];
  document.querySelectorAll("[data-nb-obs]").forEach((p) => p.removeAttribute("data-nb-obs"));
}
function clearMarks() {
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

// src/settings/index.js
function buildSetting(siyuan2, i18n) {
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
    const refresh = () => {
      val.textContent = fmt(getVal());
      sl.value = String(getVal());
    };
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
  const pvBox = document.createElement("div");
  pvBox.style.cssText = "display:flex;gap:6px;padding:8px 0;margin-bottom:4px;border-bottom:1px solid var(--b3-border-color)";
  const pvBlocks = [];
  [200, 150, 40].forEach((h, i) => {
    const b = document.createElement("div");
    b.style.cssText = "flex:1;height:34px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--b3-theme-on-surface-light)";
    b.textContent = ["\u7B14\u8BB0\u672C A", "\u7B14\u8BB0\u672C B", "\u7B14\u8BB0\u672C C"][i];
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
  const gBase = mkGroup(L.gBasic || "\u57FA\u7840", true);
  gBase.append(mkToggle(L.enabled || "\u542F\u7528\u5F69\u8272\u80CC\u666F", "enabled"));
  const styleRow = document.createElement("div");
  styleRow.className = "fn__flex";
  styleRow.style.cssText = "justify-content:space-between;align-items:center;margin:6px 0";
  const styleName = document.createElement("span");
  styleName.textContent = L.style || "\u6E32\u67D3\u5F62\u6001";
  const styleSel = document.createElement("select");
  styleSel.className = "b3-select";
  styleSel.style.width = "140px";
  [["block", L.styleBlock || "\u6574\u5757\u80CC\u666F"], ["bar", L.styleBar || "\u884C\u9996\u8272\u6761"]].forEach(([v, label]) => {
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
  const gTone = mkGroup(L.gTone || "\u5168\u5C40\u8272\u8C03", false);
  const toneRow = document.createElement("div");
  toneRow.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin:6px 0";
  const toneName = document.createElement("span");
  toneName.textContent = L.baseColor || "\u914D\u8272\u57FA\u8C03";
  const toneHint = document.createElement("div");
  toneHint.style.cssText = "font-size:12px;opacity:.6;margin:2px 0 6px";
  toneHint.textContent = L.baseColorHint || "\u5404\u7B14\u8BB0\u672C\u56F4\u7ED5\u8FD9\u4E2A\u989C\u8272\u5C55\u5F00\u90BB\u8FD1\u8272\uFF0C\u4E0D\u662F\u5168\u90E8\u53D8\u6210\u5B83";
  const toneSwatch = document.createElement("input");
  toneSwatch.type = "color";
  toneSwatch.className = "b3-color-picker";
  toneSwatch.style.cssText = "width:52px;height:26px;padding:0;border:1px solid var(--b3-border-color);background:transparent;cursor:pointer";
  toneSwatch.value = cfg.__baseHex || hslToHex(140, cfg.chroma, cfg.light / 100);
  const sAlpha = mkSlider(L.alpha || "\u67D3\u8272\u6D53\u5EA6", "alpha", 5, 40, () => Math.round(cfg.alpha * 100), (v) => {
    cfg.alpha = v / 100;
  }, (v) => v + "%");
  const sChroma = mkSlider(L.chroma || "\u9971\u548C\u5EA6", "chroma", 0, 60, () => Math.round(cfg.chroma * 100), (v) => {
    cfg.chroma = v / 100;
  }, (v) => v + "%");
  const sLight = mkSlider(L.light || "\u660E\u5EA6", "light", 0, 100, () => cfg.light, (v) => {
    cfg.light = v;
  }, (v) => v + "%");
  const syncToneSliders = () => {
    const vOf = (key) => key === "alpha" ? Math.round(cfg.alpha * 100) : key === "chroma" ? Math.round(cfg.chroma * 100) : cfg.light;
    [["alpha", (v) => v + "%"], ["chroma", (v) => v + "%"], ["light", (v) => v + "%"]].forEach(([key]) => {
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
  const TONE_PRESETS = {
    soft: { alpha: 0.12, chroma: 0.08, light: 64 },
    normal: { alpha: 0.16, chroma: 0.11, light: 62 },
    // 默认档（v0.6.8）：介于柔和/鲜明之间
    vivid: { alpha: 0.24, chroma: 0.16, light: 58 }
  };
  const tpRow = document.createElement("div");
  tpRow.style.cssText = "margin-top:6px";
  const tpName = document.createElement("span");
  tpName.style.cssText = "font-size:12px;opacity:.8";
  tpName.textContent = (L.preset || "\u9884\u8BBE") + "\uFF1A";
  tpRow.append(tpName);
  Object.keys(TONE_PRESETS).forEach((key) => {
    const b = document.createElement("button");
    b.className = "b3-button b3-button--outline";
    b.style.marginLeft = "8px";
    b.textContent = key === "soft" ? L.soft || "\u67D4\u548C" : key === "normal" ? L.normal || "\u9002\u4E2D" : L.vivid || "\u9C9C\u660E";
    b.onclick = () => {
      Object.assign(cfg, TONE_PRESETS[key]);
      applyStyle();
      persistSoon();
      refreshPreview();
      syncToneSliders();
    };
    tpRow.append(b);
  });
  gTone.append(tpRow);
  gBase.parentNode.insertBefore(gTone.parentElement, gBase.nextSibling);
  [sAlpha, sChroma, sLight].forEach((box) => {
    const sl = box.querySelector("input");
    if (sl) sl.addEventListener("input", refreshPreview);
  });
  const reRow = document.createElement("div");
  reRow.style.marginTop = "8px";
  const reBtn = document.createElement("button");
  reBtn.className = "b3-button b3-button--outline";
  reBtn.textContent = L.reshuffle || "\u{1F3B2} \u91CD\u65B0\u5206\u914D\u989C\u8272";
  reBtn.onclick = () => {
    cfg.shuffleSeed = (cfg.shuffleSeed || 0) + 1;
    applyStyle();
    walkAllNow();
    persistSoon();
  };
  reRow.append(reBtn);
  gBase.append(reRow);
  const gNb = mkGroup(L.nbColors || "\u7B14\u8BB0\u672C\u989C\u8272", true);
  const resetRow = document.createElement("div");
  resetRow.style.marginBottom = "8px";
  const resetBtn = document.createElement("button");
  resetBtn.className = "b3-button b3-button--outline";
  resetBtn.style.fontSize = "12px";
  resetBtn.textContent = L.resetAll || "\u5168\u90E8\u6062\u590D\u81EA\u52A8";
  resetBtn.onclick = () => {
    cfg.overrides = {};
    applyStyle();
    walkAllNow();
    persistSoon();
    nbBox.dispatchEvent(new CustomEvent("cftree-rows-refresh"));
  };
  resetRow.append(resetBtn);
  gNb.append(resetRow);
  const nbBox = document.createElement("div");
  nbBox.style.cssText = "display:flex;flex-direction:column;gap:4px;max-height:288px;overflow-y:auto";
  gNb.append(nbBox);
  const rowRefreshers = [];
  nbBox.addEventListener("cftree-rows-refresh", () => {
    rowRefreshers.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.error("[cftree] \u884C\u5237\u65B0\u5931\u8D25:", e);
      }
    });
  });
  fetch("/api/notebook/lsNotebooks", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then((r) => r.json()).then((data) => {
    const notebooks = data && data.data && data.data.notebooks || [];
    if (!notebooks.length) {
      nbBox.textContent = L.noNotebooks || "\uFF08\u672A\u83B7\u53D6\u5230\u7B14\u8BB0\u672C\uFF09";
      return;
    }
    notebooks.forEach((nb) => {
      if (nb.closed) return;
      const row = document.createElement("div");
      row.style.cssText = "display:flex;justify-content:space-between;align-items:center";
      const name = document.createElement("span");
      name.style.cssText = "font-size:12px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
      name.textContent = nb.name;
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
      optAuto.textContent = L.auto || "\u81EA\u52A8";
      quick.append(optAuto);
      const optCustom = document.createElement("option");
      optCustom.value = "__custom__";
      optCustom.textContent = L.customDots || "\u81EA\u5B9A\u4E49\u2026";
      quick.append(optCustom);
      const cur = cfg.overrides && cfg.overrides[nb.id];
      if (cur && typeof cur === "object" && cur.h !== void 0 && cur.s === void 0) {
        cur.s = Math.round(cfg.chroma * 100);
        cur.l = cfg.light;
        if (typeof cur.a !== "number") cur.a = Math.round(cfg.chroma * 100);
      }
      const hslOf = (o) => typeof o === "number" ? { h: o } : o || null;
      const applyOverride = (val) => {
        if (val === null) delete cfg.overrides[nb.id];
        else cfg.overrides[nb.id] = val;
        persistSoon();
        walkAllNow();
      };
      const syncUI = () => {
        const c = hslOf(cfg.overrides && cfg.overrides[nb.id]);
        const isCustom = !!(c && typeof c === "object" && c.s !== void 0);
        quick.value = isCustom ? "__custom__" : "";
        const hh = c ? c.h : hashHue(nb.id);
        const ss = c && c.s !== void 0 ? c.s : Math.round(cfg.chroma * 100);
        const ll = c && c.l !== void 0 ? c.l : cfg.light;
        swatch.value = hslToHex(hh, ss / 100, ll / 100);
      };
      swatch.addEventListener("input", () => {
        const { h, ss, ll } = hexToHsl(swatch.value);
        applyOverride({ h: Math.round(h), s: Math.round(ss * 100), l: Math.round(ll * 100), a: 100 });
        syncUI();
        syncCustomPanel();
        if (typeof syncFoldMark === "function") syncFoldMark();
      });
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
        const refresh = () => {
          const v = getVal();
          sl.value = String(v);
          vb.textContent = fmt(v);
        };
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
      const sAlpha2 = mkNbSlider(
        L.alpha || "\u6D53\u5EA6",
        "alpha",
        5,
        100,
        () => {
          const o = curOv();
          return o && typeof o.a === "number" ? o.a : 100;
        },
        (v) => {
          const o = curOv();
          if (o) o.a = v;
        },
        (v) => v + "%"
      );
      const sChroma2 = mkNbSlider(
        L.chroma || "\u9971\u548C",
        "chroma",
        0,
        100,
        () => {
          const o = curOv();
          return o ? o.s : 0;
        },
        (v) => {
          const o = curOv();
          if (o) o.s = v;
        },
        (v) => v + "%"
      );
      const sLight2 = mkNbSlider(
        L.light || "\u660E\u5EA6",
        "light",
        0,
        100,
        () => {
          const o = curOv();
          return o ? o.l : 62;
        },
        (v) => {
          const o = curOv();
          if (o) o.l = v;
        },
        (v) => v + "%"
      );
      const clearBtn = document.createElement("button");
      clearBtn.className = "b3-button b3-button--outline";
      clearBtn.style.cssText = "font-size:12px;margin-top:4px";
      clearBtn.textContent = L.clearCustom || "\u56DE\u5230\u81EA\u52A8";
      clearBtn.onclick = (ev) => {
        ev.stopPropagation();
        applyOverride(null);
        syncUI();
        syncCustomPanel();
        syncFoldMark();
      };
      customBox.append(sAlpha2, sChroma2, sLight2, clearBtn);
      const syncCustomPanel = () => {
        const o = curOv();
        customBox.style.display = o && !folded.on ? "block" : "none";
        if (o && !folded.on) {
          [sAlpha2, sChroma2, sLight2].forEach((slBox) => {
            const sl = slBox.querySelector("input");
            sl.dispatchEvent(new Event("input"));
          });
        }
      };
      row.addEventListener("click", (ev) => {
        if (!curOv()) return;
        if (ev.target.closest("select, input")) return;
        folded.on = !folded.on;
        customBox.style.display = folded.on ? "none" : "block";
      });
      syncUI();
      syncCustomPanel();
      rowRefreshers.push(() => {
        syncFoldMark();
        syncUI();
        syncCustomPanel();
      });
      quick.addEventListener("change", () => {
        if (quick.value === "__custom__") {
          if (!curOv()) {
            const base = hslOf(cfg.overrides && cfg.overrides[nb.id]);
            const h0 = base ? base.h : hashHue(nb.id);
            applyOverride({ h: h0, s: Math.round(cfg.chroma * 100), l: cfg.light, a: 100 });
          }
        } else {
          applyOverride(null);
        }
        syncUI();
        syncCustomPanel();
      });
      const syncFoldMark = () => {
        name.textContent = (curOv() ? folded.on ? "\u25B8 " : "\u25BE " : "") + nb.name;
      };
      row.addEventListener("click", () => setTimeout(syncFoldMark, 0));
      syncFoldMark();
      ctrl.append(quick, swatch);
      row.append(name, ctrl);
      const wrap = document.createElement("div");
      wrap.append(row, customBox);
      nbBox.append(wrap);
    });
  }).catch(() => {
    nbBox.textContent = L.noNotebooks || "\uFF08\u672A\u83B7\u53D6\u5230\u7B14\u8BB0\u672C\uFF09";
  });
  const setting = new siyuan2.Setting({ width: "560px", height: "auto" });
  setting.addItem({ title: "", direction: "row", actionElement: container });
  return setting;
}

// src/main.js
var siyuan = require("siyuan");
var ColorfulDocTree = class extends siyuan.Plugin {
  constructor(options) {
    super(options);
    this._cfgDialog = null;
    this._cfgContainer = null;
  }
  async onload() {
    bindHost(this);
    await loadCfg();
    applyStyle();
    if (cfg.enabled) startWatchers();
    const L = this.i18n || {};
    this.addCommand({ langKey: "toggle", langText: L.toggle || "\u5207\u6362\u5F69\u8272\u80CC\u666F", hotkey: "", callback: () => this.toggle() });
    this.addCommand({ langKey: "settings", langText: L.settings || "\u5F69\u8272\u6587\u6863\u6811\u8BBE\u7F6E", hotkey: "", callback: () => this.openSettings() });
    this.setting = buildSetting(siyuan, this.i18n);
  }
  // 布局就绪再启动走查（v0.5.3 修"刷新界面颜色迟到数秒"）：面板已在 DOM，
  // scan(true) 一次到位；官方插件生命周期专用钩子（lifecycle.ts runLayout）
  onLayoutReady() {
    if (cfg.enabled) startWatchers();
  }
  // 覆写即免重载（plugin/lifecycle.ts:469——未覆写时 saveData 的 data change
  // 任务原位提升为整插件 reload；本实例内存 cfg 即权威）
  onDataChanged() {
  }
  onunload() {
    flushCfg();
    this._cfgDialog = null;
    this._cfgContainer = null;
    stopWatchers();
    clearMarks();
    removeStyle();
  }
  toggle() {
    const on = toggle();
    if (on) startWatchers();
    else {
      stopWatchers();
      clearMarks();
    }
    return on;
  }
  openSettings() {
    if (this.setting) this.setting.open(this.displayName || this.name);
  }
};
module.exports = ColorfulDocTree;
