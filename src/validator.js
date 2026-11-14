const fs = require("fs");
const path = require("path");
const { extractSpecVersion, extractStatusFromContent, parseIndexRows } = require("./i18n");

const REQUIRED_DELIVERABLES = [
  "srs.md",
  "uml",
  "openapi.yaml",
  "db-schema.md",
  "handoff.md",
  "history.md"
];

function checkRequiredPaths(cwd, heading) {
  const requiredPaths = [
    "AGENTS.md",
    path.join("project", "index.md"),
    path.join("project", "system-spec.md")
  ];

  let hasMissing = false;
  if (heading) {
    console.log(heading);
  }

  for (const relativePath of requiredPaths) {
    const exists = fs.existsSync(path.join(cwd, relativePath));
    console.log(`${exists ? "OK" : "MISSING"} ${relativePath}`);
    if (!exists) {
      hasMissing = true;
    }
  }

  if (hasMissing) {
    process.exitCode = 1;
  }

  return !hasMissing;
}

function checkSpecVersion(cwd, packageVersion) {
  const systemSpecPath = path.join(cwd, "project", "system-spec.md");
  if (!fs.existsSync(systemSpecPath)) {
    return { status: "missing", recorded: null, current: packageVersion };
  }
  const content = fs.readFileSync(systemSpecPath, "utf8");
  const recorded = extractSpecVersion(content);
  if (!recorded) {
    console.log(`規範版本: WARNING (project/system-spec.md 未記錄版號，目前 CLI 為 ${packageVersion}，建議執行 sa-spec upgrade 寫入版本鎖定)`);
    return { status: "untracked", recorded: null, current: packageVersion };
  }
  if (recorded !== packageVersion) {
    console.log(`規範版本: WARNING (專案記錄為 ${recorded}，目前 CLI 為 ${packageVersion}，建議團隊對齊版本或執行 sa-spec upgrade)`);
    return { status: "mismatch", recorded, current: packageVersion };
  }
  console.log(`規範版本: OK (${recorded})`);
  return { status: "ok", recorded, current: packageVersion };
}

function checkDuplicateReqIds(cwd) {
  const projectDir = path.join(cwd, "project");
  if (!fs.existsSync(projectDir)) return true;

  const entries = fs.readdirSync(projectDir, { withFileTypes: true });
  const idDirsMap = new Map();
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith("REQ-")) {
      const m = entry.name.match(/^(REQ-\d+)/i);
      if (m) {
        const id = m[1].toUpperCase();
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
    console.log("序號唯一性: WARNING (發現重複編號)");
    for (const dup of duplicates) {
      console.log(`  - ${dup.id} 重複出現在: ${dup.dirs.join(", ")}`);
    }
    console.log("  提示：請將衝突目錄重新定號以維持序號連續與唯一。");
    return false;
  }

  console.log("序號唯一性: OK");
  return true;
}

