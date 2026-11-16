const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { extractSpecVersion, extractStatusFromContent, parseIndexRows } = require("./i18n");

const REQUIRED_DELIVERABLES = [
  "srs.md",
  "uml",
  "openapi.yaml",
  "db-schema.md",
  "handoff.md",
  "history.md"
];

function isExistingDir(targetPath) {
  return fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory();
}

function isExistingFile(targetPath) {
  return fs.existsSync(targetPath) && fs.statSync(targetPath).isFile();
}

function isReqDirName(dirName) {
  return /^REQ-\d+(?:-|$)/i.test(String(dirName || ""));
}

function normalizeReqIdKey(rawId) {
  const m = String(rawId || "").trim().match(/^REQ-(\d+)/i);
  if (!m) return null;
  const num = parseInt(m[1], 10);
  return `REQ-${String(num).padStart(Math.max(3, String(num).length), "0")}`;
}

function checkRequiredPaths(cwd, heading, options = {}) {
  const { silent = false } = options;
  const requiredPaths = [
    "AGENTS.md",
    path.join("project", "index.md"),
    path.join("project", "system-spec.md")
  ];

  const missingPaths = [];
  if (heading && !silent) {
    console.log(heading);
  }

  for (const relativePath of requiredPaths) {
    const exists = isExistingFile(path.join(cwd, relativePath));
    if (!silent) {
      console.log(`${exists ? "OK" : "MISSING"} ${relativePath}`);
    }
    if (!exists) {
      missingPaths.push(relativePath);
    }
  }

  if (missingPaths.length > 0) {
    process.exitCode = 1;
  }

  return silent ? { ok: missingPaths.length === 0, missingPaths } : missingPaths.length === 0;
}

function checkSpecVersion(cwd, packageVersion, options = {}) {
  const { silent = false } = options;
  const systemSpecPath = path.join(cwd, "project", "system-spec.md");
  if (!isExistingFile(systemSpecPath)) {
    return { status: "missing", recorded: null, current: packageVersion };
  }
  const content = fs.readFileSync(systemSpecPath, "utf8");
  const recorded = extractSpecVersion(content);
  if (!recorded) {
    if (!silent) {
      console.log(`規範版本: WARNING (project/system-spec.md 未記錄版號，目前 CLI 為 ${packageVersion}，建議執行 sa-spec upgrade 寫入版本鎖定)`);
    }
    return { status: "untracked", recorded: null, current: packageVersion };
  }
  if (recorded !== packageVersion) {
    if (!silent) {
      console.log(`規範版本: WARNING (專案記錄為 ${recorded}，目前 CLI 為 ${packageVersion}，建議團隊對齊版本或執行 sa-spec upgrade)`);
    }
    return { status: "mismatch", recorded, current: packageVersion };
  }
  if (!silent) {
    console.log(`規範版本: OK (${recorded})`);
  }
  return { status: "ok", recorded, current: packageVersion };
}

function checkDuplicateReqIds(cwd, options = {}) {
  const { silent = false } = options;
  const projectDir = path.join(cwd, "project");
  if (!isExistingDir(projectDir)) return silent ? [] : true;

  const entries = fs.readdirSync(projectDir, { withFileTypes: true });
  const idDirsMap = new Map();
  for (const entry of entries) {
    if (entry.isDirectory() && isReqDirName(entry.name)) {
      const id = normalizeReqIdKey(entry.name);
      if (id) {
        if (!idDirsMap.has(id)) idDirsMap.set(id, []);
        idDirsMap.get(id).push(entry.name);
      }
    }
  }

  const duplicates = [];
  for (const [id, dirs] of idDirsMap.entries()) {
    if (dirs.length > 1) {
      duplicates.push({ id, dirs });
    }
  }

  if (duplicates.length > 0) {
    if (!silent) {
      console.log("序號唯一性: WARNING (發現重複編號)");
      for (const dup of duplicates) {
        console.log(`  - ${dup.id} 重複出現在: ${dup.dirs.join(", ")}`);
      }
      console.log("  提示：請將衝突目錄重新定號以維持序號連續與唯一。");
    }
    return silent ? duplicates : false;
  }

  if (!silent) {
    console.log("序號唯一性: OK");
  }
  return silent ? [] : true;
}

