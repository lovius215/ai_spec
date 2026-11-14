const fs = require("fs");
const path = require("path");

const SUPPORTED_LANGS = {
  "zh-tw": { code: "zh-TW", name: "繁體中文", label: "繁體中文 (zh-TW)" },
  en: { code: "en", name: "English", label: "English (en)" },
  "zh-cn": { code: "zh-CN", name: "简体中文", label: "简体中文 (zh-CN)" },
  ja: { code: "ja", name: "日本語", label: "日本語 (ja)" },
  ko: { code: "ko", name: "한국어", label: "한국어 (ko)" }
};

const LANG_COPY = {
  "zh-tw": {
    indexTitle: "需求索引",
    indexHeaders: ["編號", "標題", "敘述", "狀態", "建立時間", "更新時間"],
    tbd: "待補充",
    pending: "待確認",
    draft: "草稿",
    systemOverviewTitle: "系統概覽",
    statusLabel: "狀態",
    langLabel: "主要語言",
    specVersionLabel: "規範版本",
    mergeStrategyLabel: "合併策略",
    systemSections: ["這個系統要解決什麼", "使用者", "主要需求", "待確認"],
    srsTitlePrefix: "SRS",
    srsLabels: {
      latestVersion: "最新版本",
      summary: "摘要",
      usersGoals: "使用者與目標",
      users: "使用者/角色",
      goals: "目標",
      preconditions: "前置條件",
      flows: "流程",
      mainFlow: "主要流程",
      exceptionFlow: "例外流程",
      functionalReqs: "功能需求",
      nonFunctionalReqs: "非功能需求與業務規則",
      uiSpec: "UI / 畫面規格",
      uiRef: "若有前端介面需求，請參考 `uml/wireframe.puml`；純後端需求請填寫「無 UI 介面需求」。",
      acceptance: "驗收條件",
      openQuestions: "待確認",
      relatedDocs: "相關文件"
    },
    dbTitle: "DB Schema",
    dbSections: [
      "設計目的與適用範圍",
      "資料表清單",
      "欄位與型別定義",
      "主鍵、外鍵與唯一性約束",
      "索引設計",
      "Migration 與資料保留規則",
      "待確認"
    ],
    handoffTitle: "開發交接摘要",
    handoffSections: [
      "來源文件",
      "要開發什麼",
      "不要開發什麼",
      "已確認規則",
      "狀態與流程",
      "API 契約",
      "DB 變更",
      "UI / 畫面規格",
      "驗收條件",
      "開發限制",
      "建議實作範圍"
    ],
    handoffUiNote: "若有前端操作介面，實作時請參照 `uml/wireframe.puml`；若為純後端需求，請保留「無 UI 介面需求」。",
    historyTitle: "版本歷程",
    historyHeader: "| 版本 | 日期 | 異動類型 | 異動摘要 | 影響範圍 | 狀態 |",
    readmeTitle: "系統分析規格專案",
    readmeIntro: "本專案使用 `@loviusc/sa-spec` 管理系統分析規格文件，完整分析規範與補充規則由 `sa-spec` CLI 動態提供（專案目錄不額外放置 `skills/` 與 `rules/`）。",
    readmeDirs: [
      "`AGENTS.md`：AI 協作入口與核心紅線規範。",
      "`project/system-spec.md`：系統總體概覽、鎖定語言與規範版本。",
      "`project/index.md`：需求總索引（可透過 `sa-spec reindex` 自動重建）。",
      "`project/REQ-xxx-<name>/`：已確認歸檔的需求規格（含 `srs.md`、`uml/`、`openapi.yaml`、`db-schema.md`、`handoff.md`、`history.md`）。"
    ],
    readmeCmdsTitle: "常用指令",
    readmeCmds: [
      "`sa-spec instructions <init|propose|analyze|commit|pdf>`：讀取對應階段流程與完整分析規範",
      "`sa-spec rules [name|all]`：查詢內建補充規則",
      "`sa-spec check`：檢查專案結構、規範版本、需求交付物完整性與重複序號",
      "`sa-spec pdf <REQ-001|file.md>`：匯出規格書 PDF"
    ]
  },
  en: {
    indexTitle: "Requirement Index",
    indexHeaders: ["ID", "Title", "Description", "Status", "Created At", "Updated At"],
    tbd: "TBD",
    pending: "Pending",
    draft: "Draft",
    systemOverviewTitle: "System Overview",
    statusLabel: "Status",
    langLabel: "Language",
    specVersionLabel: "Spec Version",
    mergeStrategyLabel: "Merge Strategy",
    systemSections: ["Problem Statement", "Users & Roles", "Core Capabilities", "Open Questions"],
    srsTitlePrefix: "SRS",
    srsLabels: {
      latestVersion: "Version",
      summary: "Summary",
      usersGoals: "Users & Goals",
      users: "Users / Roles",
      goals: "Goals",
      preconditions: "Preconditions",
      flows: "Workflows",
      mainFlow: "Main Flow",
      exceptionFlow: "Exception Flow",
      functionalReqs: "Functional Requirements",
      nonFunctionalReqs: "Non-Functional Requirements & Business Rules",
      uiSpec: "UI / Screen Specification",
      uiRef: "If this requirement includes frontend UI, refer to `uml/wireframe.puml`; for backend-only work, state \"No UI required\".",
      acceptance: "Acceptance Criteria",
      openQuestions: "Open Questions",
      relatedDocs: "Related Documents"
    },
    dbTitle: "DB Schema",
    dbSections: [
      "Purpose & Scope",
      "Tables",
      "Columns & Types",
      "Keys & Constraints",
      "Indexes",
      "Migration & Retention Rules",
      "Open Questions"
    ],
    handoffTitle: "Developer Handoff Summary",
    handoffSections: [
      "Source Documents",
      "What to Build",
      "Out of Scope (Do Not Build)",
      "Confirmed Business Rules",
      "States & Flows",
      "API Contracts",
      "DB Changes",
      "UI / Screen Specification",
      "Acceptance Criteria",
      "Engineering Constraints",
      "Suggested Implementation Scope"
    ],
    handoffUiNote: "If frontend UI is required, follow `uml/wireframe.puml`; for backend-only requirements, explicitly keep \"No UI required\".",
    historyTitle: "Version History",
    historyHeader: "| Version | Date | Change Type | Summary | Impact Scope | Status |",
    readmeTitle: "System Analysis Specification Workspace",
    readmeIntro: "This workspace is managed with `@loviusc/sa-spec`. Full workflow instructions and rule sets are served dynamically via the `sa-spec` CLI (no `skills/` or `rules/` folders are stored in this repository).",
    readmeDirs: [
      "`AGENTS.md`: AI assistant entrypoint and non-negotiable engineering guardrails.",
      "`project/system-spec.md`: System overview, locked language, and spec version.",
      "`project/index.md`: Requirement index (rebuilt deterministically with `sa-spec reindex`).",
      "`project/REQ-xxx-<name>/`: Confirmed requirement packages (`srs.md`, `uml/`, `openapi.yaml`, `db-schema.md`, `handoff.md`, `history.md`)."
    ],
    readmeCmdsTitle: "Common Commands",
    readmeCmds: [
      "`sa-spec instructions <init|propose|analyze|commit|pdf>`: Load live workspace context and stage instructions",
      "`sa-spec rules [name|all]`: Read built-in analysis rule documents",
      "`sa-spec check`: Validate workspace structure, spec version, requirement completeness, and duplicate IDs",
      "`sa-spec pdf <REQ-001|file.md>`: Export specification PDF"
    ]
  },
  "zh-cn": {
    indexTitle: "需求索引",
    indexHeaders: ["编号", "标题", "描述", "状态", "创建时间", "更新时间"],
    tbd: "待补充",
    pending: "待确认",
    draft: "草稿",
    systemOverviewTitle: "系统概览",
    statusLabel: "状态",
    langLabel: "主要语言",
    specVersionLabel: "规范版本",
    mergeStrategyLabel: "合并策略",
    systemSections: ["系统要解决的问题", "用户角色", "核心需求", "待确认事项"],
    srsTitlePrefix: "SRS",
    srsLabels: {
      latestVersion: "最新版本",
      summary: "摘要",
      usersGoals: "用户与目标",
      users: "用户/角色",
      goals: "目标",
      preconditions: "前置条件",
      flows: "流程",
      mainFlow: "主要流程",
      exceptionFlow: "异常流程",
      functionalReqs: "功能需求",
      nonFunctionalReqs: "非功能需求与业务规则",
      uiSpec: "UI / 界面规格",
      uiRef: "若涉及前端界面，请参考 `uml/wireframe.puml`；纯后端需求请注明「无 UI 界面需求」。",
      acceptance: "验收条件",
      openQuestions: "待确认",
      relatedDocs: "相关文档"
    },
    dbTitle: "DB Schema",
    dbSections: [
      "设计目的与适用范围",
      "数据表清单",
      "字段与类型定义",
      "主键、外键与唯一性约束",
      "索引设计",
      "Migration 与数据保留规则",
      "待确认"
    ],
    handoffTitle: "开发交接摘要",
    handoffSections: [
      "来源文档",
      "要开发什么",
      "不要开发什么",
      "已确认规则",
      "状态与流程",
      "API 契约",
      "DB 变更",
      "UI / 界面规格",
      "验收条件",
      "开发限制",
      "建议实现范围"
    ],
    handoffUiNote: "若涉及前端界面请参照 `uml/wireframe.puml`；纯后端需求请保留「无 UI 界面需求」。",
    historyTitle: "版本历程",
    historyHeader: "| 版本 | 日期 | 异动类型 | 异动摘要 | 影响范围 | 状态 |",
    readmeTitle: "系统分析规格项目",
    readmeIntro: "本项目使用 `@loviusc/sa-spec` 管理需求规格文档，完整规范与补充规则通过 `sa-spec` CLI 动态提供（项目目录中不保留 `skills/` 与 `rules/`）。",
    readmeDirs: [
      "`AGENTS.md`：AI 协作入口与核心规范。",
      "`project/system-spec.md`：系统概览、锁定语言与规范版本。",
      "`project/index.md`：需求总索引（可通过 `sa-spec reindex` 重建）。",
      "`project/REQ-xxx-<name>/`：已归档需求规格目录。"
    ],
    readmeCmdsTitle: "常用指令",
    readmeCmds: [
      "`sa-spec instructions <init|propose|analyze|commit|pdf>`：获取当前工作区上下文与阶段规范",
      "`sa-spec rules [name|all]`：查询内置补充规则",
      "`sa-spec check`：校验项目结构、规范版本、交付物完整性与编号唯一性",
      "`sa-spec pdf <REQ-001|file.md>`：导出规格书 PDF"
    ]
  },
  ja: {
    indexTitle: "要件インデックス",
    indexHeaders: ["番号", "タイトル", "概要", "ステータス", "作成日時", "更新日時"],
    tbd: "未定",
    pending: "確認待ち",
    draft: "ドラフト",
    systemOverviewTitle: "システム概要",
    statusLabel: "ステータス",
    langLabel: "主要言語",
    specVersionLabel: "仕様バージョン",
    mergeStrategyLabel: "マージ戦略",
    systemSections: ["解決する課題", "利用者・ロール", "主要機能", "未確認事項"],
    srsTitlePrefix: "SRS",
    srsLabels: {
      latestVersion: "最新バージョン",
      summary: "概要",
      usersGoals: "利用者と目的",
      users: "利用者/ロール",
      goals: "目的",
      preconditions: "前提条件",
      flows: "業務フロー",
      mainFlow: "基本フロー",
      exceptionFlow: "例外フロー",
      functionalReqs: "機能要件",
      nonFunctionalReqs: "非機能要件・業務ルール",
      uiSpec: "UI / 画面仕様",
      uiRef: "フロントエンド UI がある場合は `uml/wireframe.puml` を参照してください。バックエンド専用の場合は「UI 要件なし」と記載してください。",
      acceptance: "受入条件",
      openQuestions: "未確認事項",
      relatedDocs: "関連ドキュメント"
    },
    dbTitle: "DB Schema",
    dbSections: [
      "設計目的と適用範囲",
      "テーブル一覧",
      "カラム・型定義",
      "主キー・外部キー・制約",
      "インデックス設計",
      "Migration・データ保持ルール",
      "未確認事項"
    ],
    handoffTitle: "開発引き継ぎ要約",
    handoffSections: [
      "参照ドキュメント",
      "実装対象",
      "実装対象外",
      "確定済みルール",
      "状態とフロー",
      "API 契約",
      "DB 変更",
      "UI / 画面仕様",
      "受入条件",
      "開発制約",
      "推奨実装範囲"
    ],
    handoffUiNote: "UI がある場合は `uml/wireframe.puml` を参照してください。バックエンド専用の場合は「UI 要件なし」と明記してください。",
    historyTitle: "変更履歴",
    historyHeader: "| バージョン | 日付 | 変更種別 | 変更概要 | 影響範囲 | ステータス |",
    readmeTitle: "システム分析仕様ワークスペース",
    readmeIntro: "本ワークスペースは `@loviusc/sa-spec` で管理されています。詳細な分析手順とルールは `sa-spec` CLI から動的に提供されます（`skills/` や `rules/` は配置されません）。",
    readmeDirs: [
      "`AGENTS.md`: AI エージェント用エントリポイントと必須制約。",
      "`project/system-spec.md`: システム概要、固定言語、仕様バージョン。",
      "`project/index.md`: 要件一覧（`sa-spec reindex` で再生成可能）。",
      "`project/REQ-xxx-<name>/`: 確定済み要件ディレクトリ。"
    ],
    readmeCmdsTitle: "主なコマンド",
    readmeCmds: [
      "`sa-spec instructions <init|propose|analyze|commit|pdf>`: ワークスペース状態と手順を取得",
      "`sa-spec rules [name|all]`: 組み込みルールを参照",
      "`sa-spec check`: 構成、仕様バージョン、成果物整合性、番号重複を検証",
      "`sa-spec pdf <REQ-001|file.md>`: 仕様書 PDF を出力"
    ]
  },
  ko: {
    indexTitle: "요구사항 인덱스",
    indexHeaders: ["번호", "제목", "설명", "상태", "생성일시", "수정일시"],
    tbd: "미정",
    pending: "확인 대기",
    draft: "초안",
    systemOverviewTitle: "시스템 개요",
    statusLabel: "상태",
    langLabel: "주요 언어",
    specVersionLabel: "사양 버전",
    mergeStrategyLabel: "병합 전략",
    systemSections: ["해결하려는 문제", "사용자 및 역할", "핵심 요구사항", "미확인 사항"],
    srsTitlePrefix: "SRS",
    srsLabels: {
      latestVersion: "최신 버전",
      summary: "요약",
      usersGoals: "사용자 및 목표",
      users: "사용자/역할",
      goals: "목표",
      preconditions: "전제 조건",
      flows: "프로세스",
      mainFlow: "주요 흐름",
      exceptionFlow: "예외 흐름",
      functionalReqs: "기능 요구사항",
      nonFunctionalReqs: "비기능 요구사항 및 비즈니스 규칙",
      uiSpec: "UI / 화면 사양",
      uiRef: "프론트엔드 UI가 포함된 경우 `uml/wireframe.puml`을 참조하고, 백엔드 전용인 경우 \"UI 요구사항 없음\"으로 표기하세요.",
      acceptance: "인수 조건",
      openQuestions: "미확인 사항",
      relatedDocs: "관련 문서"
    },
    dbTitle: "DB Schema",
    dbSections: [
      "설계 목적 및 적용 범위",
      "테이블 목록",
      "컬럼 및 타입 정의",
      "기본키·외래키 및 제약조건",
      "인덱스 설계",
      "Migration 및 데이터 보존 규칙",
      "미확인 사항"
    ],
    handoffTitle: "개발 인수인계 요약",
    handoffSections: [
      "참조 문서",
      "구현 대상",
      "제외 범위",
      "확정된 규칙",
      "상태 및 흐름",
      "API 계약",
      "DB 변경사항",
      "UI / 화면 사양",
      "인수 조건",
      "개발 제약사항",
      "권장 구현 범위"
    ],
    handoffUiNote: "UI 구현이 필요한 경우 `uml/wireframe.puml`을 참조하세요. 백엔드 전용 요구사항은 \"UI 요구사항 없음\"을 유지하세요.",
    historyTitle: "변경 이력",
    historyHeader: "| 버전 | 날짜 | 변경 유형 | 변경 요약 | 영향 범위 | 상태 |",
    readmeTitle: "시스템 분석 사양 워크스페이스",
    readmeIntro: "이 프로젝트는 `@loviusc/sa-spec`으로 관리됩니다. 전체 분석 규칙과 절차는 `sa-spec` CLI에서 동적으로 제공됩니다(`skills/`, `rules/` 폴더 미생성).",
    readmeDirs: [
      "`AGENTS.md`: AI 협업 진입점 및 핵심 제약 규칙.",
      "`project/system-spec.md`: 시스템 개요, 고정 언어 및 사양 버전.",
      "`project/index.md`: 요구사항 목록(`sa-spec reindex`로 재구축 가능).",
      "`project/REQ-xxx-<name>/`: 확정된 요구사항 패키지."
    ],
    readmeCmdsTitle: "주요 명령어",
    readmeCmds: [
      "`sa-spec instructions <init|propose|analyze|commit|pdf>`: 현재 워크스페이스 컨텍스트와 단계별 지침 조회",
      "`sa-spec rules [name|all]`: 내장 규칙 조회",
      "`sa-spec check`: 필수 구조, 사양 버전, 산출물 무결성 및 중복 번호 검증",
      "`sa-spec pdf <REQ-001|file.md>`: 사양서 PDF 내보내기"
    ]
  }
};

