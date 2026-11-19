/**
 * 色彩数学（纯函数层）
 * 哈希 → 20 档感知均匀调色板；HSL ↔ HEX 换算（设置面板色板用）。
 * 暗色纪律：色相只进 OKLCH 公式（亮度/饱和由 CSS 固定），多色不荧光。
 */
// 20 档调色板（v0.7.6 感知优化）：撞色率数学（生日悖论）之外，等距 18° 在
// 暗底上并不等距——人眼对蓝紫区（260°~330°）色相差最钝、对绿黄区最敏。
// 以工作浓度色（oklch 0.62/0.11）算 CIELAB ΔE 做局部搜索，最大化"最小相邻
// 色差"（8.9→9.5）并把蓝紫区档距拉开（264→281→301），其余区基本保持 18°
export const HUES = [12, 30, 48, 66, 84, 102, 120, 138, 156, 174, 192, 210, 228, 246, 264, 281, 301, 319, 336, 354];

// djb2 + fmix32 雪崩（直取 mod 混合不足）；位运算产带符号数，取模前归无符号
export function hashHue(key) {
    let h = 5381;
    for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) >>> 0;
    h ^= h >>> 16; h = (h * 0x7feb352d) >>> 0;
    h ^= h >>> 15; h = (h * 0x846ca68b) >>> 0;
    h ^= h >>> 16;
    return HUES[(h >>> 0) % HUES.length];
}

export function hslToHex(h, s, l) {
    const a = s * Math.min(l, 1 - l);
    const f = (n) => { const k = (n + h / 30) % 12; const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(255 * c).toString(16).padStart(2, "0"); };
    return "#" + f(0) + f(8) + f(4);
}

export function hexToHsl(hex) {
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
