const fs = require("fs");
const path = require("path");
const { extractSpecVersion, extractStatusFromContent } = require("./i18n");

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

function validateSingleRequirementDir(reqAbsDir, reqDirName) {
  const issues = [];

  for (const item of REQUIRED_DELIVERABLES) {
    if (!fs.existsSync(path.join(reqAbsDir, item))) {
      issues.push(`缺少必要交付物: ${item}`);
    }
  }

  // Check leftover {{REQ_ID}} placeholder
  const checkFiles = ["srs.md", "openapi.yaml", "db-schema.md", "handoff.md", "history.md"];
  for (const fileName of checkFiles) {
    const fileAbs = path.join(reqAbsDir, fileName);
    if (!fs.existsSync(fileAbs)) continue;
    const text = fs.readFileSync(fileAbs, "utf8");
    if (text.includes("{{REQ_ID}}")) {
      issues.push(`${fileName} 仍殘留未替換的 {{REQ_ID}} 佔位符`);
    }
  }

  // Validate PlantUML single-diagram-per-file rule
  const umlDir = path.join(reqAbsDir, "uml");
  if (fs.existsSync(umlDir)) {
    const pumlFiles = fs.readdirSync(umlDir).filter((f) => f.endsWith(".puml"));
    if (pumlFiles.length === 0) {
      issues.push("uml/ 目錄內沒有任何 .puml 檔案");
    }
    for (const f of pumlFiles) {
      const pumlText = fs.readFileSync(path.join(umlDir, f), "utf8");
      if (pumlText.includes("{{REQ_ID}}")) {
        issues.push(`uml/${f} 仍殘留未替換的 {{REQ_ID}} 佔位符`);
      }
      const startCount = (pumlText.match(/@start\w+/gi) || []).length;
      const endCount = (pumlText.match(/@end\w+/gi) || []).length;
      if (startCount !== 1 || endCount !== 1) {
        issues.push(`uml/${f} 違反單檔單圖原則 (@start=${startCount}, @end=${endCount})`);
      }
    }
  }

  // Validate srs.md status and required sections
  const srsAbs = path.join(reqAbsDir, "srs.md");
  if (fs.existsSync(srsAbs)) {
    const srsText = fs.readFileSync(srsAbs, "utf8");
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
  const handoffAbs = path.join(reqAbsDir, "handoff.md");
  if (fs.existsSync(handoffAbs)) {
    const handoffText = fs.readFileSync(handoffAbs, "utf8");
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
  const openapiAbs = path.join(reqAbsDir, "openapi.yaml");
  if (fs.existsSync(openapiAbs)) {
    const openapiText = fs.readFileSync(openapiAbs, "utf8");
    const explicitNoApi = /(?:無\s*API|No API|無需\s*API|无\s*API|API\s*不要|API\s*불필요)/i.test(openapiText);
    if (!explicitNoApi && (!/^openapi\s*:/m.test(openapiText) || !/^paths\s*:/m.test(openapiText))) {
      issues.push("openapi.yaml 缺少 openapi: 或 paths: 宣告");
    }
    if (/^\s*title\s*:[ \t]*(?!["'\s])[^\n]*:[ \t]/m.test(openapiText)) {
      issues.push("openapi.yaml 的 title 欄位含未加引號的冒號，將導致 YAML 解析失敗");
    }
  }

  return issues.map((msg) => ({ reqDirName, msg }));
}

function validateRequirementsContent(cwd) {
  const projectDir = path.join(cwd, "project");
  if (!fs.existsSync(projectDir)) return [];

  const allIssues = [];
  const entries = fs.readdirSync(projectDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith("REQ-")) {
      allIssues.push(...validateSingleRequirementDir(path.join(projectDir, entry.name), entry.name));
    }
  }

  if (allIssues.length > 0) {
    console.log(`需求內容檢查: WARNING (發現 ${allIssues.length} 項規範缺漏)`);
    for (const issue of allIssues) {
      console.log(`  - [${issue.reqDirName}] ${issue.msg}`);
    }
  } else {
    const reqCount = entries.filter((e) => e.isDirectory() && e.name.startsWith("REQ-")).length;
    if (reqCount > 0) {
      console.log(`需求內容檢查: OK (${reqCount} 個已歸檔需求)`);
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
  const contentIssues = validateRequirementsContent(cwd);
  if (!dupOk || contentIssues.length > 0) {
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
  validateSingleRequirementDir,
  validateRequirementsContent,
  runDoctor,
  runCheck
};