function normalizeLangKey(langCode) {
  if (!langCode) return "zh-tw";
  const key = String(langCode).toLowerCase().trim();
  return SUPPORTED_LANGS[key] ? key : "zh-tw";
}

function getLangStrings(langCode) {
  return LANG_COPY[normalizeLangKey(langCode)] || LANG_COPY["zh-tw"];
}

function detectProjectLanguage(cwd) {
  const systemSpecPath = path.join(cwd, "project", "system-spec.md");
  if (fs.existsSync(systemSpecPath)) {
    const content = fs.readFileSync(systemSpecPath, "utf8");
    const match = content.match(/^-\s*(?:主要語言|主要语言|主要言語|주요 언어|語言|語言設定|Language)[：:]\s*(.+)$/im);
    if (match) {
      const val = match[1].trim();
      for (const key of Object.keys(SUPPORTED_LANGS)) {
        if (
          val.toLowerCase().includes(key) ||
          val.includes(SUPPORTED_LANGS[key].label) ||
          val.includes(SUPPORTED_LANGS[key].name) ||
          val.toLowerCase().includes(SUPPORTED_LANGS[key].code.toLowerCase())
        ) {
          return SUPPORTED_LANGS[key];
        }
      }
      return { code: "custom", label: val, name: val };
    }
  }
  return SUPPORTED_LANGS["zh-tw"];
}

