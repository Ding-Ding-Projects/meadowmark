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
        if (release && release.published && release.assetUrl) {
          statusEl.removeAttribute("data-str");
          statusEl.innerHTML =
            '<span class="i18n-en">Latest release: ' + release.tag + '</span>' +
            '<span class="i18n-yue" lang="yue"> 最新版本：' + release.tag + '</span>';
          btnEl.removeAttribute("data-str");
          btnEl.href = release.assetUrl;
          btnEl.setAttribute("aria-disabled", "false");
          btnEl.innerHTML = '<span class="i18n-en">Download ' + release.tag + '</span><span class="i18n-yue" lang="yue"> 下載 ' + release.tag + '</span>';
        } else {
          // Stays on the honest "not yet published" state already in the HTML.
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
