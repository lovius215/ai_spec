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
      flows: "流程",
      uiSpec: "UI / 畫面規格",
      uiRef: "若有前端介面需求，請參考 `uml/wireframe.puml`；純後端需求請填寫「無 UI 介面需求」。",
      acceptance: "驗收條件",
      openQuestions: "待確認"
    },
    dbTitle: "DB Schema",
    dbSections: ["資料表清單", "欄位說明", "索引與唯一性", "待確認"],
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
    historyHeader: "| 版本 | 日期 | 變更摘要 | 狀態 |",
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
      flows: "Workflows",
      uiSpec: "UI / Screen Specification",
      uiRef: "If this requirement includes frontend UI, refer to `uml/wireframe.puml`; for backend-only work, state \"No UI required\".",
      acceptance: "Acceptance Criteria",
      openQuestions: "Open Questions"
    },
    dbTitle: "DB Schema",
    dbSections: ["Tables", "Columns & Types", "Indexes & Constraints", "Open Questions"],
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
    historyHeader: "| Version | Date | Summary | Status |",
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
      flows: "流程",
      uiSpec: "UI / 界面规格",
      uiRef: "若涉及前端界面，请参考 `uml/wireframe.puml`；纯后端需求请注明「无 UI 界面需求」。",
      acceptance: "验收条件",
      openQuestions: "待确认"
    },
    dbTitle: "DB Schema",
    dbSections: ["数据表清单", "字段说明", "索引与唯一性", "待确认"],
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
    historyHeader: "| 版本 | 日期 | 变更摘要 | 状态 |",
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
      flows: "業務フロー",
      uiSpec: "UI / 画面仕様",
      uiRef: "フロントエンド UI がある場合は `uml/wireframe.puml` を参照してください。バックエンド専用の場合は「UI 要件なし」と記載してください。",
      acceptance: "受入条件",
      openQuestions: "未確認事項"
    },
    dbTitle: "DB Schema",
    dbSections: ["テーブル一覧", "カラム定義", "インデックスと制約", "未確認事項"],
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
    historyHeader: "| バージョン | 日付 | 変更概要 | ステータス |",
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
      flows: "프로세스",
      uiSpec: "UI / 화면 사양",
      uiRef: "프론트엔드 UI가 포함된 경우 `uml/wireframe.puml`을 참조하고, 백엔드 전용인 경우 \"UI 요구사항 없음\"으로 표기하세요.",
      acceptance: "인수 조건",
      openQuestions: "미확인 사항"
    },
    dbTitle: "DB Schema",
    dbSections: ["테이블 목록", "컬럼 정의", "인덱스 및 제약조건", "미확인 사항"],
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
    historyHeader: "| 버전 | 날짜 | 변경 요약 | 상태 |",
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

function parseIndexRows(content) {
  return content
    .split("\n")
    .filter((line) => {
      if (!line.startsWith("|")) return false;
      if (line.includes("---")) return false;
      const cols = line
        .split("|")
        .map((c) => c.trim().toLowerCase())
        .filter(Boolean);
      if (cols.length > 0 && INDEX_HEADER_KEYWORDS.some((kw) => cols[0] === kw.toLowerCase())) {
        return false;
      }
      return true;
    })
    .map((line) => line.split("|").map((part) => part.trim()))
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
    .map((r) => `| ${r.id} | ${r.title} | ${r.description} | ${r.status} | ${r.createdAt} | ${r.updatedAt} |`)
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

function buildLocalizedReqFileContent(langCode, relType, replacements) {
  const t = getLangStrings(langCode);
  const reqId = replacements.REQ_ID || "{{REQ_ID}}";
  const reqName = replacements.REQ_NAME || "";

  switch (relType) {
    case "srs.md": {
      const s = t.srsLabels;
      return [
        `# ${reqId} ${reqName} ${t.srsTitlePrefix}`,
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
        "",
        `## ${s.flows}`,
        `${t.tbd}.`,
        "",
        `## ${s.uiSpec}`,
        s.uiRef,
        "",
        `## ${s.acceptance}`,
        `- ${t.tbd}`,
        "",
        `## ${s.openQuestions}`,
        `- ${t.tbd}`,
        ""
      ].join("\n");
    }
    case "db-schema.md":
      return [
        `# ${reqId} ${reqName} ${t.dbTitle}`,
        "",
        ...t.dbSections.flatMap((h) => [`## ${h}`, `${t.tbd}.`, ""]),
        ""
      ]
        .join("\n")
        .trimEnd() + "\n";
    case "handoff.md":
      return [
        `# ${reqId} ${reqName} ${t.handoffTitle}`,
        "",
        ...t.handoffSections.flatMap((h) => {
          if (h === t.handoffSections[7]) {
            return [`## ${h}`, t.handoffUiNote, ""];
          }
          return [`## ${h}`, `${t.tbd}.`, ""];
        })
      ]
        .join("\n")
        .trimEnd() + "\n";
    case "history.md":
      return [
        `# ${reqId} ${reqName} ${t.historyTitle}`,
        "",
        t.historyHeader,
        "|---|---|---|---|",
        `| v0.1 | ${t.tbd} | ${t.draft} | ${t.pending} |`,
        ""
      ].join("\n");
    default:
      return null;
  }
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
  parseIndexRows,
  buildIndexMarkdown,
  buildSystemSpecMarkdown,
  buildWorkspaceReadmeMarkdown,
  buildLocalizedReqFileContent
};