function extractStatusFromContent(content) {
  if (!content) return null;
  const match = content.match(/^-\s*(?:狀態|状态|ステータス|상태|Status)[：:]\s*(.+)$/im);
  return match ? match[1].trim() : null;
}

function extractSpecVersion(content) {
  if (!content) return null;
  const match = content.match(/^-\s*(?:規範版本|规范版本|仕様バージョン|사양 버전|Spec Version)[：:]\s*([0-9]+\.[0-9]+\.[0-9]+[^\s]*)$/im);
  return match ? match[1].trim() : null;
}

function extractMergeStrategy(content) {
  if (!content) return "auto-merge";
  const match = content.match(/^-\s*(?:合併策略|合并策略|マージ戦略|병합 전략|Merge Strategy)[：:]\s*(.+)$/im);
  if (!match) return "auto-merge";
  const val = match[1].trim().toLowerCase();
  if (val.includes("pr") || val.includes("no-merge") || val.includes("manual")) {
    return "pr";
  }
  return "auto-merge";
}

function stampSpecVersionInContent(content, version) {
  const versionLineRegex = /^-\s*(?:規範版本|规范版本|仕様バージョン|사양 버전|Spec Version)[：:].*$/im;
  if (versionLineRegex.test(content)) {
    return content.replace(versionLineRegex, (line) => {
      const prefix = line.split(/[：:]/)[0];
      const sep = line.includes("：") ? "：" : ": ";
      return `${prefix}${sep}${version}`;
    });
  }
  const langLineRegex = /^-\s*(?:主要語言|主要语言|主要言語|주요 언어|語言|Language)[：:].*$/im;
  if (langLineRegex.test(content)) {
    return content.replace(langLineRegex, (line) => `${line}\n- Spec Version: ${version}`);
  }
  return content;
}

