const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { pathToFileURL } = require("url");

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseInline(text) {
  if (!text) return "";
  const codeSpans = [];
  let processed = String(text).replace(/`([^`]+)`/g, (_, code) => {
    const idx = codeSpans.length;
    codeSpans.push(`<code>${escapeHtml(code)}</code>`);
    return `\x00CODE_${idx}\x00`;
  });

  processed = escapeHtml(processed);

  // Images: ![alt](src)
  processed = processed.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
    return `<img alt="${alt}" src="${src}" style="max-width:100%;" />`;
  });

  // Links: [text](url)
  processed = processed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    return `<a href="${href}">${label}</a>`;
  });

  // Bold + Italic
  processed = processed.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
  // Bold
  processed = processed.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  processed = processed.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  // Italic
  processed = processed.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  // Strikethrough
  processed = processed.replace(/~~([^~]+)~~/g, "<del>$1</del>");

  // Restore inline code spans
  processed = processed.replace(/\x00CODE_(\d+)\x00/g, (_, idx) => codeSpans[Number(idx)]);
  return processed;
}

function parseTableRow(line) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function isTableSeparator(line) {
  if (!line || !line.includes("|")) return false;
  const cells = parseTableRow(line);
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

function getTableAlignments(sepLine) {
  return parseTableRow(sepLine).map((c) => {
    if (c.startsWith(":") && c.endsWith(":")) return "center";
    if (c.endsWith(":")) return "right";
    return "left";
  });
}

function markdownToHtmlBody(markdown) {
  const lines = String(markdown).replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Page break comment
    if (/^<!--\s*pagebreak\s*-->$/i.test(line.trim())) {
      out.push('<div class="page-break"></div>');
      i++;
      continue;
    }

    // Empty line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Fenced code block (``` or ````)
    const fenceMatch = line.match(/^(`{3,}|~{3,})(\S*)\s*$/);
    if (fenceMatch) {
      const fence = fenceMatch[1];
      const lang = fenceMatch[2] || "";
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith(fence)) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing fence
      const langLabel = lang ? `<div class="code-lang">${escapeHtml(lang)}</div>` : "";
      out.push(
        `<div class="code-block">${langLabel}<pre><code class="language-${escapeHtml(lang)}">${escapeHtml(
          codeLines.join("\n")
        )}</code></pre></div>`
      );
      continue;
    }

    // Horizontal rule
    if (/^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      out.push("<hr />");
      i++;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = parseInline(headingMatch[2].trim());
      out.push(`<h${level}>${content}</h${level}>`);
      i++;
      continue;
    }

    // Table
    if (line.includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headers = parseTableRow(line);
      const alignments = getTableAlignments(lines[i + 1]);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(parseTableRow(lines[i]));
        i++;
      }
      let tableHtml = "<table><thead><tr>";
      headers.forEach((h, idx) => {
        const align = alignments[idx] || "left";
        tableHtml += `<th style="text-align:${align}">${parseInline(h)}</th>`;
      });
      tableHtml += "</tr></thead><tbody>";
      for (const row of rows) {
        tableHtml += "<tr>";
        headers.forEach((_, idx) => {
          const align = alignments[idx] || "left";
          const cellVal = row[idx] !== undefined ? row[idx] : "";
          tableHtml += `<td style="text-align:${align}">${parseInline(cellVal)}</td>`;
        });
        tableHtml += "</tr>";
      }
      tableHtml += "</tbody></table>";
      out.push(tableHtml);
      continue;
    }

    // Blockquote
    if (line.trim().startsWith(">")) {
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      const firstLine = quoteLines[0] || "";
      const alertMatch = firstLine.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i);
      if (alertMatch) {
        const type = alertMatch[1].toUpperCase();
        const restFirst = alertMatch[2];
        const bodyLines = restFirst ? [restFirst, ...quoteLines.slice(1)] : quoteLines.slice(1);
        out.push(
          `<div class="alert alert-${type.toLowerCase()}"><div class="alert-title">${type}</div><p>${bodyLines
            .map((l) => parseInline(l))
            .join("<br/>")}</p></div>`
        );
      } else {
        out.push(`<blockquote>${quoteLines.map((l) => parseInline(l)).join("<br/>")}</blockquote>`);
      }
      continue;
    }

    // Unordered or Ordered List
    const ulMatch = line.match(/^(\s*)([-*+])\s+(.+)$/);
    const olMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
    if (ulMatch || olMatch) {
      const isOrdered = Boolean(olMatch);
      const tag = isOrdered ? "ol" : "ul";
      const items = [];
      while (i < lines.length) {
        const cur = lines[i];
        const mUl = cur.match(/^(\s*)([-*+])\s+(.+)$/);
        const mOl = cur.match(/^(\s*)(\d+)\.\s+(.+)$/);
        const m = isOrdered ? mOl : mUl;
        if (!m) break;
        let itemText = m[3];
        // Task list checkbox
        const taskMatch = itemText.match(/^\[([ xX])\]\s+(.+)$/);
        if (taskMatch) {
          const checked = taskMatch[1].toLowerCase() === "x";
          itemText = `<input type="checkbox" disabled ${checked ? "checked" : ""} /> ${parseInline(taskMatch[2])}`;
        } else {
          itemText = parseInline(itemText);
        }
        items.push(`<li>${itemText}</li>`);
        i++;
      }
      out.push(`<${tag}>${items.join("")}</${tag}>`);
      continue;
    }

    // Paragraph
    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].match(/^(#{1,6})\s+/) &&
      !lines[i].match(/^(`{3,}|~{3,})/) &&
      !lines[i].trim().startsWith(">") &&
      !lines[i].match(/^(\s*)([-*+]|\d+\.)\s+/) &&
      !/^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i].trim()) &&
      !(lines[i].includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
    ) {
      paraLines.push(parseInline(lines[i].trim()));
      i++;
    }
    if (paraLines.length > 0) {
      out.push(`<p>${paraLines.join("<br/>")}</p>`);
    } else {
      i++;
    }
  }

  return out.join("\n");
}

