const fs = require("fs");
const path = require("path");
const {
  SUPPORTED_LANGS,
  normalizeLangKey,
  detectProjectLanguage,
  extractStatusFromContent,
  extractSpecVersion,
  extractMergeStrategy,
  parseIndexRows,
  buildIndexMarkdown,
  buildSystemSpecMarkdown,
  buildWorkspaceReadmeMarkdown,
  buildLocalizedReqFileContent,
  buildLocalizedAgentsMarkdown
} = require("./i18n");
const {
  isGitWorkingTree,
  getCurrentBranch,
  detectMainBranch,
  getDefaultRemote
} = require("./git");
const { isDraftSpecDir, isExistingDir, isExistingFile, buildImpactIndex } = require("./validator");

const STAGE_ALIASES = {
  init: "init",
  sci: "init",
  "spec:init": "init",
  propose: "propose",
  scp: "propose",
  "spec:propose": "propose",
  analyze: "analyze",
  sca: "analyze",
  "spec:analyze": "analyze",
  commit: "commit",
  scc: "commit",
  "spec:commit": "commit",
  pdf: "pdf",
  spd: "pdf",
  "spec:pdf": "pdf"
};

const EXECUTION_PROTOCOL = [
  "做事前先說明任務：開始任何動作前，先向使用者簡要說明本次任務目標、範圍與預期產出。",
  "建立並依任務清單工作：列出可追蹤的任務清單（Task Checklist），嚴格依照清單順序逐項執行並回報完成進度。",
  "完成前準備雙重檢查清單：結案或請求確認前，必須分別核對「流程上檢查清單（Process Checklist）」與「業務上檢查清單（Business Checklist）」。"
];