const INDEX_HEADER_KEYWORDS = ["編號", "编号", "番号", "번호", "id"];

function escapeIndexCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|");
}

function splitIndexCells(line) {
  const placeholder = "\x00PIPE\x00";
  return String(line)
    .replace(/\\\|/g, placeholder)
    .split("|")
    .map((part) => part.replace(/\x00PIPE\x00/g, "|").trim());
}

function parseIndexRows(content) {
  return content
    .split("\n")
    .filter((line) => {
      if (!line.startsWith("|")) return false;
      if (/^\|(?:\s*:?-{2,}:?\s*\|)+\s*$/.test(line.trim())) return false;
      const cols = splitIndexCells(line)
        .map((c) => c.toLowerCase())
        .filter(Boolean);
      if (cols.length > 0 && INDEX_HEADER_KEYWORDS.some((kw) => cols[0] === kw.toLowerCase())) {
        return false;
      }
      return true;
    })
    .map((line) => splitIndexCells(line))
    .filter((parts) => parts.length >= 7)
    .map((parts) => ({
      id: parts[1],
      title: parts[2],
      description: parts[3],
      status: parts[4],
      createdAt: parts[5],
      updatedAt: parts[6]
    }));
}

function buildIndexMarkdown(langCode, rows = []) {
  const t = getLangStrings(langCode);
  const header = `# ${t.indexTitle}\n\n| ${t.indexHeaders.join(" | ")} |\n|---|---|---|---|---|---|\n`;
  if (rows.length === 0) {
    return `${header}\n`;
  }
  const body = rows
    .map(
      (r) =>
        `| ${[r.id, r.title, r.description, r.status, r.createdAt, r.updatedAt].map(escapeIndexCell).join(" | ")} |`
    )
    .join("\n");
  return `${header}${body}\n`;
}

function buildSystemSpecMarkdown(langConfig, version) {
  const t = getLangStrings(langConfig.code);
  const sections = t.systemSections.map((h) => `## ${h}\n${t.tbd}.`).join("\n\n");
  return [
    `# ${t.systemOverviewTitle}`,
    "",
    `- ${t.statusLabel}：${t.draft}`,
    `- ${t.langLabel}：${langConfig.label}`,
    `- ${t.specVersionLabel}：${version}`,
    `- ${t.mergeStrategyLabel}：auto-merge`,
    "",
    sections,
    ""
  ].join("\n");
}

function buildWorkspaceReadmeMarkdown(langCode) {
  const t = getLangStrings(langCode);
  return [
    `# ${t.readmeTitle}`,
    "",
    t.readmeIntro,
    "",
    ...t.readmeDirs.map((d) => `- ${d}`),
    "",
    `## ${t.readmeCmdsTitle}`,
    "",
    ...t.readmeCmds.map((c) => `- ${c}`),
    ""
  ].join("\n");
}