function buildHtmlDocument(title, markdownContent) {
  const bodyHtml = markdownToHtmlBody(markdownContent);
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page {
      size: A4;
      margin: 18mm 16mm;
    }
    * {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "PingFang TC", "PingFang SC", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Malgun Gothic", "Microsoft JhengHei", "Noto Sans CJK TC", "Segoe UI", Roboto, sans-serif;
      font-size: 10.5pt;
      line-height: 1.65;
      color: #1f2937;
      margin: 0;
      padding: 0;
      background: #ffffff;
    }
    h1, h2, h3, h4, h5, h6 {
      color: #111827;
      font-weight: 700;
      line-height: 1.35;
      page-break-after: avoid;
      break-after: avoid;
    }
    h1 {
      font-size: 20pt;
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 6pt;
      margin-top: 0;
      margin-bottom: 12pt;
    }
    h2 {
      font-size: 14.5pt;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 4pt;
      margin-top: 18pt;
      margin-bottom: 8pt;
    }
    h3 {
      font-size: 12pt;
      margin-top: 14pt;
      margin-bottom: 6pt;
    }
    h4, h5, h6 {
      font-size: 10.5pt;
      margin-top: 10pt;
      margin-bottom: 4pt;
    }
    p {
      margin: 0 0 8pt 0;
      orphans: 3;
      widows: 3;
    }
    ul, ol {
      margin: 0 0 10pt 0;
      padding-left: 20pt;
    }
    li {
      margin-bottom: 3pt;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 10pt 0 14pt 0;
      font-size: 9.5pt;
      page-break-inside: auto;
    }
    tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    th, td {
      border: 1px solid #d1d5db;
      padding: 6pt 8pt;
      vertical-align: top;
      word-break: break-word;
    }
    th {
      background-color: #f3f4f6;
      font-weight: 600;
      color: #111827;
    }
    tbody tr:nth-child(even) {
      background-color: #f9fafb;
    }
    code {
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace;
      font-size: 9pt;
      background-color: #f3f4f6;
      padding: 1.5pt 4pt;
      border-radius: 3pt;
      color: #b91c1c;
    }
    .code-block {
      margin: 8pt 0 12pt 0;
      page-break-inside: avoid;
      break-inside: avoid;
      border: 1px solid #e5e7eb;
      border-radius: 5pt;
      background-color: #f8fafc;
      overflow: hidden;
    }
    .code-lang {
      background-color: #e2e8f0;
      color: #475569;
      font-size: 8pt;
      font-family: "SFMono-Regular", Consolas, monospace;
      padding: 2pt 8pt;
      border-bottom: 1px solid #cbd5e1;
      text-transform: uppercase;
    }
    pre {
      margin: 0;
      padding: 8pt 10pt;
      overflow-x: auto;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    pre code {
      background: transparent;
      padding: 0;
      color: #1e293b;
      font-size: 8.5pt;
      line-height: 1.5;
    }
    blockquote {
      margin: 8pt 0 12pt 0;
      padding: 6pt 12pt;
      border-left: 3pt solid #9ca3af;
      background-color: #f9fafb;
      color: #4b5563;
    }
    .alert {
      margin: 8pt 0 12pt 0;
      padding: 8pt 12pt;
      border-left: 3.5pt solid #3b82f6;
      background-color: #eff6ff;
      border-radius: 3pt;
      page-break-inside: avoid;
    }
    .alert-title {
      font-weight: 700;
      font-size: 9.5pt;
      margin-bottom: 3pt;
    }
    .alert-warning, .alert-caution {
      border-left-color: #f59e0b;
      background-color: #fffbeb;
    }
    .alert-important {
      border-left-color: #8b5cf6;
      background-color: #f5f3ff;
    }
    hr {
      border: none;
      border-top: 1px solid #e5e7eb;
      margin: 14pt 0;
    }
    .page-break {
      page-break-before: always;
      break-before: page;
    }
    a {
      color: #2563eb;
      text-decoration: none;
    }
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

function findHeadlessBrowser(customBrowserPath) {
  if (customBrowserPath && fs.existsSync(customBrowserPath)) {
    return customBrowserPath;
  }
  if (process.env.SA_SPEC_BROWSER && fs.existsSync(process.env.SA_SPEC_BROWSER)) {
    return process.env.SA_SPEC_BROWSER;
  }

  const candidates = [];
  if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      "/Applications/Chromium.app/Contents/MacOS/Chromium"
    );
  } else if (process.platform === "win32") {
    const programFiles = process.env["PROGRAMFILES"] || "C:\\Program Files";
    const programFilesX86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
    const localAppData = process.env["LOCALAPPDATA"] || "";
    candidates.push(
      path.join(programFiles, "Google\\Chrome\\Application\\chrome.exe"),
      path.join(programFilesX86, "Google\\Chrome\\Application\\chrome.exe"),
      path.join(localAppData, "Google\\Chrome\\Application\\chrome.exe"),
      path.join(programFiles, "Microsoft\\Edge\\Application\\msedge.exe"),
      path.join(programFilesX86, "Microsoft\\Edge\\Application\\msedge.exe"),
      path.join(programFiles, "BraveSoftware\\Brave-Browser\\Application\\brave.exe")
    );
  } else {
    const linuxBins = [
      "google-chrome",
      "google-chrome-stable",
      "chromium",
      "chromium-browser",
      "microsoft-edge",
      "brave-browser"
    ];
    for (const bin of linuxBins) {
      const whichRes = spawnSync("which", [bin], { encoding: "utf8" });
      if (whichRes.status === 0 && whichRes.stdout.trim()) {
        return whichRes.stdout.trim();
      }
    }
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function renderHtmlToPdf(htmlContent, outputPdfPath, customBrowserPath) {
  const browser = findHeadlessBrowser(customBrowserPath);
  const absPdfPath = path.resolve(outputPdfPath);
  fs.mkdirSync(path.dirname(absPdfPath), { recursive: true });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sa-spec-pdf-"));
  const tmpHtmlPath = path.join(tmpDir, "spec.html");
  fs.writeFileSync(tmpHtmlPath, htmlContent, "utf8");

  try {
    if (browser) {
      const fileUrl = pathToFileURL(tmpHtmlPath).href;
      const profileDir = path.join(tmpDir, "profile");
      const commonFlags = [
        "--disable-gpu",
        "--no-sandbox",
        "--disable-crash-reporter",
        "--no-first-run",
        "--no-default-browser-check",
        `--user-data-dir=${profileDir}`,
        "--no-pdf-header-footer",
        `--print-to-pdf=${absPdfPath}`,
        fileUrl
      ];

      // Try modern --headless=new first, fallback to --headless
      let res = spawnSync(browser, ["--headless=new", ...commonFlags], {
        encoding: "utf8",
        timeout: 30000
      });

      if (res.status !== 0 || !fs.existsSync(absPdfPath)) {
        res = spawnSync(browser, ["--headless", ...commonFlags], {
          encoding: "utf8",
          timeout: 30000
        });
      }

      if (fs.existsSync(absPdfPath)) {
        return { ok: true, engine: path.basename(browser), pdfPath: absPdfPath };
      }
    }

    // Fallback: wkhtmltopdf if available
    const wkWhich = spawnSync("which", ["wkhtmltopdf"], { encoding: "utf8" });
    if (wkWhich.status === 0 && wkWhich.stdout.trim()) {
      const wkBin = wkWhich.stdout.trim();
      const wkRes = spawnSync(wkBin, ["--enable-local-file-access", tmpHtmlPath, absPdfPath], {
        encoding: "utf8",
        timeout: 30000
      });
      if (wkRes.status === 0 && fs.existsSync(absPdfPath)) {
        return { ok: true, engine: "wkhtmltopdf", pdfPath: absPdfPath };
      }
    }

    return {
      ok: false,
      error: browser
        ? "瀏覽器 Headless PDF 轉換失敗（請確認終端機權限或瀏覽器狀態）。"
        : "未偵測到本機 Chrome / Edge / Brave / Chromium 瀏覽器或 wkhtmltopdf。"
    };
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

function convertMarkdownFileToPdf(mdFilePath, outputPdfPath, customBrowserPath) {
  const absMdPath = path.resolve(mdFilePath);
  if (!fs.existsSync(absMdPath)) {
    return { ok: false, error: `找不到檔案: ${mdFilePath}` };
  }
  const content = fs.readFileSync(absMdPath, "utf8");
  const title = path.basename(absMdPath, path.extname(absMdPath));
  const targetPdf = outputPdfPath
    ? path.resolve(outputPdfPath)
    : path.join(path.dirname(absMdPath), `${title}.pdf`);
  const html = buildHtmlDocument(title, content);
  return renderHtmlToPdf(html, targetPdf, customBrowserPath);
}

function buildMergedRequirementMarkdown(reqDir) {
  const dirName = path.basename(reqDir);
  const sections = [];

  const mdOrder = [
    { file: "srs.md", label: "SRS 需求規格書" },
    { file: "db-schema.md", label: "DB Schema 資料庫規格" },
    { file: "openapi.yaml", label: "OpenAPI 介面規格", isYaml: true },
    { file: "handoff.md", label: "Handoff 開發交接摘要" },
    { file: "history.md", label: "History 版本歷程" }
  ];

  for (const item of mdOrder) {
    const filePath = path.join(reqDir, item.file);
    if (!fs.existsSync(filePath)) continue;
    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (!raw) continue;

    if (item.isYaml) {
      sections.push(`# ${item.label} (\`${item.file}\`)\n\n\`\`\`yaml\n${raw}\n\`\`\``);
    } else {
      sections.push(raw);
    }
  }

  const umlDir = path.join(reqDir, "uml");
  if (fs.existsSync(umlDir)) {
    const pumlFiles = fs
      .readdirSync(umlDir)
      .filter((f) => f.endsWith(".puml"))
      .sort();
    if (pumlFiles.length > 0) {
      const umlBlocks = pumlFiles.map((f) => {
        const pumlContent = fs.readFileSync(path.join(umlDir, f), "utf8").trim();
        return `## \`uml/${f}\`\n\n\`\`\`plantuml\n${pumlContent}\n\`\`\``;
      });
      sections.push(`# UML 圖表規格 (\`uml/\`)\n\n${umlBlocks.join("\n\n")}`);
    }
  }

  return {
    title: dirName,
    markdown: sections.join("\n\n<!-- pagebreak -->\n\n")
  };
}

module.exports = {
  buildHtmlDocument,
  convertMarkdownFileToPdf,
  buildMergedRequirementMarkdown,
  renderHtmlToPdf
};
