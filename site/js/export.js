/* Meadowmark site — export helpers. Every list the site owns (changelog,
 * notifications) can be exported in every format that can faithfully
 * represent it: JSON, CSV and Markdown at minimum, plus HTML for the
 * changelog table. Nothing leaves the browser: this writes a local
 * download, no network call is made. */
(function (global) {
  "use strict";

  function downloadText(filename, text, mime) {
    const blob = new Blob([text], { type: (mime || "text/plain") + ";charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function toCsv(rows, columns) {
    const esc = (v) => {
      const s = v === undefined || v === null ? "" : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const header = columns.map((c) => esc(c.label)).join(",");
    const lines = rows.map((r) => columns.map((c) => esc(r[c.key])).join(","));
    return [header, ...lines].join("\r\n");
  }

  function toMarkdown(rows, columns) {
    const header = "| " + columns.map((c) => c.label).join(" | ") + " |";
    const sep = "| " + columns.map(() => "---").join(" | ") + " |";
    const lines = rows.map((r) => "| " + columns.map((c) => String(r[c.key] ?? "").replace(/\|/g, "\\|")).join(" | ") + " |");
    return [header, sep, ...lines].join("\n");
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[char]));
  }

  function exportRows(rows, columns, baseName, format) {
    if (format === "json") downloadText(baseName + ".json", JSON.stringify(rows, null, 2), "application/json");
    else if (format === "csv") downloadText(baseName + ".csv", toCsv(rows, columns), "text/csv");
    else if (format === "markdown") downloadText(baseName + ".md", toMarkdown(rows, columns), "text/markdown");
    else if (format === "html") {
      const html = "<table>\n<thead><tr>" + columns.map((c) => "<th>" + escapeHtml(c.label) + "</th>").join("") + "</tr></thead>\n<tbody>\n" +
        rows.map((r) => "<tr>" + columns.map((c) => "<td>" + escapeHtml(r[c.key]) + "</td>").join("") + "</tr>").join("\n") +
        "\n</tbody></table>\n";
      downloadText(baseName + ".html", html, "text/html");
    }
  }

  global.MMExport = { downloadText, toCsv, toMarkdown, exportRows, escapeHtml };
})(window);
