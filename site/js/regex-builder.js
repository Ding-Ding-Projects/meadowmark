/* Meadowmark site — full guided regex builder.
 * Attaches to any search/filter field as an anchored popover: guided
 * construction (literals, classes, anchors, groups, alternation,
 * quantifiers), a raw pattern editor, flags, sample text, live matches
 * and capture groups, copy/export. Plain text stays the default; regex
 * is an explicit opt-in per field. Evaluated locally, bounded, with a
 * simple backtracking-time guard. */
(function (global) {
  "use strict";

  const MAX_SAMPLE = 20000;
  const EVAL_BUDGET_MS = 150;

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function safeTest(pattern, flags, text) {
    const start = performance.now();
    try {
      const re = new RegExp(pattern, flags.includes("g") ? flags : flags + "g");
      const matches = [];
      let m;
      let guardCount = 0;
      while ((m = re.exec(text)) !== null) {
        matches.push(m);
        guardCount++;
        if (performance.now() - start > EVAL_BUDGET_MS) { return { error: "Evaluation stopped: pattern is too slow on this sample. / 評估已停：呢個 pattern 喺呢段樣本跑得太慢。" }; }
        if (guardCount > 5000) break;
        if (m.index === re.lastIndex) re.lastIndex++;
        if (!flags.includes("g")) break;
      }
      return { matches };
    } catch (err) {
      return { error: err.message };
    }
  }

  /**
   * Create a builder popover bound to a text input.
   * options: { onApply(query, {mode, pattern, flags}) }
   */
  function attach(input, options) {
    options = options || {};
    const wrap = input.closest(".mm-search") || input.parentElement;
    let btn = wrap.querySelector(".builder-btn");
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mm-btn icon builder-btn";
      btn.title = "Open the regex builder / 打開規律建構器";
      btn.setAttribute("aria-label", "Open the regex builder for this search field / 為呢個搜尋欄打開規律建構器");
      btn.textContent = ".*";
      wrap.appendChild(btn);
    }
    const state = { mode: "text", pattern: "", flags: "g", sample: options.sampleDefault || "" };

    btn.addEventListener("click", () => {
      MMOverlay.openAnchored(btn, (el, close) => renderBuilder(el, close), { wide: true });
    });

    function renderBuilder(el, close) {
      el.innerHTML = "";
      const title = document.createElement("div");
      title.style.fontWeight = "700";
      title.style.marginBottom = "8px";
      title.innerHTML = '<span class="i18n-en">Regex builder</span><span class="i18n-yue" lang="yue"> 規律建構器</span>';
      el.appendChild(title);

      const modeRow = document.createElement("div");
      modeRow.className = "mm-rb-flags";
      modeRow.innerHTML =
        '<label><input type="radio" name="mm-rb-mode" value="text"' + (state.mode === "text" ? " checked" : "") + '> <span class="i18n-en">Plain text</span><span class="i18n-yue" lang="yue"> 純文字</span></label>' +
        '<label><input type="radio" name="mm-rb-mode" value="regex"' + (state.mode === "regex" ? " checked" : "") + '> <span class="i18n-en">Regex</span><span class="i18n-yue" lang="yue"> 規律運算式</span></label>';
      el.appendChild(modeRow);

      const guided = document.createElement("div");
      const chips = document.createElement("div");
      chips.className = "mm-rb-chips";
      const chipDefs = [
        ["literal a", "a"], [".", "."], ["\\d digit", "\\d"], ["\\w word", "\\w"], ["\\s space", "\\s"],
        ["[abc] class", "[abc]"], ["[^abc] negated", "[^abc]"], ["^ start", "^"], ["$ end", "$"],
        ["(group)", "(...)"], ["(?:non-cap)", "(?:...)"], ["a|b alternation", "a|b"],
        ["* 0+", "*"], ["+ 1+", "+"], ["? 0/1", "?"], ["{2,4}", "{2,4}"], ["\\b word bound", "\\b"],
      ];
      chipDefs.forEach(([label, insert]) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.addEventListener("click", () => {
          const start = patternInput.selectionStart || patternInput.value.length;
          const end = patternInput.selectionEnd || patternInput.value.length;
          const v = patternInput.value;
          patternInput.value = v.slice(0, start) + insert + v.slice(end);
          patternInput.dispatchEvent(new Event("input"));
          patternInput.focus();
        });
        chips.appendChild(b);
      });
      guided.appendChild(chips);
      el.appendChild(guided);

      const patLabel = document.createElement("div");
      patLabel.className = "hint";
      patLabel.innerHTML = '<span class="i18n-en">Pattern (raw editor)</span><span class="i18n-yue" lang="yue"> Pattern（原始編輯器）</span>';
      el.appendChild(patLabel);
      const patternInput = document.createElement("input");
      patternInput.type = "text";
      patternInput.className = "mm-rb-pattern";
      patternInput.value = state.pattern;
      patternInput.setAttribute("aria-label", "Regex pattern");
      el.appendChild(patternInput);

      const flagsRow = document.createElement("div");
      flagsRow.className = "mm-rb-flags";
      const flagDefs = [["i", "Ignore case / 唔理大細楷"], ["g", "Global / 全部"], ["m", "Multiline / 多行"], ["s", "Dot-all / 全部字符"], ["u", "Unicode"]];
      flagDefs.forEach(([f, label]) => {
        const lab = document.createElement("label");
        const checked = state.flags.includes(f) ? " checked" : "";
        lab.innerHTML = '<input type="checkbox" data-flag="' + f + '"' + checked + '> ' + f + " (" + label + ")";
        flagsRow.appendChild(lab);
      });
      el.appendChild(flagsRow);

      const sampleLabel = document.createElement("div");
      sampleLabel.className = "hint";
      sampleLabel.innerHTML = '<span class="i18n-en">Sample text</span><span class="i18n-yue" lang="yue"> 測試文字</span>';
      el.appendChild(sampleLabel);
      const sampleArea = document.createElement("textarea");
      sampleArea.value = state.sample;
      sampleArea.maxLength = MAX_SAMPLE;
      sampleArea.style.width = "100%";
      el.appendChild(sampleArea);

      const outLabel = document.createElement("div");
      outLabel.className = "hint";
      outLabel.style.marginTop = "6px";
      outLabel.innerHTML = '<span class="i18n-en">Matches</span><span class="i18n-yue" lang="yue"> 相符結果</span>';
      el.appendChild(outLabel);
      const out = document.createElement("div");
      out.className = "mm-rb-sample-out";
      el.appendChild(out);
      const groupsOut = document.createElement("div");
      groupsOut.className = "mm-rb-groups";
      el.appendChild(groupsOut);

      function currentFlags() {
        return Array.from(flagsRow.querySelectorAll("input[data-flag]")).filter((c) => c.checked).map((c) => c.dataset.flag).join("");
      }

      function refresh() {
        const pattern = patternInput.value;
        const flags = currentFlags();
        const sample = sampleArea.value;
        if (!pattern) { out.textContent = ""; groupsOut.textContent = ""; return; }
        const result = safeTest(pattern, flags, sample);
        if (result.error) {
          out.textContent = result.error;
          groupsOut.textContent = "";
          return;
        }
        if (!result.matches.length) {
          out.innerHTML = '<span class="i18n-en">No matches.</span><span class="i18n-yue" lang="yue"> 冇相符結果。</span>';
          groupsOut.textContent = "";
          return;
        }
        let cursor = 0;
        let html = "";
        result.matches.forEach((m) => {
          html += escapeHtml(sample.slice(cursor, m.index));
          html += '<span class="mm-rb-match">' + escapeHtml(m[0]) + "</span>";
          cursor = m.index + m[0].length;
        });
        html += escapeHtml(sample.slice(cursor));
        out.innerHTML = html || '<span class="hint">(empty sample)</span>';
        const groupLines = result.matches.slice(0, 20).map((m, i) => {
          const groups = m.slice(1).map((g, gi) => "g" + (gi + 1) + "=" + JSON.stringify(g === undefined ? null : g)).join(", ");
          return "#" + (i + 1) + " @" + m.index + ": " + (groups || "(no capture groups)");
        });
        groupsOut.textContent = groupLines.join("\n") + (result.matches.length > 20 ? "\n… (" + (result.matches.length - 20) + " more)" : "");
      }

      patternInput.addEventListener("input", () => { state.pattern = patternInput.value; refresh(); });
      sampleArea.addEventListener("input", () => { state.sample = sampleArea.value; refresh(); });
      flagsRow.addEventListener("change", refresh);
      refresh();

      const actions = document.createElement("div");
      actions.className = "mm-ae-actions";
      const applyBtn = document.createElement("button");
      applyBtn.type = "button";
      applyBtn.className = "mm-btn";
      applyBtn.innerHTML = '<span class="i18n-en">Apply</span><span class="i18n-yue" lang="yue"> 套用</span>';
      applyBtn.addEventListener("click", () => {
        const mode = modeRow.querySelector('input[name="mm-rb-mode"]:checked').value;
        state.mode = mode;
        state.flags = currentFlags();
        input.dataset.rbMode = mode;
        input.dataset.rbPattern = patternInput.value;
        input.dataset.rbFlags = state.flags;
        if (mode === "regex") input.value = patternInput.value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        if (options.onApply) options.onApply(input.value, { mode, pattern: patternInput.value, flags: state.flags });
        close();
      });
      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "mm-btn tonal";
      copyBtn.innerHTML = '<span class="i18n-en">Copy pattern</span><span class="i18n-yue" lang="yue"> 複製 pattern</span>';
      copyBtn.addEventListener("click", () => {
        const text = "/" + patternInput.value + "/" + currentFlags();
        if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
      });
      const exportBtn = document.createElement("button");
      exportBtn.type = "button";
      exportBtn.className = "mm-btn tonal";
      exportBtn.innerHTML = '<span class="i18n-en">Export JSON</span><span class="i18n-yue" lang="yue"> 匯出 JSON</span>';
      exportBtn.addEventListener("click", () => {
        const data = JSON.stringify({ pattern: patternInput.value, flags: currentFlags(), mode: modeRow.querySelector('input[name="mm-rb-mode"]:checked').value }, null, 2);
        if (window.MMExport) MMExport.downloadText("regex-pattern.json", data, "application/json");
      });
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "mm-btn outlined";
      closeBtn.innerHTML = '<span class="i18n-en">Cancel</span><span class="i18n-yue" lang="yue"> 取消</span>';
      closeBtn.addEventListener("click", close);
      actions.appendChild(applyBtn);
      actions.appendChild(copyBtn);
      actions.appendChild(exportBtn);
      actions.appendChild(closeBtn);
      el.appendChild(actions);
    }

    return {
      matches(text) {
        if (input.dataset.rbMode === "regex" && input.dataset.rbPattern) {
          const r = safeTest(input.dataset.rbPattern, input.dataset.rbFlags || "gi", text);
          if (r.error) return false;
          return r.matches.length > 0;
        }
        const q = (input.value || "").toLowerCase();
        if (!q) return true;
        return text.toLowerCase().includes(q);
      },
    };
  }

  global.MMRegexBuilder = { attach, safeTest };
})(window);