function buildLocalizedReqFileContent(langCode, relType, replacements = {}) {
  const t = getLangStrings(langCode);
  const safeReplacements = replacements || {};
  const reqId = safeReplacements.REQ_ID || safeReplacements["{{REQ_ID}}"] || "{{REQ_ID}}";
  const reqName = safeReplacements.REQ_NAME || safeReplacements["{{REQ_NAME}}"] || "";

  switch (relType) {
    case "srs.md": {
      const s = t.srsLabels;
      const heading = reqName ? `# ${reqId} ${reqName} ${t.srsTitlePrefix}` : `# ${reqId} ${t.srsTitlePrefix}`;
      return [
        heading,
        "",
        `- ${t.statusLabel}：${t.pending}`,
        `- ${s.latestVersion}：v0.1`,
        "",
        `## ${s.summary}`,
        `${t.tbd}.`,
        "",
        `## ${s.usersGoals}`,
        `- ${s.users}：${t.tbd}`,
        `- ${s.goals}：${t.tbd}`,
        `- ${s.preconditions}：${t.tbd}`,
        "",
        `## ${s.flows}`,
        `- ${s.mainFlow}：${t.tbd}`,
        `- ${s.exceptionFlow}：${t.tbd}`,
        "",
        `## ${s.functionalReqs}`,
        `- ${t.tbd}`,
        "",
        `## ${s.nonFunctionalReqs}`,
        `- ${t.tbd}`,
        "",
        `## ${s.uiSpec}`,
        s.uiRef,
        "",
        `## ${s.acceptance}`,
        `- ${t.tbd}`,
        "",
        `## ${s.openQuestions}`,
        `- ${t.tbd}`,
        "",
        `## ${s.relatedDocs}`,
        "- `uml/main.puml`",
        "- `openapi.yaml`",
        "- `db-schema.md`",
        "- `handoff.md`",
        "- `history.md`",
        ""
      ].join("\n");
    }
    case "openapi.yaml": {
      const apiTitle = JSON.stringify(`${reqId}${reqName ? ` ${reqName}` : ""} API`);
      return [
        "openapi: 3.0.3",
        "info:",
        `  title: ${apiTitle}`,
        "  version: 0.1.0",
        "paths: {}",
        ""
      ].join("\n");
    }
    case "db-schema.md":
      return [
        `# ${reqId}${reqName ? ` ${reqName}` : ""} ${t.dbTitle}`,
        "",
        `- ${t.statusLabel}：${t.pending}`,
        "",
        ...t.dbSections.flatMap((h) => [`## ${h}`, `${t.tbd}.`, ""]),
        ""
      ]
        .join("\n")
        .trimEnd() + "\n";
    case "handoff.md":
      return [
        `# ${reqId}${reqName ? ` ${reqName}` : ""} ${t.handoffTitle}`,
        "",
        `- ${t.statusLabel}：${t.pending}`,
        "",
        ...t.handoffSections.flatMap((h, idx) => {
          if (idx === 0) {
            return [
              `## ${h}`,
              "- `srs.md`",
              "- `uml/main.puml`",
              "- `openapi.yaml`",
              "- `db-schema.md`",
              ""
            ];
          }
          if (idx === 7) {
            return [`## ${h}`, t.handoffUiNote, ""];
          }
          return [`## ${h}`, `${t.tbd}.`, ""];
        })
      ]
        .join("\n")
        .trimEnd() + "\n";
    case "history.md":
      return [
        `# ${reqId}${reqName ? ` ${reqName}` : ""} ${t.historyTitle}`,
        "",
        t.historyHeader,
        "|---|---|---|---|---|---|",
        `| v0.1 | ${new Date().toISOString().slice(0, 10)} | ${t.draft} | ${t.tbd} | SRS, UML, OpenAPI, DB | ${t.pending} |`,
        ""
      ].join("\n");
    case "uml/main.puml": {
      const umlCopy = getUmlCopy(langCode);
      const displayName = reqName ? ` ${reqName}` : "";
      return [
        "@startuml",
        `title ${reqId}${displayName} - ${umlCopy.mainTitle}`,
        "",
        `actor "${umlCopy.userActor}" as User`,
        `participant "${umlCopy.client}" as Client`,
        `participant "${umlCopy.api}" as API`,
        `database "${umlCopy.db}" as DB`,
        "",
        `User -> Client : ${umlCopy.stepInput}`,
        `Client -> API : ${umlCopy.stepRequest}`,
        `API -> DB : ${umlCopy.stepQuery}`,
        `DB --> API : ${umlCopy.stepDbResult}`,
        `API --> Client : ${umlCopy.stepResponse}`,
        `Client --> User : ${umlCopy.stepRender}`,
        "@enduml",
        ""
      ].join("\n");
    }
    case "uml/wireframe.puml": {
      const umlCopy = getUmlCopy(langCode);
      const displayName = reqName ? ` ${reqName}` : "";
      return [
        "@startsalt",
        "{",
        `  {+ ${reqId}${displayName} - ${umlCopy.wireframeTitle} }`,
        "  ---",
        `  { ${umlCopy.searchLabel} | "                    " | [${umlCopy.searchBtn}] | [${umlCopy.createBtn}] }`,
        "  ---",
        "  {#",
        `    ${umlCopy.colId} | ${umlCopy.colName} | ${umlCopy.colStatus} | ${umlCopy.colAction}`,
        `    001 | ${umlCopy.sampleItem} | ${umlCopy.sampleActive} | [${umlCopy.editBtn}]`,
        "  }",
        "  ---",
        `  { [${umlCopy.cancelBtn}] | [${umlCopy.saveBtn}] }`,
        "}",
        "@endsalt",
        ""
      ].join("\n");
    }
    default:
      return null;
  }
}