function checkIndexSync(cwd, options = {}) {
  const { silent = false } = options;
  const projectDir = path.join(cwd, "project");
  const indexPath = path.join(projectDir, "index.md");
  if (!isExistingDir(projectDir) || !isExistingFile(indexPath)) {
    return silent ? { ok: true, missingInIndex: [], orphanInIndex: [] } : true;
  }

  const entries = fs.readdirSync(projectDir, { withFileTypes: true });
  const dirIds = new Set();
  for (const entry of entries) {
    if (entry.isDirectory() && isReqDirName(entry.name)) {
      const id = normalizeReqIdKey(entry.name);
      if (id) {
        dirIds.add(id);
      }
    }
  }

  const rows = parseIndexRows(fs.readFileSync(indexPath, "utf8"));
  const indexedIds = new Set(
    rows
      .map((r) => normalizeReqIdKey(r.id) || String(r.id || "").trim().toUpperCase())
      .filter(Boolean)
  );

  const missingInIndex = Array.from(dirIds).filter((id) => !indexedIds.has(id)).sort();
  const orphanInIndex = Array.from(indexedIds).filter((id) => !dirIds.has(id)).sort();

  if (missingInIndex.length > 0 || orphanInIndex.length > 0) {
    if (!silent) {
      console.log("索引同步檢查: WARNING (project/index.md 與實際 REQ-* 目錄不同步)");
      if (missingInIndex.length > 0) {
        console.log(`  - 目錄已存在但 index.md 漏列: ${missingInIndex.join(", ")}`);
      }
      if (orphanInIndex.length > 0) {
        console.log(`  - index.md 有紀錄但找不到對應目錄: ${orphanInIndex.join(", ")}`);
      }
      console.log("  修復建議：請執行 sa-spec reindex 重建索引。");
    }
    return silent ? { ok: false, missingInIndex, orphanInIndex } : false;
  }

  if (!silent) {
    console.log("索引同步檢查: OK");
  }
  return silent ? { ok: true, missingInIndex: [], orphanInIndex: [] } : true;
}

function readDeliverableIfFile(reqAbsDir, fileName, issues) {
  const fileAbs = path.join(reqAbsDir, fileName);
  if (!fs.existsSync(fileAbs)) return null;
  if (!fs.statSync(fileAbs).isFile()) {
    issues.push(`${fileName} 必須為檔案而非目錄`);
    return null;
  }
  return fs.readFileSync(fileAbs, "utf8");
}