const STAGE_CONFIG = {
  init: {
    stage: "init",
    command: "spec:init (sci)",
    summary: "初始化系統分析專案結構、鎖定主要語言並檢查 Git 狀態。",
    recommendedRules: ["system-spec", "file-style"],
    recommendedTemplates: ["system-spec", "index"],
    steps: [
      "載入 AGENTS.md 與 sa-spec CLI 內建規範（無須在專案中建立 skills/ 或 rules/）。",
      "檢查主要語言：若使用者尚未指定，主動詢問選擇 zh-TW、en、zh-CN、ja、ko 之一（禁止自行預設），並寫入 project/system-spec.md。",
      "確認 project/index.md 與 project/system-spec.md 存在（尚未建立時可執行 sa-spec init --lang <code>）。",
      "檢查 Git 狀態：未安裝時提醒但不中斷；未初始化時執行 git init；已是 Git repo 時僅回報狀態。"
    ],
    tasks: [
      "說明本次初始化任務目標與將建立的專案檔案清單",
      "確認專案主要語言（未指定時先詢問使用者選擇 5 種語系之一）",
      "檢查並初始化 Git repository 與遠端設定狀態",
      "執行 sa-spec init --lang <code> 建立根目錄與 project/ 基礎結構",
      "核對流程與業務檢查清單後回報初始化結果"
    ],
    processChecklist: [
      "已確認 Git 狀態（未安裝已提醒、未初始化已執行 git init、已初始化無重複操作）",
      "已確認 AGENTS.md、project/index.md、project/system-spec.md 皆為一般檔案且版本與 CLI 一致",
      "專案內未殘留舊版 skills/ 或 rules/ 目錄",
      "已執行 sa-spec doctor / sa-spec check 確認基礎結構通過"
    ],
    businessChecklist: [
      "專案主要語言已由使用者明確選定（zh-TW / en / zh-CN / ja / ko），未擅自預設",
      "project/system-spec.md 已正確記錄語言設定與初始合併策略",
      "專有名詞與專案定位符合使用者預期，未填入未確認的業務背景"
    ]
  },
  propose: {
    stage: "propose",
    command: "spec:propose (scp)",
    summary: "建立需求 feature 分支並產出延遲定號（{{REQ_ID}}）草稿目錄。",
    recommendedRules: ["spec", "file-style"],
    recommendedTemplates: ["srs", "handoff", "history", "openapi", "db-schema"],
    steps: [
      "依需求英文短名建立並切換至專屬 feature 分支（feat/<name>）；若已在 feature branch 則沿用（若需求標題為中文，需提供英文 --slug）。",
      "鐵律：若有設定 Git remote，立即執行 git push -u <remote> feat/<name>；推送失敗僅回報認證或網路問題。",
      "執行 sa-spec new --name <name> [--slug <ascii-slug>] 建立 project/<slug>/ 草稿目錄（內部使用 {{REQ_ID}} 佔位）。",
      "整理需求摘要、目標、初步流程與最多 3 個高影響待確認事項；不正式定號、不歸檔、不修改既有需求。"
    ],
    tasks: [
      "說明本次提案任務目標、需求範圍與將建立的分支/草稿目錄",
      "檢查目前分支與 Git remote，建立或沿用 feat/<slug> 分支並推送 remote",
      "執行 sa-spec new --name <name> [--slug <ascii-slug>] 產出 {{REQ_ID}} 草稿骨架",
      "整理需求摘要、初步流程與最多 3 個待確認問題",
      "核對流程與業務檢查清單後請使用者確認方向"
    ],
    processChecklist: [
      "已切換至專屬 feat/<slug> 分支，且若有 remote 已執行 git push -u 推送",
      "草稿建於 project/<slug>/ 且內部統一使用 {{REQ_ID}} 佔位（尚未提前佔用 REQ-xxx 正式序號）",
      "未修改 project/index.md 正式序號，亦未更動任何既有 REQ-* 目錄",
      "產出文件 100% 使用鎖定專案語言（技術術語保留原生英文）"
    ],
    businessChecklist: [
      "需求目標、核心使用者/角色與預期範圍描述清晰",
      "待確認問題控制在 3 個以內，聚焦權限、資料、API/DB 或驗收邊界",
      "未自行幻想或補寫未經使用者確認的業務規則與系統行為"
    ]
  },
  analyze: {
    stage: "analyze",
    command: "spec:analyze (sca)",
    summary: "全面檢查既有需求衝突，無衝突才產出 SRS、UML、OpenAPI、DB Schema 與 Handoff 草稿。",
    recommendedRules: [
      "spec",
      "uml-style",
      "wireframe",
      "db-table",
      "estimation",
      "system-spec",
      "file-style",
      "history",
      "review"
    ],
    recommendedTemplates: ["srs", "openapi", "db-schema", "handoff", "history", "uml-sequence", "uml-wireframe"],
    steps: [
      "先確認已同步主分支最新規格（如有 remote 先執行 git fetch），避免多人平行開發漏檢衝突。",
      "優先檢視下方「跨需求輕量影響索引 (impactIndex)」過濾出 API Paths、DB Tables 重疊或領域相關的 REQ-* 目錄，再讀取這些相關需求與 project/index.md、project/system-spec.md 進行語意衝突分析（避免無差別全量讀取）。",
      "若發現衝突：列出衝突需求編號與檔案、原因、影響範圍及最多 3 個待釐清問題，立即停止產出設計文件且不修改既有需求。",
      "若無衝突：以鎖定語言產出 SRS、uml/*.puml（每檔單一 @start...@end；涉及 UI 必產出 PlantUML Salt uml/wireframe.puml；純後端在 handoff.md 標註「無 UI 介面需求」）、OpenAPI YAML、DB Schema、Handoff 草稿、system-spec 更新建議與未修改其他需求聲明；此階段不可直接寫入 project/system-spec.md。"
    ],
    tasks: [
      "說明本次分析任務目標、檢視對象與預期交付文件",
      "同步遠端/主分支最新規格，並先用 impactIndex（sa-spec impact）過濾相關 REQ-* 與 system-spec.md 檢查語意衝突",
      "確認無衝突後，依序起草 srs.md、uml/*.puml、openapi.yaml、db-schema.md、handoff.md 與 history.md",
      "整理 project/system-spec.md 更新建議（僅提出建議，不直接寫入）",
      "核對流程與業務檢查清單後提交草稿供使用者審核"
    ],
    processChecklist: [
      "已先同步主分支/遠端並完成所有既有 REQ-* 的衝突檢查（若曾有衝突則已先停止並釐清）",
      "uml/ 嚴格遵守單檔單圖（每檔僅一組 @start...@end）；含 UI 者已產出 uml/wireframe.puml，純後端已於 handoff.md 標註無 UI",
      "未直接修改 project/system-spec.md 與其他 REQ-* 目錄，且文件未擅自標示「已審核」",
      "handoff.md 完整包含必要章節且僅整理已存在之規格契約，全文件 100% 符合鎖定語言"
    ],
    businessChecklist: [
      "需求目標、主要流程、例外流程與失敗情境完整無缺漏",
      "角色權限、資料存取邊界與狀態轉換邏輯前後一致",
      "SRS、UML、OpenAPI (request/response/狀態碼) 與 DB Schema (欄位/型別/關聯/約束) 四方契約一致",
      "驗收條件具體可測試，未確認規則已明確列為待確認事項而非擅自假設"
    ]
  },
  commit: {
    stage: "commit",
    command: "spec:commit (scc)",
    summary: "僅對使用者明確確認的無衝突版本定號歸檔、更新索引與系統規格，並依合併策略提交與推送。",
    recommendedRules: ["history", "system-spec", "review", "estimation", "file-style"],
    recommendedTemplates: ["history", "index", "system-spec"],
    steps: [
      "若有設定 Git remote，先執行 git push -u <remote> <branch> 與 git fetch <remote> 同步遠端狀態。",
      "查詢主分支（main/master 與遠端主分支）最新可用序號定號 REQ-xxx，執行 sa-spec finalize --name <slug>（預設走 pr 模式不直接動主分支；若需自動合併請加 --auto-merge 或將 system-spec.md 的合併策略設為 auto-merge）。",
      "依使用者確認內容更新 project/system-spec.md，補齊 handoff.md 11 項必要章節與 history.md（未經確認不可標示「已審核」）。",
      "只 stage 本次歸檔相關檔案並 commit（格式：docs(REQ-xxx): 需求名稱 - 簡短需求說明）；pr 模式下推送 feature 分支並提示建立 PR，auto-merge 模式下自動合併回主分支並 push。"
    ],
    tasks: [
      "說明本次歸檔任務目標、確認版本狀態與預期 Git 操作",
      "確認使用者已審核無誤後，推送 feature 分支並 fetch 遠端最新狀態",
      "執行 sa-spec finalize --name <slug> 完成 REQ-xxx 定號、替換 {{REQ_ID}} 與索引更新",
      "執行 sa-spec check --strict 驗證交付物與索引同步",
      "核對流程與業務檢查清單後回報歸檔序號、commit 與遠端同步結果"
    ],
    processChecklist: [
      "已先推 feature 分支並 fetch 遠端，由主分支最新序號定號，無 {{REQ_ID}} 殘留",
      "sa-spec check --strict 通過（交付物完整、單檔單圖、序號唯一、index.md 同步）",
      "commit 僅包含本次歸檔相關檔案，訊息符合 docs(REQ-xxx): 名稱 - 說明 格式",
      "已依合併策略完成 auto-merge/push 或推送 feature 分支等待 PR"
    ],
    businessChecklist: [
      "歸檔內容為使用者明確確認的最終版本（未經確認未標示為「已審核」）",
      "project/system-spec.md 與 history.md 已準確反映本次確認的系統變更與決策",
      "handoff.md 已清楚載明開發入口、限制與驗收標準，未夾帶未確認假設"
    ]
  },
  pdf: {
    stage: "pdf",
    command: "spec:pdf (spd)",
    summary: "將單一 Markdown 或整個需求資料夾匯出為 PDF（支援 PlantUML 圖表轉繪與分頁合併）。",
    recommendedRules: ["file-style"],
    recommendedTemplates: [],
    steps: [
      "轉換單檔 Markdown：執行 sa-spec pdf <file.md> [--output <path.pdf>]。",
      "整包合併匯出單一需求：執行 sa-spec pdf REQ-001（或需求目錄 slug）。",
      "拆分為多份獨立 PDF：加上 --split；批次匯出全部需求：執行 sa-spec pdf --all [--split]。"
    ],
    tasks: [
      "說明本次 PDF 匯出目標（單檔、整包需求或全專案）與輸出選項",
      "確認 PlantUML 隱私渲染模式（預設離線/本機或指定 --online-uml / --no-uml-render）",
      "執行 sa-spec pdf 指令產生 PDF 檔案",
      "核對流程與業務檢查清單後回報輸出路徑"
    ],
    processChecklist: [
      "指令參數未混用互斥選項（--split/--all 未與 --output 並用）",
      "未在未授權情況下將 .puml 傳送至公開 PlantUML 伺服器",
      "PDF 產生成功且輸出檔案存在於預期路徑"
    ],
    businessChecklist: [
      "匯出的文件為使用者指定的正確需求版本（草稿或已定號 REQ-xxx）",
      "整包合併內容與圖表章節齊全，可作為對外或跨團隊審閱交付物"
    ]
  }
};