const UML_COPY = {
  "zh-tw": {
    mainTitle: "主要互動循序圖",
    userActor: "使用者",
    client: "前端介面",
    api: "後端 API 服務",
    db: "資料庫",
    stepInput: "操作與送出請求",
    stepRequest: "POST /api/v1/resource",
    stepQuery: "寫入 / 查詢資料",
    stepDbResult: "回傳結果",
    stepResponse: "200 OK (JSON Payload)",
    stepRender: "顯示操作結果",
    wireframeTitle: "畫面線框圖",
    searchLabel: "關鍵字",
    searchBtn: "查詢",
    createBtn: "+ 新增",
    colId: "編號",
    colName: "名稱",
    colStatus: "狀態",
    colAction: "操作",
    sampleItem: "範例項目",
    sampleActive: "啟用",
    editBtn: "編輯",
    cancelBtn: "取消",
    saveBtn: "儲存"
  },
  en: {
    mainTitle: "Main Sequence Diagram",
    userActor: "User",
    client: "Frontend UI",
    api: "Backend API Service",
    db: "Database",
    stepInput: "Trigger action and submit",
    stepRequest: "POST /api/v1/resource",
    stepQuery: "Read / write record",
    stepDbResult: "Query result",
    stepResponse: "200 OK (JSON Payload)",
    stepRender: "Render updated state",
    wireframeTitle: "UI Wireframe",
    searchLabel: "Search",
    searchBtn: "Search",
    createBtn: "+ Create",
    colId: "ID",
    colName: "Name",
    colStatus: "Status",
    colAction: "Action",
    sampleItem: "Sample Item",
    sampleActive: "Active",
    editBtn: "Edit",
    cancelBtn: "Cancel",
    saveBtn: "Save"
  },
  "zh-cn": {
    mainTitle: "主要交互时序图",
    userActor: "用户",
    client: "前端界面",
    api: "后端 API 服务",
    db: "数据库",
    stepInput: "操作并提交请求",
    stepRequest: "POST /api/v1/resource",
    stepQuery: "写入 / 查询数据",
    stepDbResult: "返回结果",
    stepResponse: "200 OK (JSON Payload)",
    stepRender: "显示操作结果",
    wireframeTitle: "界面线框图",
    searchLabel: "关键字",
    searchBtn: "查询",
    createBtn: "+ 新增",
    colId: "编号",
    colName: "名称",
    colStatus: "状态",
    colAction: "操作",
    sampleItem: "示例项目",
    sampleActive: "启用",
    editBtn: "编辑",
    cancelBtn: "取消",
    saveBtn: "保存"
  },
  ja: {
    mainTitle: "主要シーケンス図",
    userActor: "ユーザー",
    client: "フロントエンド UI",
    api: "バックエンド API サービス",
    db: "データベース",
    stepInput: "操作・リクエスト送信",
    stepRequest: "POST /api/v1/resource",
    stepQuery: "データの読み書き",
    stepDbResult: "処理結果",
    stepResponse: "200 OK (JSON Payload)",
    stepRender: "画面に結果を表示",
    wireframeTitle: "画面ワイヤーフレーム",
    searchLabel: "検索",
    searchBtn: "検索",
    createBtn: "+ 新規作成",
    colId: "ID",
    colName: "名称",
    colStatus: "ステータス",
    colAction: "操作",
    sampleItem: "サンプル項目",
    sampleActive: "有効",
    editBtn: "編集",
    cancelBtn: "キャンセル",
    saveBtn: "保存"
  },
  ko: {
    mainTitle: "주요 시퀀스 다이어그램",
    userActor: "사용자",
    client: "프론트엔드 UI",
    api: "백엔드 API 서비스",
    db: "데이터베이스",
    stepInput: "작업 수행 및 요청 전송",
    stepRequest: "POST /api/v1/resource",
    stepQuery: "데이터 조회 / 저장",
    stepDbResult: "처리 결과",
    stepResponse: "200 OK (JSON Payload)",
    stepRender: "화면 결과 표시",
    wireframeTitle: "화면 와이어프레임",
    searchLabel: "검색어",
    searchBtn: "조회",
    createBtn: "+ 추가",
    colId: "번호",
    colName: "이름",
    colStatus: "상태",
    colAction: "작업",
    sampleItem: "예시 항목",
    sampleActive: "활성",
    editBtn: "수정",
    cancelBtn: "취소",
    saveBtn: "저장"
  }
};

function getUmlCopy(langCode) {
  return UML_COPY[normalizeLangKey(langCode)] || UML_COPY["zh-tw"];
}

