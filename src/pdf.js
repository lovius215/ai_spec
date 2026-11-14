const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { spawnSync } = require("child_process");
const { pathToFileURL } = require("url");

const PLANTUML_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";

function encodePlantUml6bit(b) {
  return PLANTUML_ALPHABET[b & 0x3f] || "?";
}

function appendPlantUml3Bytes(b1, b2, b3) {
  const c1 = b1 >> 2;
  const c2 = ((b1 & 0x3) << 4) | (b2 >> 4);
  const c3 = ((b2 & 0xf) << 2) | (b3 >> 6);
  const c4 = b3 & 0x3f;
  return (
    encodePlantUml6bit(c1) +
    encodePlantUml6bit(c2) +
    encodePlantUml6bit(c3) +
    encodePlantUml6bit(c4)
  );
}

function encodePlantUml(source) {
  const deflated = zlib.deflateRawSync(Buffer.from(String(source || ""), "utf8"), { level: 9 });
  let out = "";
  for (let i = 0; i < deflated.length; i += 3) {
    if (i + 2 === deflated.length) {
      out += appendPlantUml3Bytes(deflated[i], deflated[i + 1], 0);
    } else if (i + 1 === deflated.length) {
      out += appendPlantUml3Bytes(deflated[i], 0, 0);
    } else {
      out += appendPlantUml3Bytes(deflated[i], deflated[i + 1], deflated[i + 2]);
    }
  }
  return out;
}