function validateSingleRequirementDir(reqAbsDir, reqDirName, options = {}) {
  const { isDraft = false } = options;
  const issues = [];

  for (const item of REQUIRED_DELIVERABLES) {
    if (!fs.existsSync(path.join(reqAbsDir, item))) {
      issues.push(`缺少必要交付物: ${item}`);
    }
  }

  // Check leftover {{REQ_ID}} placeholder (allowed in draft dirs before finalize)
  const deliverableContents = new Map();
  const checkFiles = ["srs.md", "openapi.yaml", "db-schema.md", "handoff.md", "history.md"];
  for (const fileName of checkFiles) {
    const text = readDeliverableIfFile(reqAbsDir, fileName, issues);
    if (text === null) continue;
    deliverableContents.set(fileName, text);
    if (!isDraft && text.includes("{{REQ_ID}}")) {
      issues.push(`${fileName} 仍殘留未替換的 {{REQ_ID}} 佔位符`);
    }
  }

  // Validate PlantUML single-diagram-per-file rule
  const umlDir = path.join(reqAbsDir, "uml");
  if (fs.existsSync(umlDir)) {
    if (!fs.statSync(umlDir).isDirectory()) {
      issues.push("uml/ 必須為目錄而非檔案");
    } else {
      const pumlFiles = fs
        .readdirSync(umlDir)
        .filter((f) => f.toLowerCase().endsWith(".puml"));
      let validPumlCount = 0;
      for (const f of pumlFiles) {
        const pumlAbs = path.join(umlDir, f);
        if (!fs.statSync(pumlAbs).isFile()) {
          issues.push(`uml/${f} 必須為檔案而非目錄`);
          continue;
        }
        validPumlCount += 1;
        const pumlText = fs.readFileSync(pumlAbs, "utf8");
        if (!isDraft && pumlText.includes("{{REQ_ID}}")) {
          issues.push(`uml/${f} 仍殘留未替換的 {{REQ_ID}} 佔位符`);
        }
        const startCount = (pumlText.match(/@start\w+/gi) || []).length;
        const endCount = (pumlText.match(/@end\w+/gi) || []).length;
        if (startCount !== 1 || endCount !== 1) {
          issues.push(`uml/${f} 違反單檔單圖原則 (@start=${startCount}, @end=${endCount})`);
        }
      }
      if (validPumlCount === 0) {
        issues.push("uml/ 目錄內沒有任何 .puml 檔案");
      }
    }
  }

  // Validate srs.md status and required sections
  const srsText = deliverableContents.get("srs.md");
  if (srsText !== undefined) {
    if (!extractStatusFromContent(srsText)) {
      issues.push("srs.md 缺少狀態欄位 (- 狀態：...)");
    }
    const hasSummary = /^##\s+.*(?:摘要|Summary|概要|요약)/im.test(srsText);
    const hasFunctional = /^##\s+.*(?:功能需求|Functional Requirements|機能要件|기능 요구사항)/im.test(srsText);
    const hasAcceptance = /^##\s+.*(?:驗收|验收|受入|인수|Acceptance)/im.test(srsText);
    if (!hasSummary || !hasFunctional || !hasAcceptance) {
      issues.push("srs.md 缺少關鍵章節（需包含摘要、功能需求、驗收條件）");
    }
  }

  // Validate handoff.md key sections (multi-language aware)
  const handoffText = deliverableContents.get("handoff.md");
  if (handoffText !== undefined) {
    const hasApi = /##\s*.*(?:API)/i.test(handoffText);
    const hasDb = /##\s*.*(?:DB|資料庫|数据库|データベース|데이터베이스)/i.test(handoffText);
    const hasUi = /(?:##\s*.*(?:UI|畫面|界面|画面|화면)|無\s*UI|No UI|无\s*UI|UI 要件なし|UI 요구사항 없음)/i.test(handoffText);
    const hasAcceptance = /##\s*.*(?:驗收|验收|受入|인수|Acceptance)/i.test(handoffText);
    if (!hasApi) issues.push("handoff.md 缺少 API 契約章節");
    if (!hasDb) issues.push("handoff.md 缺少 DB 變更章節");
    if (!hasUi) issues.push("handoff.md 缺少 UI / 畫面規格或無 UI 標記");
    if (!hasAcceptance) issues.push("handoff.md 缺少驗收條件章節");
  }

  // Validate openapi.yaml basic contract & YAML structure
  const openapiText = deliverableContents.get("openapi.yaml");
  if (openapiText !== undefined) {
    const explicitNoApi = /(?:無\s*API|No API|無需\s*API|无\s*API|API\s*不要|API\s*불필요)/i.test(openapiText);
    if (!explicitNoApi && (!/^openapi\s*:/m.test(openapiText) || !/^paths\s*:/m.test(openapiText))) {
      issues.push("openapi.yaml 缺少 openapi: 或 paths: 宣告");
    }
    if (!explicitNoApi && (!/^info\s*:/m.test(openapiText) || !/^\s+title\s*:/m.test(openapiText) || !/^\s+version\s*:/m.test(openapiText))) {
      issues.push("openapi.yaml 缺少 info / title / version 必要欄位");
    }
    if (/^\s*title\s*:[ \t]*(?!["'\s])[^\n]*:[ \t]/m.test(openapiText)) {
      issues.push("openapi.yaml 的 title 欄位含未加引號的冒號，將導致 YAML 解析失敗");
    }
    const yamlLines = openapiText.split(/\r?\n/);
    let hasTabIndent = false;
    let blockScalarIndent = null;
    for (let idx = 0; idx < yamlLines.length; idx++) {
      const line = yamlLines[idx];
      if (!line.trim() || /^\s*#/.test(line)) continue;
      const indent = (line.match(/^([ \t]*)/) || ["", ""])[1];
      if (indent.includes("\t")) {
        hasTabIndent = true;
        break;
      }
      const indentLen = indent.length;
      if (blockScalarIndent !== null) {
        if (indentLen > blockScalarIndent) continue;
        blockScalarIndent = null;
      }
      const keyValMatch = line.match(/^[ ]*[^#\s][^:]*:[ \t]*(.*)$/);
      if (keyValMatch) {
        const val = keyValMatch[1].replace(/\s+#.*$/, "").trim();
        if (/^[|>][+-]?\d*$/.test(val)) {
          blockScalarIndent = indentLen;
          continue;
        }
        if (val && !/^[\[{&*]/.test(val)) {
          // Scalar value on this line: next non-empty/non-comment line cannot indent deeper
          for (let j = idx + 1; j < yamlLines.length; j++) {
            const nextLine = yamlLines[j];
            if (!nextLine.trim() || /^\s*#/.test(nextLine)) continue;
            const nextIndentLen = (nextLine.match(/^( *)/) || ["", ""])[1].length;
            if (nextIndentLen > indentLen) {
              issues.push(`openapi.yaml YAML 結構異常：第 ${idx + 1} 行已設定純量值，第 ${j + 1} 行不可再增加子層縮排`);
            }
            break;
          }
        }
      }
    }
    if (hasTabIndent) {
      issues.push("openapi.yaml 禁止使用 Tab 字元縮排（YAML 僅允許空格縮排）");
    }
  }

  // Validate db-schema.md basic section structure
  const dbText = deliverableContents.get("db-schema.md");
  if (dbText !== undefined) {
    if (!/^##\s+/m.test(dbText)) {
      issues.push("db-schema.md 缺少資料表/規格章節標題 (## ...)");
    }
  }

  // Validate history.md contains Markdown table
  const historyText = deliverableContents.get("history.md");
  if (historyText !== undefined) {
    if (!/^\|.+\|$/m.test(historyText)) {
      issues.push("history.md 缺少版本歷程 Markdown 表格");
    }
  }

  // Cross-file contradiction checks (UI vs wireframe, SRS vs handoff status, OpenAPI vs handoff API)
  const wireframeAbs = path.join(umlDir, "wireframe.puml");
  const hasWireframeFile = isExistingFile(wireframeAbs);
  if (hasWireframeFile) {
    const wireframeText = fs.readFileSync(wireframeAbs, "utf8");
    if (!/@startsalt\b/i.test(wireframeText) || !/@endsalt\b/i.test(wireframeText)) {
      issues.push("uml/wireframe.puml 必須使用 PlantUML Salt 語法 (@startsalt ... @endsalt)");
    }
  }

  if (handoffText !== undefined) {
    const uiSectionMatch = handoffText.match(
      /##\s*[^\n]*(?:UI|畫面|界面|画面|화면|Wireframe)[^\n]*\n([\s\S]*?)(?=\n##\s+|$)/i
    );
    const uiSectionLines = (uiSectionMatch ? uiSectionMatch[1] : handoffText)
      .split(/\r?\n/)
      .filter((line) => !/uml\/wireframe\.puml/i.test(line));
    const handoffExplicitNoUi = /(?:無\s*UI|无\s*UI|純後端|纯后端|無介面|无界面|No UI|UI 要件なし|画面なし|バックエンド専用|UI 요구사항 없음|UI 없음|화면 없음|백엔드 전용)/i.test(
      uiSectionLines.join("\n")
    );
    if (handoffExplicitNoUi && hasWireframeFile) {
      issues.push("handoff.md 標記無 UI 介面需求，但 uml/wireframe.puml 同時存在，請釐清是否需要 UI");
    }

    if (srsText !== undefined) {
      const srsStatus = extractStatusFromContent(srsText);
      const handoffStatus = extractStatusFromContent(handoffText);
      const isPendingStatus = (st) => /^(?:待確認|草稿|Pending|Draft|待确认|未確認|確認待ち|ドラフト|확인 대기|초안)/i.test(String(st || "").trim());
      const isApprovedStatus = (st) => /^(?:已審核|已核准|Approved|已审核|承認済み|승인됨)/i.test(String(st || "").trim());
      if (srsStatus && handoffStatus && isPendingStatus(srsStatus) && isApprovedStatus(handoffStatus)) {
        issues.push(`srs.md 狀態為「${srsStatus}」，但 handoff.md 已標示為「${handoffStatus}」，兩者狀態矛盾`);
      }
    }

    if (openapiText !== undefined) {
      const openapiNoApi = /(?:無\s*API|No API|無需\s*API|无\s*API|API\s*不要|API\s*불필요)/i.test(openapiText);
      const hasOpenApiPaths = /^\s{1,4}\/[^\s:]*\s*:/m.test(openapiText);
      const apiSectionMatch = handoffText.match(
        /##\s*[^\n]*API[^\n]*\n([\s\S]*?)(?=\n##\s+|$)/i
      );
      const apiSectionBody = apiSectionMatch ? apiSectionMatch[1] : "";
      const handoffNoApi = /(?:無\s*API|No API|無需\s*API|无\s*API|API\s*不要|API\s*불필요)/i.test(apiSectionBody);
      const handoffHasConcreteEndpoint = /\b(?:GET|POST|PUT|PATCH|DELETE)\s+\/[^\s`)]+/i.test(apiSectionBody);

      if (openapiNoApi && handoffHasConcreteEndpoint) {
        issues.push("openapi.yaml 標記無 API，但 handoff.md 列出具體 API 端點，請保持一致");
      } else if (hasOpenApiPaths && handoffNoApi) {
        issues.push("openapi.yaml 已定義 API paths，但 handoff.md 標記無 API，請保持一致");
      }
    }
  }

  return issues.map((msg) => ({ reqDirName, msg }));
}

function classifyRequirementIssue(reqDirName, msg) {
  const relDir = `project/${reqDirName}`;
  const inferFile = () => {
    const m = msg.match(/(srs\.md|openapi\.yaml|db-schema\.md|handoff\.md|history\.md|uml\/[^\s]+)/i);
    return m ? `${relDir}/${m[1]}` : relDir;
  };
  let rule = "SPEC_VALIDATION";
  let fixHint = `請檢查並補齊 ${relDir} 對應規格內容。`;
  if (msg.includes("缺少必要交付物")) {
    rule = "MISSING_DELIVERABLE";
    fixHint = `補齊 ${relDir} 缺少的必要交付物檔案或目錄。`;
  } else if (msg.includes("{{REQ_ID}}")) {
    rule = "LEFTOVER_REQ_ID_PLACEHOLDER";
    fixHint = "執行 sa-spec finalize --name <slug> 定號並替換 {{REQ_ID}}。";
  } else if (msg.includes("單檔單圖")) {
    rule = "UML_SINGLE_DIAGRAM";
    fixHint = "將每個 .puml 拆分為僅含一組 @start...@end 的獨立檔案。";
  } else if (msg.includes("PlantUML Salt")) {
    rule = "WIREFRAME_SALT_SYNTAX";
    fixHint = "在 uml/wireframe.puml 使用 @startsalt ... @endsalt 語法。";
  } else if (msg.includes("無 UI 介面需求")) {
    rule = "CROSS_FILE_UI_CONFLICT";
    fixHint = "若為純後端請移除 uml/wireframe.puml；若含 UI 請移除 handoff.md 的無 UI 標記。";
  } else if (msg.includes("狀態矛盾")) {
    rule = "CROSS_FILE_STATUS_CONFLICT";
    fixHint = "確認 srs.md 與 handoff.md 的審核狀態一致。";
  } else if (msg.includes("API 端點") || msg.includes("已定義 API paths")) {
    rule = "CROSS_FILE_API_CONFLICT";
    fixHint = "同步更新 openapi.yaml 與 handoff.md 的 API 契約章節。";
  } else if (msg.includes("YAML") || msg.includes("title 欄位") || msg.includes("openapi:")) {
    rule = "OPENAPI_YAML_INVALID";
    fixHint = "修正 openapi.yaml 縮排、欄位與結構（使用空格縮排並包含 openapi/info/paths）。";
  }
  return { reqDirName, msg, rule, file: inferFile(), fixHint };
}

function checkMultiReqScopeLock(cwd, options = {}) {
  const { allowMultiReq = false, strict = false, silent = false } = options;
  const inside = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd, encoding: "utf8" });
  if (inside.status !== 0 || (inside.stdout || "").trim() !== "true") {
    return { ok: true, enforced: strict, modifiedReqDirs: [] };
  }
  const hasHead = spawnSync("git", ["rev-parse", "--verify", "HEAD"], { cwd, encoding: "utf8" });
  if (hasHead.status !== 0) {
    return { ok: true, enforced: strict, modifiedReqDirs: [] };
  }

  const touchedSet = new Set();
  for (const diffArgs of [
    ["diff", "--name-only", "HEAD", "--", "project/"],
    ["diff", "--cached", "--name-only", "--", "project/"]
  ]) {
    const res = spawnSync("git", diffArgs, { cwd, encoding: "utf8" });
    if (res.status === 0 && res.stdout) {
      for (const rawLine of res.stdout.split(/\r?\n/)) {
        const line = rawLine.trim();
        const m = line.match(/^project\/(REQ-\d+(?:-[^/]+)?)\//i);
        if (m) {
          touchedSet.add(m[1]);
        }
      }
    }
  }

  const modifiedReqDirs = Array.from(touchedSet).sort();
  if (modifiedReqDirs.length > 1 && !allowMultiReq) {
    if (!silent) {
      console.log(
        `範圍鎖定檢查: WARNING (同時修改多個既有需求目錄: ${modifiedReqDirs.join(", ")}；若非明確跨需求變更，請勿修改其他 REQ-*，確定需要請加 --allow-multi-req)`
      );
    }
    return { ok: false, enforced: strict, modifiedReqDirs };
  }

  return { ok: true, enforced: strict, modifiedReqDirs };
}

function isDraftSpecDir(dirAbs, dirName) {
  if (!dirName || isReqDirName(dirName) || dirName === "req") return false;
  return ["srs.md", "handoff.md", "openapi.yaml", "db-schema.md", "history.md"].some((file) =>
    isExistingFile(path.join(dirAbs, file))
  );
}

function validateRequirementsContent(cwd, options = {}) {
  const { silent = false } = options;
  const projectDir = path.join(cwd, "project");
  if (!isExistingDir(projectDir)) return [];

  const allIssues = [];
  const entries = fs.readdirSync(projectDir, { withFileTypes: true });
  let reqCount = 0;
  let draftCount = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dirAbs = path.join(projectDir, entry.name);
    if (isReqDirName(entry.name)) {
      reqCount += 1;
      allIssues.push(
        ...validateSingleRequirementDir(dirAbs, entry.name, { isDraft: false }).map((it) =>
          classifyRequirementIssue(it.reqDirName, it.msg)
        )
      );
    } else if (isDraftSpecDir(dirAbs, entry.name)) {
      draftCount += 1;
      allIssues.push(
        ...validateSingleRequirementDir(dirAbs, entry.name, { isDraft: true }).map((it) =>
          classifyRequirementIssue(it.reqDirName, it.msg)
        )
      );
    }
  }

  if (!silent) {
    if (allIssues.length > 0) {
      console.log(`需求內容檢查: WARNING (發現 ${allIssues.length} 項規範缺漏)`);
      for (const issue of allIssues) {
        console.log(`  - [${issue.reqDirName}] ${issue.msg}`);
      }
    } else if (reqCount > 0 || draftCount > 0) {
      console.log(
        `需求內容檢查: OK (${reqCount} 個已歸檔需求${draftCount > 0 ? `、${draftCount} 個草稿` : ""})`
      );
    }
  }

  return allIssues;
}

function runDoctor(cwd, packageVersion) {
  const ok = checkRequiredPaths(cwd, "sa-spec doctor");
  if (ok) {
    checkSpecVersion(cwd, packageVersion);
  }
  return ok;
}

function runCheck(cwd, isSourceRepoFlag, packageVersion, showStatusFn, args = []) {
  const strict = args.includes("--strict");
  const asJson = args.includes("--json");
  const allowMultiReq = args.includes("--allow-multi-req");

  if (!asJson) {
    console.log("sa-spec check");
  }

  const reqPathsRes = checkRequiredPaths(cwd, null, { silent: asJson });
  const pathsOk = asJson ? reqPathsRes.ok : reqPathsRes;
  if (!pathsOk) {
    if (asJson) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            strict,
            missingPaths: reqPathsRes.missingPaths,
            issues: reqPathsRes.missingPaths.map((p) => ({
              rule: "MISSING_CORE_FILE",
              reqDir: null,
              file: p,
              message: `缺少必要核心檔案: ${p}`,
              fixHint: "執行 sa-spec init 初始化或修復專案結構。"
            }))
          },
          null,
          2
        )
      );
    }
    return;
  }

  const verRes = checkSpecVersion(cwd, packageVersion, { silent: asJson });
  const hasLegacySkills = !isSourceRepoFlag && isExistingDir(path.join(cwd, "skills"));
  const hasLegacyRules = !isSourceRepoFlag && isExistingDir(path.join(cwd, "rules"));
  if (!asJson && (hasLegacySkills || hasLegacyRules)) {
    console.log("提示: 偵測到舊版專案內置 skills/ 或 rules/，建議執行 sa-spec upgrade 移除並改用套件內建規範。");
  }

  const dupRes = checkDuplicateReqIds(cwd, { silent: asJson });
  const dupOk = asJson ? dupRes.length === 0 : dupRes;
  const indexRes = checkIndexSync(cwd, { silent: asJson });
  const indexSyncOk = asJson ? indexRes.ok : indexRes;
  const contentIssues = validateRequirementsContent(cwd, { silent: asJson });
  const scopeLock = checkMultiReqScopeLock(cwd, { allowMultiReq, strict, silent: asJson });

  const hasError =
    !dupOk ||
    !indexSyncOk ||
    contentIssues.length > 0 ||
    (strict && (verRes.status !== "ok" || hasLegacySkills || hasLegacyRules || !scopeLock.ok));

  if (hasError) {
    process.exitCode = 1;
  }

  if (asJson) {
    const structuredIssues = contentIssues.map((it) => ({
      rule: it.rule,
      reqDir: it.reqDirName,
      file: it.file,
      message: it.msg,
      fixHint: it.fixHint
    }));
    if (asJson && dupRes.length > 0) {
      for (const dup of dupRes) {
        structuredIssues.push({
          rule: "DUPLICATE_REQ_ID",
          reqDir: dup.dirs.join(", "),
          file: "project/",
          message: `${dup.id} 重複出現在: ${dup.dirs.join(", ")}`,
          fixHint: "將衝突目錄改回草稿後重新執行 sa-spec finalize 定號。"
        });
      }
    }
    if (!indexSyncOk) {
      structuredIssues.push({
        rule: "INDEX_OUT_OF_SYNC",
        reqDir: null,
        file: "project/index.md",
        message: "project/index.md 與實際 REQ-* 目錄不同步",
        fixHint: "執行 sa-spec reindex 重建索引。"
      });
    }
    if (!scopeLock.ok) {
      structuredIssues.push({
        rule: "SCOPE_LOCK_MULTI_REQ",
        reqDir: scopeLock.modifiedReqDirs.join(", "),
        file: "project/",
        message: `同時修改多個既有需求目錄: ${scopeLock.modifiedReqDirs.join(", ")}`,
        fixHint: "拆分為獨立分支處理，或明確加上 --allow-multi-req。"
      });
    }
    if (strict && verRes.status !== "ok") {
      structuredIssues.push({
        rule: "SPEC_VERSION_MISMATCH",
        reqDir: null,
        file: "project/system-spec.md",
        message: `規範版本不一致 (recorded=${verRes.recorded || "none"}, cli=${verRes.current})`,
        fixHint: "執行 sa-spec upgrade 對齊版本鎖定。"
      });
    }
    if (strict && (hasLegacySkills || hasLegacyRules)) {
      structuredIssues.push({
        rule: "LEGACY_ASSETS_PRESENT",
        reqDir: null,
        file: hasLegacySkills ? "skills/" : "rules/",
        message: "偵測到舊版專案內置 skills/ 或 rules/",
        fixHint: "執行 sa-spec upgrade 移除舊版內置規則並改用 CLI 內建規範。"
      });
    }

    console.log(
      JSON.stringify(
        {
          ok: !hasError,
          strict,
          specVersion: {
            expected: packageVersion,
            actual: verRes.recorded,
            status: verRes.status
          },
          legacyAssets: {
            skills: hasLegacySkills,
            rules: hasLegacyRules
          },
          duplicateIds: dupRes,
          indexSync: indexRes,
          scopeLock,
          issues: structuredIssues
        },
        null,
        2
      )
    );
    return;
  }

  console.log("");
  showStatusFn(false);
}

module.exports = {
  isExistingDir,
  isExistingFile,
  isReqDirName,
  normalizeReqIdKey,
  checkRequiredPaths,
  checkSpecVersion,
  checkDuplicateReqIds,
  checkIndexSync,
  isDraftSpecDir,
  validateSingleRequirementDir,
  validateRequirementsContent,
  runDoctor,
  runCheck
};