const AGENTS_LOCALIZED = {
  "zh-cn": `# 项目角色

你是一位资深系统分析协作者，负责把需求想法整理成可确认、可归档、可检查的系统分析文档。

# 规范加载方式（OpenSpec CLI 模式）

本项目采用 \`@loviusc/sa-spec\` CLI 内置规范架构，**项目目录内不保留 \`skills/\` 与 \`rules/\` 文件夹**，完整规则与模板均由全局 \`sa-spec\` CLI 动态提供。执行任务前请先运行以下命令：

- \`sa-spec instructions <init|propose|analyze|commit|pdf> [--with-rules] [--json]\`：获取当前工作区状态、阶段步骤与完整分析规范。
- \`sa-spec rules [name|all] [--list] [--json]\`：读取内置补充规则。
- \`sa-spec templates [name] [--list] [--json]\`：读取内置规格模板。

# 核心交付物

每个需求归档时固定包含：
- \`srs.md\`：需求规格说明书
- \`uml/\`：UML 图目录（按视角拆分为独立 \`.puml\` 文件，禁止单文件混放多图；涉及 UI 时需产出 \`uml/wireframe.puml\` 的 \`@startsalt\` 线框图）
- \`openapi.yaml\`：OpenAPI 3.0.3 草案
- \`db-schema.md\`：DB Schema 草案
- \`handoff.md\`：开发交接摘要
- \`history.md\`：版本历程

# 指令流程

| 指令 | 简写 | 用途 | 核心规则 |
|---|---|---|---|
| \`spec:init\` | \`sci\` | 初始化 | 运行 \`sa-spec instructions init\` 与 \`sa-spec init --lang zh-CN\`。 |
| \`spec:propose\` | \`scp\` | 提出需求 | 建立并切换 \`feat/<slug>\`（支持 \`--slug <ascii-slug>\`），存在 remote 时自动推送，在 \`project/<slug>/\` 建立 \`{{REQ_ID}}\` 占位草案。 |
| \`spec:analyze\` | \`sca\` | 分析与起草 | 先检查 \`project/\` 内所有既有需求是否冲突；有冲突则只列冲突并最多提 3 个待澄清问题；无冲突才产出整套草稿。 |
| \`spec:commit\` | \`scc\` | 确认归档 | 运行 \`sa-spec finalize --name <slug> [--pr | --no-merge]\`：仅归档已确认版本，支持 PR 模式（默认由 \`system-spec.md\` 控制）。 |
| \`spec:pdf\` | \`spd\` | 导出 PDF | 运行 \`sa-spec pdf <target> [--split] [--online-uml] [--output <path>]\`。 |

# 重要限制

- **全项目语言单一纯粹**：所有需求文档（\`srs.md\`、\`uml/\`、\`openapi.yaml\`、\`db-schema.md\`、\`handoff.md\`、\`history.md\`）必须 **100% 使用简体中文**，业界公认英文技术术语（REST API、Webhook、JWT、OAuth 2.0、Payload、Idempotency、Redis 等）保留英文原文。
- 未经用户确认，不得将文档标记为「已审核」或擅自虚构未确认的业务规则。
- Git 提交信息格式：\`docs(REQ-001): 需求名称 - 简短需求说明\`。
`,
  ja: `# プロジェクトでの役割

あなたはシニアシステムアナリスト（System Analysis Collaborator）として、要望やアイデアを確認・アーカイブ・検証可能なシステム分析ドキュメントへ整理する役割を担います。

# 規範の読み込み方法（OpenSpec CLI モード）

本プロジェクトは \`@loviusc/sa-spec\` CLI の組み込み規範アーキテクチャを採用しており、**プロジェクト配下に \`skills/\` や \`rules/\` フォルダは保持しません**。実行前に必ず以下のコマンドで最新コンテキストと規範を取得してください：

- \`sa-spec instructions <init|propose|analyze|commit|pdf> [--with-rules] [--json]\`: 現在のワークスペース状態・ステップ・分析規範を取得します。
- \`sa-spec rules [name|all] [--list] [--json]\`: 組み込み補足ルールを読み込みます。
- \`sa-spec templates [name] [--list] [--json]\`: 組み込みテンプレートを読み込みます。

# 必須成果物

各要件のアーカイブには以下を必ず含めます：
- \`srs.md\`: 要件定義書（SRS）
- \`uml/\`: UML 図ディレクトリ（1 ファイル 1 図を厳守し、\`main.puml\` 等へ分割。UI がある場合は \`uml/wireframe.puml\` に \`@startsalt\` ワイヤーフレームを作成）
- \`openapi.yaml\`: OpenAPI 3.0.3 ドラフト
- \`db-schema.md\`: DB Schema ドラフト
- \`handoff.md\`: 開発ハンドオフサマリー
- \`history.md\`: 変更履歴

# コマンドフロー

| コマンド | 略称 | 用途 | ルール |
|---|---|---|---|
| \`spec:init\` | \`sci\` | 初期化 | \`sa-spec instructions init\` および \`sa-spec init --lang ja\` を実行。 |
| \`spec:propose\` | \`scp\` | 要件提案 | \`feat/<slug>\` ブランチを作成・切替（日本語名の場合は \`--slug <ascii-slug>\` を必須指定）、remote があれば push し \`project/<slug>/\` に \`{{REQ_ID}}\` プレースホルダー付きドラフトを作成。 |
| \`spec:analyze\` | \`sca\` | 分析・起草 | \`project/\` 内の既存要件と競合チェックを実施。競合がある場合は成果物を生成せず最大 3 つの確認質問のみ提示。競合なしの場合のみドラフトを生成。 |
| \`spec:commit\` | \`scc\` | 確定アーカイブ | ユーザー承認済みの版のみ \`sa-spec finalize --name <slug> [--pr | --no-merge]\` でアーカイブ。 |
| \`spec:pdf\` | \`spd\` | PDF 出力 | \`sa-spec pdf <target> [--split] [--online-uml] [--output <path>]\` を実行。 |

# 重要な制約

- **単一言語の徹底**：すべての要件ドキュメント（\`srs.md\`、\`uml/\`、\`openapi.yaml\`、\`db-schema.md\`、\`handoff.md\`、\`history.md\`）は **100% 日本語** で統一し、REST API、Webhook、JWT、OAuth 2.0、Payload、Idempotency、Redis 等の標準技術用語のみ英語表記を維持してください。
- ユーザー確認前に「承認済み（已審核 / Approved）」とマークしたり、未確認の業務ルールを推測で補完したりすることは禁止です。
- Git コミットメッセージ形式：\`docs(REQ-001): 要件名 - 簡潔な説明\`。
`,
  ko: `# 프로젝트 역할

당신은 시니어 시스템 분석 협업자(System Analysis Collaborator)로서, 요구사항 아이디어를 검토·아카이빙·검증 가능한 시스템 분석 문서로 정리합니다.

# 규범 로드 방식 (OpenSpec CLI 모드)

본 프로젝트는 \`@loviusc/sa-spec\` CLI 내장 규범 아키텍처를 사용하며, **프로젝트 디렉터리에 \`skills/\` 및 \`rules/\` 폴더를 두지 않습니다**. 작업 전 반드시 아래 명령으로 최신 컨텍스트와 규범을 조회하세요:

- \`sa-spec instructions <init|propose|analyze|commit|pdf> [--with-rules] [--json]\`: 현재 워크스페이스 상태, 단계별 절차, 전체 분석 규범을 가져옵니다.
- \`sa-spec rules [name|all] [--list] [--json]\`: 내장 세부 규칙을 조회합니다.
- \`sa-spec templates [name] [--list] [--json]\`: 내장 문서 템플릿을 조회합니다.

# 핵심 산출물

각 요구사항 아카이브에는 다음 파일이 포함됩니다:
- \`srs.md\`: 요구사항 명세서 (SRS)
- \`uml/\`: UML 다이어그램 디렉터리 (단일 파일 단일 다이어그램 원칙 엄수, UI 화면이 있을 경우 \`uml/wireframe.puml\`에 \`@startsalt\` 와이어프레임 필수 작성)
- \`openapi.yaml\`: OpenAPI 3.0.3 초안
- \`db-schema.md\`: DB Schema 초안
- \`handoff.md\`: 개발 핸드오프 요약서
- \`history.md\`: 버전 이력

# 명령 워크플로우

| 명령 | 단축어 | 용도 | 규칙 |
|---|---|---|---|
| \`spec:init\` | \`sci\` | 초기화 | \`sa-spec instructions init\` 및 \`sa-spec init --lang ko\` 실행. |
| \`spec:propose\` | \`scp\` | 요구사항 제안 | \`feat/<slug>\` 브랜치 생성 및 전환(비영문 이름은 \`--slug <ascii-slug>\` 필수), remote 설정 시 자동 push 후 \`project/<slug>/\`에 \`{{REQ_ID}}\` 플레이스홀더 초안 생성. |
| \`spec:analyze\` | \`sca\` | 분석 및 초안 작성 | \`project/\` 내 모든 기존 요구사항과 충돌 여부를 먼저 검사. 충돌 시 초안 생성 없이 최대 3개의 확인 질문만 제시. 충돌이 없을 때만 전체 초안 작성. |
| \`spec:commit\` | \`scc\` | 확정 아카이브 | 사용자 승인 버전에 한해 \`sa-spec finalize --name <slug> [--pr | --no-merge]\`로 아카이브. |
| \`spec:pdf\` | \`spd\` | PDF 내보내기 | \`sa-spec pdf <target> [--split] [--online-uml] [--output <path>]\` 실행. |

# 주요 제한 사항

- **단일 언어 일관성**: 모든 요구사항 문서(\`srs.md\`, \`uml/\`, \`openapi.yaml\`, \`db-schema.md\`, \`handoff.md\`, \`history.md\`)는 **100% 한국어**로 작성하며, REST API, Webhook, JWT, OAuth 2.0, Payload, Idempotency, Redis 등 표준 기술 용어만 영문 원어를 유지합니다.
- 사용자 승인 없이 문서를 승인됨 상태로 표시하거나 미확인 비즈니스 규칙을 임의로 가정하지 마세요.
- Git 커밋 메시지 형식: \`docs(REQ-001): 요구사항 이름 - 간략한 설명\`.
`
};