function sanitizeSvg(svg) {
  return String(svg || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<script\b[^>]*\/>/gi, "")
    .replace(/<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/<foreignObject\b[^>]*\/>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/((?:xlink:)?href\s*=\s*)(["'])\s*(?:javascript|vbscript|data:text\/html)[\s\S]*?\2/gi, "$1$2#$2")
    .replace(/((?:xlink:)?href\s*=\s*)(?:javascript|vbscript|data:text\/html)[^\s>]*/gi, '$1"#"');
}

function sanitizeUrl(rawUrl) {
  const trimmed = String(rawUrl || "").trim();
  const normalized = trimmed.replace(/[\u0000-\u0020]+/g, "").toLowerCase();
  if (
    normalized.startsWith("javascript:") ||
    normalized.startsWith("vbscript:") ||
    normalized.startsWith("data:text/html")
  ) {
    return "#";
  }
  return trimmed;
}

function renderPlantUmlToSvg(source, options = {}) {
  if (options.noUmlRender) return null;

  // 1. Prefer local plantuml CLI for fast offline rendering
  const whichCmd = process.platform === "win32" ? "where" : "which";
  const localBin = spawnSync(whichCmd, ["plantuml"], { encoding: "utf8" });
  if (localBin.status === 0 && localBin.stdout.trim()) {
    const plantumlBin = localBin.stdout.trim().split(/\r?\n/)[0].trim();
    const res = spawnSync(plantumlBin, ["-tsvg", "-pipe", "-charset", "UTF-8"], {
      input: source,
      encoding: "utf8",
      timeout: 10000,
      shell: process.platform === "win32" && /\.(?:bat|cmd)$/i.test(plantumlBin)
    });
    if (res.status === 0 && res.stdout && res.stdout.includes("<svg")) {
      const svgMatch = res.stdout.match(/<svg[\s\S]*<\/svg>/i);
      if (svgMatch) return sanitizeSvg(svgMatch[0]);
    }
  }

  // 2. Opt-in remote PlantUML server SVG rendering (never send diagrams to public server by default)
  const customServer = options.umlServerUrl || process.env.SA_SPEC_PLANTUML_SERVER;
  const allowNetwork =
    process.env.SA_SPEC_NO_UML_NET !== "1" &&
    !options.offlineUml &&
    (options.onlineUml === true || Boolean(customServer));
  if (!allowNetwork) {
    return null;
  }
  const baseUrl = (customServer || "https://www.plantuml.com/plantuml").replace(/\/+$/, "");
  const encoded = encodePlantUml(source);
  const curlRes = spawnSync("curl", ["-fsSL", "--max-time", "4", `${baseUrl}/svg/${encoded}`], {
    encoding: "utf8",
    timeout: 5000
  });
  if (curlRes.status === 0 && curlRes.stdout && curlRes.stdout.includes("<svg")) {
    const svgMatch = curlRes.stdout.match(/<svg[\s\S]*<\/svg>/i);
    if (svgMatch) return sanitizeSvg(svgMatch[0]);
  }

  return null;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatInlineStyles(str) {
  let processed = String(str);
  // Bold + Italic
  processed = processed.replace(/\*\*\*((?:(?!\*\*\*).)+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  // Bold (allow single '*' inside **...**, and single '_' inside __...__ without intraword triggers)
  processed = processed.replace(/\*\*((?:(?!\*\*).)+?)\*\*/g, "<strong>$1</strong>");
  processed = processed.replace(/(^|[^\w])__((?:(?!__).)+?)__(?=[^\w]|$)/g, "$1<strong>$2</strong>");
  // Italic (avoid matching spaced math operators such as "2 * 3 * 4")
  processed = processed.replace(/\*(?!\s|\*)([^*\n]*?[^\s*])\*/g, "<em>$1</em>");
  // Strikethrough
  processed = processed.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  return processed;
}

function parseInline(text) {
  if (!text) return "";
  const tokens = [];
  const holdToken = (html) => {
    const idx = tokens.length;
    tokens.push(html);
    return `\x00TOK_${idx}\x00`;
  };

  let processed = String(text).replace(/(`+)([\s\S]+?)\1/g, (_, ticks, code) => {
    const cleaned = ticks.length > 1 && /^ [\s\S]* $/.test(code) ? code.slice(1, -1) : code;
    return holdToken(`<code>${escapeHtml(cleaned)}</code>`);
  });

  processed = processed.replace(/<!--[\s\S]*?-->/g, "");
  processed = processed.replace(/<br\s*\/?>/gi, "\x00BR\x00");
  processed = escapeHtml(processed);
  processed = processed.replace(/\x00BR\x00/g, "<br/>");

  // Images: ![alt](src) - protect attributes before style formatting (supports balanced parens in URLs)
  processed = processed.replace(/!\[([^\]]*)\]\(((?:[^()]|\([^()]*\))+)\)/g, (_, alt, src) => {
    return holdToken(`<img alt="${alt}" src="${sanitizeUrl(src)}" style="max-width:100%;" />`);
  });

  // Links: [text](url) - format link text only, protect href from __ / * replacement (supports balanced parens in URLs)
  processed = processed.replace(/\[([^\]]+)\]\(((?:[^()]|\([^()]*\))+)\)/g, (_, label, href) => {
    return holdToken(`<a href="${sanitizeUrl(href)}">${formatInlineStyles(label)}</a>`);
  });

  processed = formatInlineStyles(processed);

  while (/\x00TOK_(\d+)\x00/.test(processed)) {
    processed = processed.replace(/\x00TOK_(\d+)\x00/g, (_, idx) => tokens[Number(idx)]);
  }
  return processed;
}

function parseTableRow(line) {
  const placeholder = "\x00PIPE\x00";
  const escapedProtected = String(line).trim().replace(/\\\|/g, placeholder);
  const protectedLine = escapedProtected.replace(
    /(`+)([\s\S]+?)\1/g,
    (_, ticks, code) => `${ticks}${code.replace(/\|/g, placeholder)}${ticks}`
  );
  const trimmed = protectedLine.replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.replace(/\x00PIPE\x00/g, "|").trim());
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

function matchFenceOpen(line) {
  const backtickMatch = line.match(/^ {0,3}(`{3,})([^`\n]*)$/);
  if (backtickMatch) {
    const infoTokens = backtickMatch[2].trim();
    return {
      fence: backtickMatch[1],
      lang: infoTokens ? infoTokens.split(/\s+/)[0] : ""
    };
  }
  const tildeMatch = line.match(/^ {0,3}(~{3,})(.*)$/);
  if (tildeMatch) {
    const infoTokens = tildeMatch[2].trim();
    return {
      fence: tildeMatch[1],
      lang: infoTokens ? infoTokens.split(/\s+/)[0] : ""
    };
  }
  return null;
}

function pushAfterCommentParagraph(out, closingLine) {
  const afterComment = closingLine.slice(closingLine.indexOf("-->") + 3).trim();
  if (!afterComment) return;
  const renderedAfter = parseInline(afterComment);
  if (renderedAfter.trim()) {
    out.push(`<p>${renderedAfter}</p>`);
  }
}

function markdownToHtmlBody(markdown, options = {}) {
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

    // Single or multi-line HTML comment (excluding pagebreak handled above)
    if (line.trim().startsWith("<!--")) {
      if (line.includes("-->")) {
        pushAfterCommentParagraph(out, line);
        i++;
        continue;
      }
      i++;
      while (i < lines.length && !lines[i].includes("-->")) {
        i++;
      }
      if (i < lines.length) {
        pushAfterCommentParagraph(out, lines[i]);
        i++;
      }
      continue;
    }

    // Empty line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Fenced code block (``` or ````)
    const fenceMatch = matchFenceOpen(line);
    if (fenceMatch) {
      const { fence, lang } = fenceMatch;
      const codeLines = [];
      const closeFenceRegex = new RegExp(`^\\s*${fence[0]}{${fence.length},}\\s*$`);
      i++;
      while (i < lines.length && !closeFenceRegex.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing fence
      const rawCode = codeLines.join("\n");
      const lowerLang = lang.toLowerCase();
      if (lowerLang === "plantuml" || lowerLang === "puml") {
        const svg = renderPlantUmlToSvg(rawCode, options);
        if (svg) {
          out.push(`<div class="uml-diagram">${svg}</div>`);
          continue;
        }
      }
      const langLabel = lang ? `<div class="code-lang">${escapeHtml(lang)}</div>` : "";
      out.push(
        `<div class="code-block">${langLabel}<pre><code class="language-${escapeHtml(lang)}">${escapeHtml(
          rawCode
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
      while (i < lines.length) {
        const rowTrim = lines[i].trim();
        if (
          !rowTrim ||
          !rowTrim.includes("|") ||
          /^(?:#{1,6}\s|>|<!--|(?:[-*+]|\d+[.)])\s)/.test(rowTrim) ||
          Boolean(matchFenceOpen(lines[i]))
        ) {
          break;
        }
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

    // Unordered or Ordered List (supports nested indentation)
    const ulMatch = line.match(/^(\s*)([-*+])\s+(.+)$/);
    const olMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
    if (ulMatch || olMatch) {
      const renderListItem = (rawText) => {
        const taskMatch = rawText.match(/^\[([ xX])\]\s+(.+)$/);
        if (taskMatch) {
          const checked = taskMatch[1].toLowerCase() === "x";
          return `<input type="checkbox" disabled ${checked ? "checked" : ""} /> ${parseInline(taskMatch[2])}`;
        }
        return parseInline(rawText);
      };

      const stack = [];
      let listHtml = "";
      while (i < lines.length) {
        const cur = lines[i];
        const mUl = cur.match(/^(\s*)([-*+])\s+(.+)$/);
        const mOl = cur.match(/^(\s*)(\d+)\.\s+(.+)$/);
        const m = mUl || mOl;
        if (!m) break;

        const indent = m[1].replace(/\t/g, "  ").length;
        const tag = mOl ? "ol" : "ul";
        const content = renderListItem(m[3]);

        if (stack.length === 0) {
          listHtml += `<${tag}><li>${content}`;
          stack.push({ indent, tag });
        } else {
          const top = stack[stack.length - 1];
          if (indent >= top.indent + 2) {
            listHtml += `<${tag}><li>${content}`;
            stack.push({ indent, tag });
          } else {
            while (stack.length > 1 && indent < stack[stack.length - 1].indent) {
              const popped = stack.pop();
              listHtml += `</li></${popped.tag}>`;
            }
            if (stack[stack.length - 1].tag !== tag) {
              const popped = stack.pop();
              listHtml += `</li></${popped.tag}><${tag}><li>${content}`;
              stack.push({ indent, tag });
            } else {
              listHtml += `</li><li>${content}`;
            }
          }
        }
        i++;
      }
      while (stack.length > 0) {
        const popped = stack.pop();
        listHtml += `</li></${popped.tag}>`;
      }
      out.push(listHtml);
      continue;
    }

    // Paragraph
    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].match(/^(#{1,6})\s+/) &&
      !matchFenceOpen(lines[i]) &&
      !lines[i].trim().startsWith(">") &&
      !lines[i].match(/^(\s*)([-*+]|\d+\.)\s+/) &&
      !/^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith("<!--") &&
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

function buildHtmlDocument(title, markdownContent, options = {}) {
  const bodyHtml = markdownToHtmlBody(markdownContent, options);
  const htmlLang = options.lang || "zh-TW";
  return `<!DOCTYPE html>
<html lang="${escapeHtml(htmlLang)}">
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
    .uml-diagram {
      margin: 10pt 0 14pt 0;
      padding: 10pt;
      border: 1px solid #e5e7eb;
      border-radius: 5pt;
      background-color: #ffffff;
      text-align: center;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .uml-diagram svg {
      max-width: 100%;
      height: auto;
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
    const whichCmd = process.platform === "win32" ? "where" : "which";
    const wkWhich = spawnSync(whichCmd, ["wkhtmltopdf"], { encoding: "utf8" });
    if (wkWhich.status === 0 && wkWhich.stdout.trim()) {
      const wkBin = wkWhich.stdout.trim().split(/\r?\n/)[0].trim();
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

function convertMarkdownFileToPdf(mdFilePath, outputPdfPath, customBrowserPath, options = {}) {
  const absMdPath = path.resolve(mdFilePath);
  if (!fs.existsSync(absMdPath) || !fs.statSync(absMdPath).isFile()) {
    return { ok: false, error: `找不到 Markdown 檔案: ${mdFilePath}` };
  }
  const content = fs.readFileSync(absMdPath, "utf8");
  const title = path.basename(absMdPath, path.extname(absMdPath));
  const targetPdf = outputPdfPath
    ? path.resolve(outputPdfPath)
    : path.join(path.dirname(absMdPath), `${title}.pdf`);
  const html = buildHtmlDocument(title, content, options);
  return renderHtmlToPdf(html, targetPdf, customBrowserPath);
}

const MERGED_PDF_LABELS = {
  "zh-tw": { openapi: "OpenAPI 介面規格", uml: "UML 圖表規格" },
  en: { openapi: "OpenAPI Specification", uml: "UML Diagrams" },
  "zh-cn": { openapi: "OpenAPI 接口规格", uml: "UML 图表规格" },
  ja: { openapi: "OpenAPI インターフェース仕様", uml: "UML ダイアグラム仕様" },
  ko: { openapi: "OpenAPI 인터페이스 사양", uml: "UML 다이어그램 사양" }
};

function wrapCodeFence(content, lang = "") {
  const text = String(content || "");
  const matches = text.match(/`+/g) || [];
  const maxTicks = matches.reduce((max, run) => Math.max(max, run.length), 2);
  const fence = "`".repeat(maxTicks + 1);
  return `${fence}${lang}\n${text}\n${fence}`;
}

function buildMergedRequirementMarkdown(reqDir, options = {}) {
  const dirName = path.basename(reqDir);
  const langKey = String(options.lang || "zh-TW").toLowerCase().trim().replace(/_/g, "-");
  const labels = MERGED_PDF_LABELS[langKey] || MERGED_PDF_LABELS["zh-tw"];
  const sections = [];

  const mdOrder = [
    { file: "srs.md" },
    { file: "db-schema.md" },
    { file: "openapi.yaml", label: labels.openapi, isYaml: true },
    { file: "handoff.md" },
    { file: "history.md" }
  ];

  for (const item of mdOrder) {
    const filePath = path.join(reqDir, item.file);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) continue;
    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (!raw) continue;

    if (item.isYaml) {
      sections.push(`# ${item.label} (\`${item.file}\`)\n\n${wrapCodeFence(raw, "yaml")}`);
    } else {
      sections.push(raw);
    }
  }

  const umlDir = path.join(reqDir, "uml");
  if (fs.existsSync(umlDir) && fs.statSync(umlDir).isDirectory()) {
    const pumlFiles = fs
      .readdirSync(umlDir)
      .filter((f) => {
        if (!f.toLowerCase().endsWith(".puml")) return false;
        return fs.statSync(path.join(umlDir, f)).isFile();
      })
      .sort();
    if (pumlFiles.length > 0) {
      const umlBlocks = pumlFiles.map((f) => {
        const pumlContent = fs.readFileSync(path.join(umlDir, f), "utf8").trim();
        return `## \`uml/${f}\`\n\n${wrapCodeFence(pumlContent, "plantuml")}`;
      });
      sections.push(`# ${labels.uml} (\`uml/\`)\n\n${umlBlocks.join("\n\n")}`);
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
  renderHtmlToPdf,
  encodePlantUml,
  renderPlantUmlToSvg,
  sanitizeSvg,
  sanitizeUrl
};