const TEMPLATE_DEFINITIONS = [
  { name: "AGENTS", path: "AGENTS.md", description: "專案根目錄 AI 入口規範" },
  { name: "readme", path: "readme.md", description: "使用者規格專案說明檔" },
  { name: "index", path: path.join("project", "index.md"), description: "需求清單總索引" },
  { name: "system-spec", path: path.join("project", "system-spec.md"), description: "系統總體規格書範本" },
  { name: "srs", path: path.join("project", "req", "srs.md"), description: "需求規格書 (SRS) 範本" },
  { name: "openapi", path: path.join("project", "req", "openapi.yaml"), description: "OpenAPI 3.x 契約範本" },
  { name: "db-schema", path: path.join("project", "req", "db-schema.md"), description: "DB Schema 範本" },
  { name: "handoff", path: path.join("project", "req", "handoff.md"), description: "AI 開發交接摘要範本" },
  { name: "history", path: path.join("project", "req", "history.md"), description: "需求版本歷程範本" },
  { name: "uml-sequence", path: path.join("project", "req", "uml", "sequence.puml"), description: "PlantUML 循序圖範本" },
  { name: "uml-wireframe", path: path.join("project", "req", "uml", "wireframe.puml"), description: "PlantUML Salt UI 線框圖範本" }
];