function checkIndexSync(cwd) {
  const projectDir = path.join(cwd, "project");
  const indexPath = path.join(projectDir, "index.md");
  if (!fs.existsSync(projectDir) || !fs.existsSync(indexPath)) {
    return true;
  }

  const entries = fs.readdirSync(projectDir, { withFileTypes: true });
  const dirIds = new Set();
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith("REQ-")) {
      const m = entry.name.match(/^(REQ-\d+)/i);
      if (m) {
        dirIds.add(m[1].toUpperCase());
      }
    }
  }

  const rows = parseIndexRows(fs.readFileSync(indexPath, "utf8"));
  const indexedIds = new Set(rows.map((r) => String(r.id || "").trim().toUpperCase()).filter(Boolean));

  const missingInIndex = Array.from(dirIds).filter((id) => !indexedIds.has(id)).sort();
  const orphanInIndex = Array.from(indexedIds).filter((id) => !dirIds.has(id)).sort();

  if (missingInIndex.length > 0 || orphanInIndex.length > 0) {
    console.log("索引同步檢查: WARNING (project/index.md 與實際 REQ-* 目錄不同步)");
    if (missingInIndex.length > 0) {
      console.log(`  - 目錄已存在但 index.md 漏列: ${missingInIndex.join(", ")}`);
    }
    if (orphanInIndex.length > 0) {
      console.log(`  - index.md 有紀錄但找不到對應目錄: ${orphanInIndex.join(", ")}`);
    }
    console.log("  修復建議：請執行 sa-spec reindex 重建索引。");
    return false;
  }

  console.log("索引同步檢查: OK");
  return true;
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
      if (pumlFiles.length === 0) {
        issues.push("uml/ 目錄內沒有任何 .puml 檔案");
      }
      for (const f of pumlFiles) {
        const pumlAbs = path.join(umlDir, f);
        if (!fs.statSync(pumlAbs).isFile()) continue;
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

  // Validate openapi.yaml basic contract structure
  const openapiText = deliverableContents.get("openapi.yaml");
  if (openapiText !== undefined) {
    const explicitNoApi = /(?:無\s*API|No API|無需\s*API|无\s*API|API\s*不要|API\s*불필요)/i.test(openapiText);
    if (!explicitNoApi && (!/^openapi\s*:/m.test(openapiText) || !/^paths\s*:/m.test(openapiText))) {
      issues.push("openapi.yaml 缺少 openapi: 或 paths: 宣告");
    }
    if (/^\s*title\s*:[ \t]*(?!["'\s])[^\n]*:[ \t]/m.test(openapiText)) {
      issues.push("openapi.yaml 的 title 欄位含未加引號的冒號，將導致 YAML 解析失敗");
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

  return issues.map((msg) => ({ reqDirName, msg }));
}

function isDraftSpecDir(dirAbs, dirName) {
  if (!dirName || dirName.startsWith("REQ-") || dirName === "req") return false;
  return ["srs.md", "handoff.md", "openapi.yaml", "db-schema.md", "history.md"].some((file) =>
    fs.existsSync(path.join(dirAbs, file))
  );
}

function validateRequirementsContent(cwd) {
  const projectDir = path.join(cwd, "project");
  if (!fs.existsSync(projectDir)) return [];

  const allIssues = [];
  const entries = fs.readdirSync(projectDir, { withFileTypes: true });
  let reqCount = 0;
  let draftCount = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dirAbs = path.join(projectDir, entry.name);
    if (entry.name.startsWith("REQ-")) {
      reqCount += 1;
      allIssues.push(...validateSingleRequirementDir(dirAbs, entry.name, { isDraft: false }));
    } else if (isDraftSpecDir(dirAbs, entry.name)) {
      draftCount += 1;
      allIssues.push(...validateSingleRequirementDir(dirAbs, entry.name, { isDraft: true }));
    }
  }

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
  console.log("sa-spec check");
  const strict = args.includes("--strict");
  if (!checkRequiredPaths(cwd, null)) {
    return;
  }
  const verRes = checkSpecVersion(cwd, packageVersion);
  const hasLegacySkills = !isSourceRepoFlag && fs.existsSync(path.join(cwd, "skills"));
  const hasLegacyRules = !isSourceRepoFlag && fs.existsSync(path.join(cwd, "rules"));
  if (hasLegacySkills || hasLegacyRules) {
    console.log("提示: 偵測到舊版專案內置 skills/ 或 rules/，建議執行 sa-spec upgrade 移除並改用套件內建規範。");
  }
  const dupOk = checkDuplicateReqIds(cwd);
  const indexSyncOk = checkIndexSync(cwd);
  const contentIssues = validateRequirementsContent(cwd);
  if (!dupOk || !indexSyncOk || contentIssues.length > 0) {
    process.exitCode = 1;
  }
  if (strict && (verRes.status !== "ok" || hasLegacySkills || hasLegacyRules)) {
    process.exitCode = 1;
  }
  console.log("");
  showStatusFn(false);
}

module.exports = {
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
