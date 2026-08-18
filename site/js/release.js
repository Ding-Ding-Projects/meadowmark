/* Meadowmark site — download-section release state.
 * Reads the single committed data/release.json constant so switching
 * the download button on, once a real installer ships, is a one-file
 * data edit rather than an HTML hunt across pages. Never guesses an
 * asset URL: when release.json says published: false, the button
 * stays an honest link to the Releases page. */
(function (global) {
  "use strict";

  function init(rootPrefix) {
    const statusEl = document.getElementById("download-status");
    const btnEl = document.getElementById("download-btn");
    if (!statusEl || !btnEl) return;

    fetch((rootPrefix || "") + "data/release.json")
      .then((r) => r.json())
      .then((release) => {
        const baseline = release && release.currentBaseline;
        if (baseline && baseline.published && baseline.installer && baseline.installer.assetUrl) {
          statusEl.removeAttribute("data-str");
          statusEl.innerHTML =
            '<span class="i18n-en">Latest verified download: ' + baseline.tag + ' (historical baseline). The next release is still pending.</span>' +
            '<span class="i18n-yue" lang="yue"> 最新已驗證下載：' + baseline.tag + '（歷史基準）。下一個版本仲未出。</span>';
          btnEl.removeAttribute("data-str");
          btnEl.href = baseline.installer.assetUrl;
          btnEl.setAttribute("aria-disabled", "false");
          btnEl.innerHTML = '<span class="i18n-en">Download ' + baseline.tag + '</span><span class="i18n-yue" lang="yue"> 下載 ' + baseline.tag + '</span>';
        } else {
          // Stays on the honest unavailable state already in the HTML.
          document.dispatchEvent(new CustomEvent("mm:lang-changed"));
        }
      })
      .catch(() => {
        // release.json failing to load locally is not a reason to imply a
        // download exists — the honest disabled state already in the
        // markup is the safe default and needs no change here.
      });
  }

  global.MMRelease = { init };
})(window);