function readTemplateFile(templatesDir, relativePath) {
  return fs.readFileSync(path.join(templatesDir, relativePath), "utf8");
}

function getPositionalArgs(args, valueFlags = []) {
  const result = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (valueFlags.includes(arg)) {
      i += 1;
      continue;
    }
    if (!arg.startsWith("-")) {
      result.push(arg);
    }
  }
  return result;
}

function getOption(args, flag) {
  const eqPrefix = `${flag}=`;
  const eqArg = args.find((arg) => arg.startsWith(eqPrefix));
  if (eqArg !== undefined) {
    const value = eqArg.slice(eqPrefix.length);
    if (!value) {
      throw new Error(`參數 ${flag} 缺少設定值。`);
    }
    return value;
  }

  const index = args.indexOf(flag);
  if (index < 0) {
    return null;
  }
  const next = args[index + 1];
  if (!next || next.startsWith("-")) {
    throw new Error(`參數 ${flag} 缺少設定值。`);
  }
  return next;
}

function stripFrontmatter(content) {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n*/, "").trim();
}

function listRuleEntries(templatesDir) {
  const rulesDir = path.join(templatesDir, "rules");
  if (!fs.existsSync(rulesDir)) return [];
  return fs
    .readdirSync(rulesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => {
      const name = entry.name.replace(/\.md$/i, "");
      const relPath = path.join("rules", entry.name);
      const content = readTemplateFile(templatesDir, relPath);
      const headingMatch = content.match(/^#\s+(.+)$/m);
      return {
        name,
        file: entry.name,
        path: relPath,
        title: headingMatch ? headingMatch[1].trim() : name
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function listTemplateEntries(templatesDir) {
  return TEMPLATE_DEFINITIONS.filter((def) => fs.existsSync(path.join(templatesDir, def.path))).map((def) => ({
    name: def.name,
    path: def.path.replace(/\\/g, "/"),
    description: def.description
  }));
}

function collectWorkspaceContext(cwd, isSourceRepoFlag, packageVersion) {
  const systemSpecPath = path.join(cwd, "project", "system-spec.md");
  const indexPath = path.join(cwd, "project", "index.md");
  const agentsPath = path.join(cwd, "AGENTS.md");
  const projectDir = path.join(cwd, "project");

  let systemSpecStatus = null;
  let recordedSpecVersion = null;
  let mergeStrategy = "pr";
  if (isExistingFile(systemSpecPath)) {
    const content = fs.readFileSync(systemSpecPath, "utf8");
    systemSpecStatus = extractStatusFromContent(content) || "未標示";
    recordedSpecVersion = extractSpecVersion(content);
    mergeStrategy = extractMergeStrategy(content);
  }

  const requirements = isExistingFile(indexPath)
    ? parseIndexRows(fs.readFileSync(indexPath, "utf8"))
    : [];

  const drafts = [];
  if (isExistingDir(projectDir)) {
    for (const entry of fs.readdirSync(projectDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (isDraftSpecDir(path.join(projectDir, entry.name), entry.name)) {
        drafts.push(entry.name);
      }
    }
    drafts.sort();
  }

  const gitInside = isGitWorkingTree(cwd);
  const hasSkills = !isSourceRepoFlag && isExistingDir(path.join(cwd, "skills"));
  const hasRules = !isSourceRepoFlag && isExistingDir(path.join(cwd, "rules"));

  return {
    cwd,
    isSourceRepo: isSourceRepoFlag,
    cliVersion: packageVersion,
    initialized: isExistingFile(agentsPath) && isExistingFile(indexPath) && isExistingFile(systemSpecPath),
    language: detectProjectLanguage(cwd),
    git: {
      isGitRepo: gitInside,
      branch: gitInside ? getCurrentBranch(cwd) : null,
      mainBranch: gitInside ? detectMainBranch(cwd) : null,
      remote: gitInside ? getDefaultRemote(cwd) : null
    },
    systemSpec: {
      exists: isExistingFile(systemSpecPath),
      status: systemSpecStatus,
      specVersion: recordedSpecVersion,
      versionMatch: !recordedSpecVersion || recordedSpecVersion === packageVersion,
      mergeStrategy
    },
    requirements: {
      count: requirements.length,
      items: requirements
    },
    drafts,
    legacyFiles: {
      hasSkills,
      hasRules
    }
  };
}

function formatContextLines(context) {
  const lines = [
    `- 工作目錄: ${context.cwd}`,
    `- 專案初始化: ${context.initialized ? "已初始化" : "尚未完整初始化"}`,
    `- 鎖定語言: ${context.language.label} (${context.language.code})`,
    `- 套件版本: CLI ${context.cliVersion}${
      context.systemSpec.specVersion
        ? ` / 專案記錄 ${context.systemSpec.specVersion}${context.systemSpec.versionMatch ? "" : " (版本不一致!)"}`
        : ""
    }`,
    `- 合併策略: ${context.systemSpec.mergeStrategy}`,
    `- Git 狀態: ${
      context.git.isGitRepo
        ? `branch=${context.git.branch || "detached"}, main=${context.git.mainBranch || "未設定"}, remote=${context.git.remote || "無"}`
        : "尚未初始化 Git"
    }`,
    `- 系統規格書: ${context.systemSpec.exists ? context.systemSpec.status : "缺少 project/system-spec.md"}`,
    `- 已歸檔需求數: ${context.requirements.count}${
      context.requirements.items.length > 0
        ? ` (${context.requirements.items.map((r) => r.id).join(", ")})`
        : ""
    }`,
    `- 進行中草稿: ${context.drafts.length > 0 ? context.drafts.join(", ") : "無"}`
  ];
  if (context.legacyFiles.hasSkills || context.legacyFiles.hasRules) {
    lines.push("- 注意: 偵測到舊版 skills/ 或 rules/ 目錄，建議執行 `sa-spec upgrade` 移除並改用套件內建規範。");
  }
  if (context.systemSpec.exists && context.systemSpec.specVersion && !context.systemSpec.versionMatch) {
    lines.push(
      `- 警告: 專案規範版本 (${context.systemSpec.specVersion}) 與目前 CLI (${context.cliVersion}) 不同，請確認團隊版本一致或執行 \`sa-spec upgrade\`。`
    );
  }
  return lines;
}

function runInstructions({ cwd, templatesDir, isSourceRepoFlag, packageVersion, args = [], fail }) {
  const asJson = args.includes("--json");
  const withRules = args.includes("--with-rules") || args.includes("--full");
  const positional = getPositionalArgs(args, ["--name", "--id"]);
  const rawStage = positional[0];
  const reqName = getOption(args, "--name");
  const reqId = getOption(args, "--id");
  const context = collectWorkspaceContext(cwd, isSourceRepoFlag, packageVersion);

  if (!rawStage) {
    const stages = Object.values(STAGE_CONFIG);
    const availableRules = listRuleEntries(templatesDir);
    const availableTemplates = listTemplateEntries(templatesDir);
    if (asJson) {
      console.log(
        JSON.stringify(
          {
            executionProtocol: EXECUTION_PROTOCOL,
            context,
            stages,
            availableRules,
            availableTemplates
          },
          null,
          2
        )
      );
      return;
    }

    const output = [
      "# sa-spec instructions",
      "",
      "## 任務執行原則 (Execution Protocol)",
      ...EXECUTION_PROTOCOL.map((item, idx) => `${idx + 1}. ${item}`),
      "",
      "## 目前工作區狀態",
      ...formatContextLines(context),
      "",
      "## 可用階段指令",
      ...stages.map((s) => `- \`${s.stage}\` (${s.command}): ${s.summary}`),
      "",
      "## 常用規範與範本查詢",
      "- `sa-spec instructions <init|propose|analyze|commit|pdf> [--with-rules] [--json]`",
      `- \`sa-spec rules [${availableRules.map((r) => r.name).join("|")}|all] [--list] [--json]\``,
      `- \`sa-spec templates [${availableTemplates.map((t) => t.name).join("|")}] [--lang <code>] [--list] [--json]\``
    ];
    console.log(output.join("\n"));
    return;
  }

  const stageKey = STAGE_ALIASES[rawStage.toLowerCase()];
  if (!stageKey) {
    fail(`不支援的階段 "${rawStage}"。可用階段: init (sci), propose (scp), analyze (sca), commit (scc), pdf (spd)`);
    return;
  }

  const stage = STAGE_CONFIG[stageKey];
  const skillRaw = readTemplateFile(templatesDir, path.join("skills", "system-analysis", "SKILL.md"));
  const skillContent = stripFrontmatter(skillRaw);
  const languageDirective =
    context.language.code !== "zh-TW"
      ? `IMPORTANT: This project's locked language is ${context.language.label}. Write ALL generated specification artifacts (srs.md, uml/*.puml, openapi.yaml, db-schema.md, handoff.md, history.md) 100% in ${context.language.label}, keeping only standard technical terms (REST API, Webhook, JWT, OAuth 2.0, Payload, Idempotency, Redis, etc.) in English. Do NOT leak Traditional Chinese phrasing from the reference guide below into output documents.`
      : "";
  const includedRules = withRules
    ? stage.recommendedRules.map((ruleName) => ({
        name: ruleName,
        content: readTemplateFile(templatesDir, path.join("rules", `${ruleName}.md`)).trim()
      }))
    : [];

  const impactIndex = stage.stage === "analyze" ? buildImpactIndex(cwd) : null;

  if (asJson) {
    const payload = {
      stage: stage.stage,
      command: stage.command,
      summary: stage.summary,
      target: {
        name: reqName || null,
        id: reqId || null
      },
      context,
      ...(impactIndex ? { impactIndex } : {}),
      executionProtocol: EXECUTION_PROTOCOL,
      ...(languageDirective ? { languageDirective } : {}),
      steps: stage.steps,
      tasks: stage.tasks,
      processChecklist: stage.processChecklist,
      businessChecklist: stage.businessChecklist,
      recommendedRules: stage.recommendedRules,
      recommendedTemplates: stage.recommendedTemplates,
      skillDocument: skillContent
    };
    if (withRules) {
      payload.rules = includedRules;
    }
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const sections = [
    `# sa-spec instructions: ${stage.command}`,
    "",
    stage.summary,
    ...(reqName || reqId ? ["", `目標需求: ${[reqId, reqName].filter(Boolean).join(" / ")}`] : []),
    "",
    "## 任務執行原則 (Execution Protocol)",
    ...EXECUTION_PROTOCOL.map((item, idx) => `${idx + 1}. ${item}`),
    "",
    "## 目前工作區狀態",
    ...formatContextLines(context),
    ...(impactIndex
      ? [
          "",
          "## 跨需求輕量影響索引 (API / DB Impact Matrix)",
          ...(impactIndex.requirements.length === 0
            ? ["- 目前尚無既有需求或草稿的 API / DB 紀錄。"]
            : [
                "| 需求目錄 | 狀態 | API Endpoints | DB Tables |",
                "|---|---|---|---|",
                ...impactIndex.requirements.map(
                  (r) =>
                    `| \`${r.dir}\` | ${r.status || (r.isDraft ? "草稿" : "-")} | ${r.apis.join(", ") || "-"} | ${r.tables.join(", ") || "-"} |`
                )
              ]),
          ...(impactIndex.apiCollisions.length > 0
            ? ["", `- 潛在 API 重疊: ${impactIndex.apiCollisions.map((c) => `${c.endpoint} (${c.dirs.join(", ")})`).join("；")}`]
            : []),
          ...(impactIndex.tableCollisions.length > 0
            ? [`- 潛在 DB Table 重疊: ${impactIndex.tableCollisions.map((c) => `${c.table} (${c.dirs.join(", ")})`).join("；")}`]
            : [])
        ]
      : []),
    "",
    `## 階段重點步驟 (${stage.stage})`,
    ...stage.steps.map((step, index) => `${index + 1}. ${step}`),
    "",
    `## 任務清單 (Task Checklist - ${stage.stage})`,
    ...stage.tasks.map((task) => `- [ ] ${task}`),
    "",
    "## 流程檢查清單 (Process Checklist)",
    ...stage.processChecklist.map((item) => `- [ ] ${item}`),
    "",
    "## 業務檢查清單 (Business Checklist)",
    ...stage.businessChecklist.map((item) => `- [ ] ${item}`),
    "",
    "## 相關規範與範本",
    `- 建議規範: ${stage.recommendedRules.map((r) => `\`sa-spec rules ${r}\``).join("、") || "無"}`,
    `- 建議範本: ${stage.recommendedTemplates.map((t) => `\`sa-spec templates ${t}\``).join("、") || "無"}`,
    ...(languageDirective ? ["", "## 語言強制規範 (Language Directive)", languageDirective] : []),
    "",
    "## 完整系統分析規範 (SKILL.md)",
    skillContent
  ];

  if (includedRules.length > 0) {
    sections.push("", "## 本階段完整補充規則");
    for (const rule of includedRules) {
      sections.push("", `<!-- rule: ${rule.name} -->`, rule.content);
    }
  }

  console.log(sections.join("\n"));
}

function runRules({ templatesDir, args = [], fail }) {
  const asJson = args.includes("--json");
  const listOnly = args.includes("--list");
  const showAll = args.includes("--all");
  const positional = getPositionalArgs(args);
  const target = positional[0];
  const entries = listRuleEntries(templatesDir);

  if (listOnly || (!target && !showAll)) {
    if (asJson) {
      console.log(JSON.stringify({ rules: entries }, null, 2));
      return;
    }
    const lines = [
      "# sa-spec rules",
      "",
      ...entries.map((entry) => `- \`${entry.name}\`: ${entry.title}`),
      "",
      "使用方式: `sa-spec rules <name>`、`sa-spec rules all` 或 `sa-spec rules --json`"
    ];
    console.log(lines.join("\n"));
    return;
  }

  if (showAll || target.toLowerCase() === "all") {
    const detailed = entries.map((entry) => ({
      ...entry,
      content: readTemplateFile(templatesDir, entry.path).trim()
    }));
    if (asJson) {
      console.log(JSON.stringify({ rules: detailed }, null, 2));
      return;
    }
    const output = detailed
      .map((item) => `<!-- rule: ${item.name} (${item.file}) -->\n\n${item.content}`)
      .join("\n\n---\n\n");
    console.log(output);
    return;
  }

  const normalized = target.replace(/\.md$/i, "").toLowerCase();
  const matched = entries.find((entry) => entry.name.toLowerCase() === normalized);
  if (!matched) {
    fail(`找不到規範 "${target}"。可用規範: ${entries.map((e) => e.name).join(", ")}`);
    return;
  }

  const content = readTemplateFile(templatesDir, matched.path).trim();
  if (asJson) {
    console.log(JSON.stringify({ ...matched, content }, null, 2));
    return;
  }
  console.log(content);
}

function getTemplatesPackageVersion(templatesDir) {
  try {
    const pkgPath = path.join(templatesDir, "..", "package.json");
    if (fs.existsSync(pkgPath)) {
      return JSON.parse(fs.readFileSync(pkgPath, "utf8")).version || "0.2.10";
    }
  } catch {
    // ignore read failure
  }
  return "0.2.10";
}

function buildLocalizedTemplateByName(name, langConfig, templatesDir) {
  const reqMap = {
    srs: "srs.md",
    openapi: "openapi.yaml",
    "db-schema": "db-schema.md",
    handoff: "handoff.md",
    history: "history.md",
    "uml-sequence": "uml/sequence.puml",
    "uml-main": "uml/sequence.puml",
    "uml-wireframe": "uml/wireframe.puml"
  };
  if (name === "AGENTS") {
    return buildLocalizedAgentsMarkdown(langConfig.code, templatesDir).trim();
  }
  if (name === "readme") {
    return buildWorkspaceReadmeMarkdown(langConfig.code).trim();
  }
  if (name === "index") {
    return buildIndexMarkdown(langConfig.code, []).trim();
  }
  if (name === "system-spec") {
    return buildSystemSpecMarkdown(langConfig, getTemplatesPackageVersion(templatesDir)).trim();
  }
  if (reqMap[name]) {
    return buildLocalizedReqFileContent(langConfig.code, reqMap[name], {
      REQ_ID: "{{REQ_ID}}",
      REQ_NAME: "{{REQ_NAME}}"
    }).trim();
  }
  return null;
}

function runTemplatesList({ cwd = process.cwd(), templatesDir, args = [], fail }) {
  const asJson = args.includes("--json");
  const listOnly = args.includes("--list");
  const langOverride = getOption(args, "--lang") || "";

  let langConfig = detectProjectLanguage(cwd);
  if (langOverride) {
    const normalizedLang = String(langOverride).toLowerCase().trim().replace(/_/g, "-");
    if (!SUPPORTED_LANGS[normalizedLang]) {
      fail(`不支援的語言 "${langOverride}"。可用語言: ${Object.values(SUPPORTED_LANGS).map((l) => l.code).join(", ")}`);
      return;
    }
    langConfig = SUPPORTED_LANGS[normalizedLang];
  }

  const positional = getPositionalArgs(args, ["--lang"]);
  const target = positional[0];
  const entries = listTemplateEntries(templatesDir);

  if (listOnly || !target) {
    if (asJson) {
      console.log(JSON.stringify({ language: langConfig.code, templates: entries }, null, 2));
      return;
    }
    const lines = [
      "# sa-spec templates",
      "",
      ...entries.map((entry) => `- \`${entry.name}\` (${entry.path}): ${entry.description}`),
      "",
      "使用方式: `sa-spec templates <name> [--lang <code>]` 或 `sa-spec templates <name> --json`"
    ];
    console.log(lines.join("\n"));
    return;
  }

  const rawNormalized = target.replace(/\\/g, "/").toLowerCase();
  const normalized =
    rawNormalized === "uml-main" || rawNormalized === "project/req/uml/main.puml"
      ? "uml-sequence"
      : rawNormalized;
  const matched = entries.find(
    (entry) => entry.name.toLowerCase() === normalized || entry.path.toLowerCase() === normalized
  );
  if (!matched) {
    fail(`找不到範本 "${target}"。可用範本: ${entries.map((e) => e.name).join(", ")}`);
    return;
  }

  const localized = buildLocalizedTemplateByName(matched.name, langConfig, templatesDir);
  const content = localized !== null ? localized : readTemplateFile(templatesDir, matched.path).trim();
  if (asJson) {
    console.log(JSON.stringify({ ...matched, language: langConfig.code, content }, null, 2));
    return;
  }
  console.log(content);
}

module.exports = {
  STAGE_ALIASES,
  STAGE_CONFIG,
  TEMPLATE_DEFINITIONS,
  getPositionalArgs,
  getOption,
  collectWorkspaceContext,
  runInstructions,
  runRules,
  runTemplatesList
};
