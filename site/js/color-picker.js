/* Meadowmark site — infinite colour picker and colour-space translator.
 * A continuous HSV field + hue/alpha sliders, plus bidirectional
 * conversion among HEX/HEX8, RGB(A), HSL(A), HSV, and HWB, with a live
 * contrast readout against a chosen background. No swatch-only picker. */
(function (global) {
  "use strict";

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function hsvToRgb(h, s, v) {
    h = ((h % 360) + 360) % 360;
    s = clamp(s, 0, 1); v = clamp(v, 0, 1);
    const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
    let r, g, b;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
  }

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d !== 0) {
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
    }
    if (h < 0) h += 360;
    const s = max === 0 ? 0 : d / max;
    return { h, s, v: max };
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0; const l = (max + min) / 2;
    const d = max - min;
    if (d !== 0) {
      s = d / (1 - Math.abs(2 * l - 1));
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
    }
    if (h < 0) h += 360;
    return { h, s, l };
  }

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360; s = clamp(s, 0, 1); l = clamp(l, 0, 1);
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r, g, b;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
  }

  function rgbToHwb(r, g, b) {
    const { h } = rgbToHsv(r, g, b);
    const w = Math.min(r, g, b) / 255;
    const bl = 1 - Math.max(r, g, b) / 255;
    return { h, w, b: bl };
  }

  function hwbToRgb(h, w, bl) {
    w = clamp(w, 0, 1); bl = clamp(bl, 0, 1);
    if (w + bl >= 1) { const gray = Math.round((w / (w + bl)) * 255); return { r: gray, g: gray, b: gray }; }
    const rgb = hsvToRgb(h, 1, 1);
    const f = (c) => Math.round(c * (1 - w - bl) + w * 255);
    return { r: f(rgb.r / 255), g: f(rgb.g / 255), b: f(rgb.b / 255) };
  }

  function toHex(r, g, b, a) {
    const h = (n) => n.toString(16).padStart(2, "0");
    return "#" + h(r) + h(g) + h(b) + (a !== undefined && a < 1 ? h(Math.round(a * 255)) : "");
  }

  function parseHex(hex) {
    hex = hex.trim().replace(/^#/, "");
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    if (hex.length !== 6 && hex.length !== 8) return null;
    const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    if ([r, g, b].some(Number.isNaN)) return null;
    return { r, g, b, a };
  }

  function relLuminance(r, g, b) {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }

  function contrastRatio(rgb1, rgb2) {
    const l1 = relLuminance(rgb1.r, rgb1.g, rgb1.b) + 0.05;
    const l2 = relLuminance(rgb2.r, rgb2.g, rgb2.b) + 0.05;
    return l1 > l2 ? l1 / l2 : l2 / l1;
  }

  /**
   * Build the infinite colour picker UI inside `container`.
   * initial: {r,g,b,a} 0-255/0-1. onChange({r,g,b,a}) fires live.
   */
  function build(container, initial, onChange) {
    let { h, s, v } = rgbToHsv(initial.r, initial.g, initial.b);
    let a = initial.a === undefined ? 1 : initial.a;

    const field = document.createElement("div");
    field.className = "mm-colorfield";
    field.setAttribute("role", "group");
    field.setAttribute("aria-label", "Saturation and brightness field / 飽和度同明度平面");
    const thumb = document.createElement("div");
    thumb.className = "thumb";
    field.appendChild(thumb);

    const hueSlider = document.createElement("div");
    hueSlider.className = "mm-hue-slider";
    hueSlider.style.marginTop = "8px";
    const hueThumb = document.createElement("div");
    hueThumb.className = "mm-slider-thumb";
    hueSlider.appendChild(hueThumb);

    const alphaSlider = document.createElement("div");
    alphaSlider.className = "mm-alpha-slider";
    alphaSlider.style.marginTop = "8px";
    const alphaThumb = document.createElement("div");
    alphaThumb.className = "mm-slider-thumb";
    alphaSlider.appendChild(alphaThumb);

    const swatch = document.createElement("div");
    swatch.className = "mm-swatch";
    swatch.style.marginTop = "8px";

    const formatWrap = document.createElement("div");
    formatWrap.style.marginTop = "10px";

    function updateAlphaBg() {
      const rgb = hsvToRgb(h, s, v);
      alphaSlider.style.background = "linear-gradient(90deg, transparent, rgb(" + rgb.r + "," + rgb.g + "," + rgb.b + "))";
    }

    function paint() {
      const rgb = hsvToRgb(h, s, v);
      field.style.background = "linear-gradient(0deg, black, transparent), linear-gradient(90deg, white, hsl(" + h + ",100%,50%))";
      thumb.style.left = (s * 100) + "%";
      thumb.style.top = ((1 - v) * 100) + "%";
      hueThumb.style.left = (h / 360 * 100) + "%";
      alphaThumb.style.left = (a * 100) + "%";
      swatch.style.background = "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + "," + a + ")";
      updateAlphaBg();
      renderFormats(rgb);
      if (onChange) onChange({ r: rgb.r, g: rgb.g, b: rgb.b, a });
    }

    function fromPointer(el, e, cb) {
      const rect = el.getBoundingClientRect();
      const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      const y = clamp((e.clientY - rect.top) / rect.height, 0, 1);
      cb(x, y);
    }

    function bindDrag(el, cb) {
      let dragging = false;
      el.addEventListener("mousedown", (e) => { dragging = true; fromPointer(el, e, cb); e.preventDefault(); });
      window.addEventListener("mousemove", (e) => { if (dragging) fromPointer(el, e, cb); });
      window.addEventListener("mouseup", () => { dragging = false; });
      el.tabIndex = 0;
      el.setAttribute("role", "slider");
    }

    bindDrag(field, (x, y) => { s = x; v = 1 - y; paint(); });
    bindDrag(hueSlider, (x) => { h = x * 360; paint(); });
    bindDrag(alphaSlider, (x) => { a = x; paint(); });

    field.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 0.1 : 0.02;
      if (e.key === "ArrowRight") { s = clamp(s + step, 0, 1); paint(); }
      else if (e.key === "ArrowLeft") { s = clamp(s - step, 0, 1); paint(); }
      else if (e.key === "ArrowUp") { v = clamp(v + step, 0, 1); paint(); }
      else if (e.key === "ArrowDown") { v = clamp(v - step, 0, 1); paint(); }
      else return;
      e.preventDefault();
    });

    function numRow(labelText, value, onInput) {
      const row = document.createElement("div");
      row.className = "color-format-row";
      const lab = document.createElement("label");
      lab.textContent = labelText;
      const inp = document.createElement("input");
      inp.type = "text";
      inp.value = value;
      inp.addEventListener("change", () => onInput(inp.value));
      row.appendChild(lab);
      row.appendChild(inp);
      return row;
    }

    let contrastBg = { r: 255, g: 255, b: 255 };

    function renderFormats(rgb) {
      formatWrap.innerHTML = "";
      const hex = toHex(rgb.r, rgb.g, rgb.b, a);
      const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
      const hwb = rgbToHwb(rgb.r, rgb.g, rgb.b);
      formatWrap.appendChild(numRow("HEX", hex, (val) => {
        const p = parseHex(val);
        if (p) { const hv = rgbToHsv(p.r, p.g, p.b); h = hv.h; s = hv.s; v = hv.v; a = p.a; paint(); }
      }));
      formatWrap.appendChild(numRow("RGBA", rgb.r + ", " + rgb.g + ", " + rgb.b + ", " + a.toFixed(2), (val) => {
        const parts = val.split(",").map((x) => parseFloat(x.trim()));
        if (parts.length >= 3 && parts.slice(0, 3).every((n) => !Number.isNaN(n))) {
          const hv = rgbToHsv(parts[0], parts[1], parts[2]);
          h = hv.h; s = hv.s; v = hv.v; a = parts[3] !== undefined ? clamp(parts[3], 0, 1) : a; paint();
        }
      }));
      formatWrap.appendChild(numRow("HSLA", Math.round(hsl.h) + "deg, " + Math.round(hsl.s * 100) + "%, " + Math.round(hsl.l * 100) + "%, " + a.toFixed(2), (val) => {
        const m = val.match(/(-?[\d.]+)[^\d.]+(-?[\d.]+)[^\d.]+(-?[\d.]+)[^\d.]*(?:,\s*(-?[\d.]+))?/);
        if (m) {
          const rgb2 = hslToRgb(parseFloat(m[1]), parseFloat(m[2]) / 100, parseFloat(m[3]) / 100);
          const hv = rgbToHsv(rgb2.r, rgb2.g, rgb2.b);
          h = hv.h; s = hv.s; v = hv.v; if (m[4] !== undefined) a = clamp(parseFloat(m[4]), 0, 1);
          paint();
        }
      }));
      formatWrap.appendChild(numRow("HSV", Math.round(h) + "deg, " + Math.round(s * 100) + "%, " + Math.round(v * 100) + "%", (val) => {
        const m = val.match(/(-?[\d.]+)[^\d.]+(-?[\d.]+)[^\d.]+(-?[\d.]+)/);
        if (m) { h = parseFloat(m[1]); s = parseFloat(m[2]) / 100; v = parseFloat(m[3]) / 100; paint(); }
      }));
      formatWrap.appendChild(numRow("HWB", Math.round(hwb.h) + "deg, " + Math.round(hwb.w * 100) + "%, " + Math.round(hwb.b * 100) + "%", (val) => {
        const m = val.match(/(-?[\d.]+)[^\d.]+(-?[\d.]+)[^\d.]+(-?[\d.]+)/);
        if (m) {
          const rgb2 = hwbToRgb(parseFloat(m[1]), parseFloat(m[2]) / 100, parseFloat(m[3]) / 100);
          const hv = rgbToHsv(rgb2.r, rgb2.g, rgb2.b);
          h = hv.h; s = hv.s; v = hv.v; paint();
        }
      }));
      const ratio = contrastRatio(rgb, contrastBg);
      const contrastEl = document.createElement("div");
      contrastEl.className = "hint";
      const grade = ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : ratio >= 3 ? "AA (large text only)" : "fails WCAG AA";
      contrastEl.textContent = "Contrast vs. white: " + ratio.toFixed(2) + ":1 (" + grade + ") / 對比白色: " + ratio.toFixed(2) + ":1 (" + grade + ")";
      formatWrap.appendChild(contrastEl);
    }

    container.appendChild(field);
    container.appendChild(hueSlider);
    container.appendChild(alphaSlider);
    container.appendChild(swatch);
    container.appendChild(formatWrap);
    paint();

    return {
      getRgba: () => { const rgb = hsvToRgb(h, s, v); return { r: rgb.r, g: rgb.g, b: rgb.b, a }; },
      setRgba: (rgb) => { const hv = rgbToHsv(rgb.r, rgb.g, rgb.b); h = hv.h; s = hv.s; v = hv.v; a = rgb.a === undefined ? 1 : rgb.a; paint(); },
    };
  }

  global.MMColor = { build, hsvToRgb, rgbToHsv, rgbToHsl, hslToRgb, rgbToHwb, hwbToRgb, toHex, parseHex, contrastRatio };
})(window);