function buildLocalizedAgentsMarkdown(langCode, templatesDir) {
  const key = normalizeLangKey(langCode);
  if (key === "en") {
    const enPath = templatesDir ? path.join(templatesDir, "AGENTS.en.md") : "";
    if (enPath && fs.existsSync(enPath)) {
      return fs.readFileSync(enPath, "utf8");
    }
  }
  if (AGENTS_LOCALIZED[key]) {
    return AGENTS_LOCALIZED[key];
  }
  const twPath = templatesDir ? path.join(templatesDir, "AGENTS.md") : "";
  if (twPath && fs.existsSync(twPath)) {
    return fs.readFileSync(twPath, "utf8");
  }
  return AGENTS_LOCALIZED["zh-cn"];
}

function extractSrsMetadata(srsContent) {
  const content = String(srsContent || "");
  const status = extractStatusFromContent(content);
  let title = "";

  const headingMatch = content.match(/^#\s+(.+)$/m);
  if (headingMatch) {
    let rawHeading = headingMatch[1].trim();
    rawHeading = rawHeading
      .replace(/^(?:需求規格|需求规格|要件定義書?|要件仕様書?|요구사항\s*명세서?|Software Requirements Specification)\s*[：:]\s*/i, "")
      .replace(/^\[?\s*(?:REQ-\d+|\{\{REQ_ID\}\})\s*\]?\s*(?:[：:\-–—]\s*)?/i, "")
      .replace(/\s+(?:SRS|需求規格|需求规格|要件定義書?|요구사항\s*명세서?)$/i, "")
      .trim();
    if (rawHeading && !/^\{\{.+\}\}$/.test(rawHeading)) {
      title = rawHeading;
    }
  }

  let description = "";
  const summaryMatch = content.match(/^##\s+(?:摘要|Summary|概要|요약)(?=$|[\s：:])[^\n]*\n([\s\S]*?)(?=^##\s|(?![\s\S]))/im);
  if (summaryMatch) {
    const lines = summaryMatch[1].split(/\r?\n/);
    for (const rawLine of lines) {
      let line = rawLine.trim();
      if (!line || line.startsWith("<!--") || line.startsWith("---")) continue;
      line = line.replace(/^[-*>]\s+/, "").replace(/^\|+\s*/, "").replace(/\s*\|+$/, "").trim();
      if (!line || /^[\s|:\-]+$/.test(line)) continue;
      if (/^(?:\{\{.+\}\}|\[(?:TBD|TODO)\]|TBD|TODO|[(（<](?:尚未填寫|待補充|待补充|未記入|작성 전|請填寫|请填写)[)）>])$/i.test(line)) {
        continue;
      }
      description = line.replace(/\s+/g, " ");
      if (description.length > 80) {
        description = `${description.slice(0, 77)}...`;
      }
      break;
    }
  }

  return { title, description, status };
}

module.exports = {
  SUPPORTED_LANGS,
  normalizeLangKey,
  getLangStrings,
  detectProjectLanguage,
  extractStatusFromContent,
  extractSpecVersion,
  extractMergeStrategy,
  stampSpecVersionInContent,
  escapeIndexCell,
  parseIndexRows,
  buildIndexMarkdown,
  buildSystemSpecMarkdown,
  buildWorkspaceReadmeMarkdown,
  buildLocalizedReqFileContent,
  buildLocalizedAgentsMarkdown,
  extractSrsMetadata
};
