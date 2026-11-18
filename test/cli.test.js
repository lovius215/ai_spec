const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync, execFileSync } = require("child_process");
const { encodePlantUml, buildHtmlDocument, buildMergedRequirementMarkdown } = require("../src/pdf");
const {
  normalizeLangKey,
  parseIndexRows,
  formatLocalDate,
  detectProjectLanguage,
  extractStatusFromContent,
  extractSpecVersion,
  extractMergeStrategy,
  extractSrsMetadata
} = require("../src/i18n");
const { getPositionalArgs } = require("../src/instructions");

const ROOT_DIR = path.resolve(__dirname, "..");
const CLI_PATH = path.join(ROOT_DIR, "bin", "sa-spec.js");
const TEMPLATES_DIR = path.join(ROOT_DIR, "templates");
const PKG_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8")).version;

function makeTempDir(prefix = "sa-spec-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function runCli(cwd, args = []) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, SA_SPEC_NO_UML_NET: "1" }
  });
}

test("#1 rejects pure CJK requirement name without --slug and succeeds with --slug", (t) => {
  const dir = makeTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  let res = runCli(dir, ["init"]);
  assert.equal(res.status, 0, res.stderr);

  const bad = runCli(dir, ["new", "--name", "購物車"]);
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /--slug/);
  assert.equal(fs.existsSync(path.join(dir, "project", "srs.md")), false);

  const good = runCli(dir, ["new", "--name", "購物車", "--slug", "shopping-cart"]);
  assert.equal(good.status, 0, good.stderr);
  assert.equal(fs.existsSync(path.join(dir, "project", "shopping-cart", "srs.md")), true);

  const fin = runCli(dir, ["finalize", "--name", "購物車", "--slug", "shopping-cart"]);
  assert.equal(fin.status, 0, fin.stderr);
  assert.equal(fs.existsSync(path.join(dir, "project", "REQ-001-shopping-cart", "srs.md")), true);
});

test("#2 & #3 & #10 English init creates localized files, stamps version, uses concise readme, and parses English status/index", (t) => {
  const dir = makeTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const initRes = runCli(dir, ["init", "--lang", "en"]);
  assert.equal(initRes.status, 0, initRes.stderr);

  const agents = fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8");
  assert.match(agents, /Specification Loading/);

  const spec = fs.readFileSync(path.join(dir, "project", "system-spec.md"), "utf8");
  assert.match(spec, /Language：English \(en\)/);
  assert.match(spec, new RegExp(`Spec Version：${PKG_VERSION.replace(/\./g, "\\.")}`));

  const workspaceReadme = fs.readFileSync(path.join(dir, "readme.md"), "utf8");
  assert.ok(workspaceReadme.length < 2000, "workspace readme should be concise, not 37KB package README");
  assert.match(workspaceReadme, /System Analysis Specification Workspace/);

  const newRes = runCli(dir, ["new", "--id", "REQ-001", "--name", "auth"]);
  assert.equal(newRes.status, 0, newRes.stderr);

  const srs = fs.readFileSync(path.join(dir, "project", "REQ-001-auth", "srs.md"), "utf8");
  assert.match(srs, /- Status：Pending/);

  const statusRes = runCli(dir, ["status"]);
  assert.equal(statusRes.status, 0, statusRes.stderr);
  assert.match(statusRes.stdout, /系統規格書狀態: Draft/);
  assert.match(statusRes.stdout, /需求總數: 1/);
  assert.doesNotMatch(statusRes.stdout, /ID Title/);

  const reindexRes = runCli(dir, ["reindex"]);
  assert.equal(reindexRes.status, 0, reindexRes.stderr);
  const indexAfter = fs.readFileSync(path.join(dir, "project", "index.md"), "utf8");
  assert.match(indexAfter, /\| ID \| Title \| Description \| Status \|/);
});

test("#3 & #7 check detects version mismatch, multi-diagram puml, leftover {{REQ_ID}}, and missing handoff sections", (t) => {
  const dir = makeTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  assert.equal(runCli(dir, ["init", "--lang", "en"]).status, 0);
  assert.equal(runCli(dir, ["new", "--id", "REQ-001", "--name", "login"]).status, 0);

  // Clean project should pass without warnings
  const cleanCheck = runCli(dir, ["check"]);
  assert.equal(cleanCheck.status, 0);
  assert.match(cleanCheck.stdout, new RegExp(`規範版本: OK \\(${PKG_VERSION.replace(/\./g, "\\.")}\\)`));
  assert.match(cleanCheck.stdout, /需求內容檢查: OK \(1 個已歸檔需求\)/);

  // Introduce version mismatch alone first -> pass in normal mode, fail in --strict mode
  const specPath = path.join(dir, "project", "system-spec.md");
  fs.writeFileSync(specPath, fs.readFileSync(specPath, "utf8").replace(PKG_VERSION, "0.2.5"), "utf8");

  const mismatchCheck = runCli(dir, ["check"]);
  assert.equal(mismatchCheck.status, 0);
  assert.match(mismatchCheck.stdout, /規範版本: WARNING/);

  const strictCheck = runCli(dir, ["check", "--strict"]);
  assert.equal(strictCheck.status, 1);

  // Introduce multi-diagram puml + leftover placeholder + broken handoff -> non-zero exit code
  const reqDir = path.join(dir, "project", "REQ-001-login");
  fs.writeFileSync(
    path.join(reqDir, "uml", "sequence.puml"),
    "@startuml\nA -> B\n@enduml\n@startuml\nC -> D\n@enduml\n",
    "utf8"
  );
  fs.writeFileSync(path.join(reqDir, "srs.md"), "# {{REQ_ID}} broken\n", "utf8");
  fs.writeFileSync(path.join(reqDir, "handoff.md"), "# Empty handoff\n", "utf8");

  const dirtyCheck = runCli(dir, ["check"]);
  assert.equal(dirtyCheck.status, 1);
  assert.match(dirtyCheck.stdout, /規範版本: WARNING/);
  assert.match(dirtyCheck.stdout, /違反單檔單圖原則/);
  assert.match(dirtyCheck.stdout, /\{\{REQ_ID\}\}/);
  assert.match(dirtyCheck.stdout, /handoff\.md 缺少 API/);
});

test("#5 & #6 finalize respects --pr / --no-merge and guards against concurrent remote ID collision", (t) => {
  const remoteDir = makeTempDir("sa-spec-remote-");
  const workA = makeTempDir("sa-spec-a-");
  const workB = makeTempDir("sa-spec-b-");
  t.after(() => {
    fs.rmSync(remoteDir, { recursive: true, force: true });
    fs.rmSync(workA, { recursive: true, force: true });
    fs.rmSync(workB, { recursive: true, force: true });
  });

  execFileSync("git", ["init", "--bare", remoteDir]);
  execFileSync("git", ["init", "-b", "master"], { cwd: workA });
  execFileSync("git", ["config", "user.email", "a@example.com"], { cwd: workA });
  execFileSync("git", ["config", "user.name", "User A"], { cwd: workA });

  assert.equal(runCli(workA, ["init"]).status, 0);
  execFileSync("git", ["remote", "add", "origin", remoteDir], { cwd: workA });
  execFileSync("git", ["add", "."], { cwd: workA });
  execFileSync("git", ["commit", "-m", "init"], { cwd: workA });
  execFileSync("git", ["push", "-u", "origin", "master"], { cwd: workA });

  // Clone to B before A finalizes REQ-001
  execFileSync("git", ["clone", remoteDir, workB]);
  execFileSync("git", ["config", "user.email", "b@example.com"], { cwd: workB });
  execFileSync("git", ["config", "user.name", "User B"], { cwd: workB });

  // A creates feat/auth and finalizes with --pr (no merge into master)
  assert.equal(runCli(workA, ["new", "--name", "auth", "--branch"]).status, 0);
  const finPr = runCli(workA, ["finalize", "--name", "auth", "--pr"]);
  assert.equal(finPr.status, 0, finPr.stderr);
  assert.match(finPr.stdout, /已略過自動合併/);
  assert.equal(fs.existsSync(path.join(workA, "project", "REQ-001-auth")), true);
  const branchA = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: workA, encoding: "utf8" }).trim();
  assert.equal(branchA, "feat/auth");

  // B creates feat/pay and finalizes with --auto-merge -> scans origin/feat/auth, reserves REQ-002-pay without colliding!
  assert.equal(runCli(workB, ["new", "--name", "pay", "--branch"]).status, 0);
  const finB = runCli(workB, ["finalize", "--name", "pay", "--auto-merge"]);
  assert.equal(finB.status, 0, finB.stderr);
  assert.equal(fs.existsSync(path.join(workB, "project", "REQ-002-pay")), true);

  // Now A finalizes auth with --auto-merge -> sees origin/master REQ-002-pay, assigns REQ-003-auth and merges cleanly!
  execFileSync("git", ["checkout", "feat/auth"], { cwd: workA });
  const finA2 = runCli(workA, ["finalize", "--name", "auth", "--auto-merge"]);
  assert.equal(finA2.status, 0, finA2.stderr);
  assert.equal(fs.existsSync(path.join(workA, "project", "REQ-003-auth")), true);
  assert.equal(fs.existsSync(path.join(workA, "project", "REQ-002-pay")), true);
  assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: workA, encoding: "utf8" }).trim(), "");
});

test("#8 upgrade removes legacy managed skills/rules, preserves custom files & claude-mem-context, and protects source repo", (t) => {
  const dir = makeTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  assert.equal(runCli(dir, ["init", "--lang", "ja"]).status, 0);
  fs.cpSync(path.join(TEMPLATES_DIR, "skills"), path.join(dir, "skills"), { recursive: true });
  fs.cpSync(path.join(TEMPLATES_DIR, "rules"), path.join(dir, "rules"), { recursive: true });
  fs.writeFileSync(path.join(dir, "rules", "custom-company.md"), "# Keep me\n", "utf8");
  fs.writeFileSync(
    path.join(dir, "AGENTS.md"),
    "# Legacy\n<claude-mem-context>\nimportant memory\n</claude-mem-context>\n",
    "utf8"
  );

  const dryRes = runCli(dir, ["upgrade", "--dry-run"]);
  assert.equal(dryRes.status, 0);
  assert.match(dryRes.stdout, /WOULD REMOVE skills\/system-analysis\/SKILL\.md/);
  assert.equal(fs.existsSync(path.join(dir, "skills", "system-analysis", "SKILL.md")), true);

  const upgRes = runCli(dir, ["update"]);
  assert.equal(upgRes.status, 0);
  assert.match(upgRes.stdout, /REMOVED skills\//);
  assert.match(upgRes.stdout, /WARNING rules\/custom-company\.md/);
  assert.equal(fs.existsSync(path.join(dir, "skills")), false);
  assert.equal(fs.existsSync(path.join(dir, "rules", "spec.md")), false);
  assert.equal(fs.existsSync(path.join(dir, "rules", "custom-company.md")), true);

  const agentsAfter = fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8");
  assert.match(agentsAfter, /important memory/);
  assert.match(agentsAfter, /sa-spec instructions/);

  // Source repo protection & single-source templates check
  const srcDry = runCli(ROOT_DIR, ["upgrade", "--dry-run"]);
  assert.equal(srcDry.status, 0);
  assert.match(srcDry.stdout, /套件開發主目錄/);
  assert.equal(fs.existsSync(path.join(ROOT_DIR, "skills")), false);
  assert.equal(fs.existsSync(path.join(ROOT_DIR, "rules")), false);
  assert.equal(fs.existsSync(path.join(TEMPLATES_DIR, "skills", "system-analysis", "SKILL.md")), true);
});

test("#9 PlantUML encoder, SVG rendering, privacy default, and dynamic html lang", (t) => {
  const encoded = encodePlantUml("@startuml\nAlice -> Bob: Hi\n@enduml");
  assert.ok(encoded.length > 10);
  assert.match(encoded, /^[0-9A-Za-z\-_]+$/);

  const fallbackHtml = buildHtmlDocument("Test", "```plantuml\n@startuml\nA -> B\n@enduml\n```", {
    noUmlRender: true,
    lang: "en"
  });
  assert.match(fallbackHtml, /<html lang="en">/);
  assert.match(fallbackHtml, /class="language-plantuml"/);
  assert.match(fallbackHtml, /\.uml-diagram/);

  // Test offline-by-default privacy guard (without SA_SPEC_NO_UML_NET and without --online-uml)
  const emptyBinDir = makeTempDir("sa-spec-empty-bin-");
  t.after(() => fs.rmSync(emptyBinDir, { recursive: true, force: true }));
  const prevNoNet = process.env.SA_SPEC_NO_UML_NET;
  const prevPath = process.env.PATH;
  delete process.env.SA_SPEC_NO_UML_NET;
  process.env.PATH = emptyBinDir;
  try {
    const privateHtml = buildHtmlDocument("Test", "```plantuml\n@startuml\nA -> B\n@enduml\n```", {
      lang: "ja"
    });
    assert.match(privateHtml, /<html lang="ja">/);
    assert.match(privateHtml, /class="language-plantuml"/);
  } finally {
    process.env.PATH = prevPath;
    if (prevNoNet !== undefined) process.env.SA_SPEC_NO_UML_NET = prevNoNet;
  }

  // Test local plantuml CLI SVG embedding via mock binary on PATH
  const binDir = makeTempDir("sa-spec-bin-");
  t.after(() => fs.rmSync(binDir, { recursive: true, force: true }));
  const mockPlantUml = path.join(binDir, "plantuml");
  fs.writeFileSync(mockPlantUml, '#!/bin/sh\necho "<svg><text>UML</text></svg>"\n', { mode: 0o755 });

  process.env.PATH = `${binDir}:${prevPath}`;
  try {
    const svgHtml = buildHtmlDocument("Test", "```plantuml\n@startuml\nA -> B\n@enduml\n```", {
      offlineUml: true
    });
    assert.match(svgHtml, /<div class="uml-diagram"><svg><text>UML<\/text><\/svg><\/div>/);
  } finally {
    process.env.PATH = prevPath;
  }
});

test("#11 init --lang ja localizes AGENTS.md and UML, instructions emits directive, templates supports --lang", (t) => {
  const dir = makeTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  assert.equal(runCli(dir, ["init", "--lang", "ja"]).status, 0);
  const agents = fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8");
  assert.match(agents, /プロジェクトでの役割/);
  assert.match(agents, /100% 日本語/);

  const newRes = runCli(dir, ["new", "--name", "カート決済", "--slug", "cart-checkout"]);
  assert.equal(newRes.status, 0, newRes.stderr);

  const mainPuml = fs.readFileSync(path.join(dir, "project", "cart-checkout", "uml", "sequence.puml"), "utf8");
  assert.match(mainPuml, /主要シーケンス図/);
  assert.match(mainPuml, /ユーザー/);
  assert.match(mainPuml, /カート決済/);

  const wirePuml = fs.readFileSync(path.join(dir, "project", "cart-checkout", "uml", "wireframe.puml"), "utf8");
  assert.match(wirePuml, /@startsalt/);
  assert.match(wirePuml, /画面ワイヤーフレーム/);

  const instRes = runCli(dir, ["instructions", "analyze", "--json"]);
  assert.equal(instRes.status, 0, instRes.stderr);
  const parsedInst = JSON.parse(instRes.stdout);
  assert.match(parsedInst.languageDirective, /日本語 \(ja\)/);

  const koTplRes = runCli(dir, ["templates", "uml-main", "--lang", "ko"]);
  assert.equal(koTplRes.status, 0, koTplRes.stderr);
  assert.match(koTplRes.stdout, /주요 시퀀스 다이어그램/);
});

test("#12 reindex extracts smart title and summary description from varied srs.md headings", (t) => {
  const dir = makeTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  assert.equal(runCli(dir, ["init"]).status, 0);
  const req1Dir = path.join(dir, "project", "REQ-001-cart");
  const req2Dir = path.join(dir, "project", "REQ-002-checkout");
  fs.mkdirSync(req1Dir, { recursive: true });
  fs.mkdirSync(req2Dir, { recursive: true });

  fs.writeFileSync(
    path.join(req1Dir, "srs.md"),
    "# REQ-001：購物車結帳系統\n\n- 狀態：已審核\n\n## 摘要\n- 建立支援優惠券折扣與信用卡付款的購物車結帳 API。\n",
    "utf8"
  );
  fs.writeFileSync(
    path.join(req2Dir, "srs.md"),
    "# [REQ-002] Checkout Flow SRS\n\n- Status：Approved\n\n## Summary\nTBD\nSupport one-click checkout with idempotent payment intent creation.\n",
    "utf8"
  );

  const reindexRes = runCli(dir, ["reindex"]);
  assert.equal(reindexRes.status, 0, reindexRes.stderr);

  const indexContent = fs.readFileSync(path.join(dir, "project", "index.md"), "utf8");
  assert.match(
    indexContent,
    /\| REQ-001 \| 購物車結帳系統 \| 建立支援優惠券折扣與信用卡付款的購物車結帳 API。 \| 已審核 \|/
  );
  assert.match(
    indexContent,
    /\| REQ-002 \| Checkout Flow \| Support one-click checkout with idempotent payment intent creation\. \| Approved \|/
  );
});

test("#13 finalize scopes git staging and skips auto-merge safely when working tree is dirty", (t) => {
  const dir = makeTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  execFileSync("git", ["init", "-b", "master"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "dev@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Developer"], { cwd: dir });

  assert.equal(runCli(dir, ["init"]).status, 0);
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-m", "init workspace"], { cwd: dir });

  // Create draft branch & commit tracked draft once so rename deletion is also exercised
  assert.equal(runCli(dir, ["new", "--name", "購物車", "--slug", "shopping-cart", "--branch"]).status, 0);
  execFileSync("git", ["add", "project/shopping-cart"], { cwd: dir });
  execFileSync("git", ["commit", "-m", "wip draft"], { cwd: dir });

  // Introduce unrelated untracked draft & modified tracked file
  fs.mkdirSync(path.join(dir, "project", "other-draft"), { recursive: true });
  fs.writeFileSync(path.join(dir, "project", "other-draft", "srs.md"), "# Keep untracked\n", "utf8");
  fs.appendFileSync(path.join(dir, "readme.md"), "\nLocal uncommitted edit\n", "utf8");

  const finRes = runCli(dir, ["finalize", "--name", "shopping-cart", "--auto-merge"]);
  assert.equal(finRes.status, 0, finRes.stderr);
  assert.match(finRes.stderr, /工作區仍有未提交的變更/);
  assert.equal(fs.existsSync(path.join(dir, "project", "REQ-001-shopping-cart", "srs.md")), true);

  // Branch remains feat/shopping-cart (not switched while dirty)
  const headBranch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
  assert.equal(headBranch, "feat/shopping-cart");

  // Commit includes only finalized REQ + index + renamed draft removal, not other-draft or readme.md
  const committedFiles = execFileSync("git", ["show", "--pretty=format:", "--name-only", "HEAD"], {
    cwd: dir,
    encoding: "utf8"
  });
  assert.match(committedFiles, /project\/REQ-001-shopping-cart\/srs\.md/);
  assert.match(committedFiles, /project\/index\.md/);
  assert.doesNotMatch(committedFiles, /other-draft/);
  assert.doesNotMatch(committedFiles, /readme\.md/);

  // Dirty changes still remain intact in working tree
  assert.equal(fs.existsSync(path.join(dir, "project", "other-draft", "srs.md")), true);
  assert.match(fs.readFileSync(path.join(dir, "readme.md"), "utf8"), /Local uncommitted edit/);
});

test("#14 YAML-safe openapi title, complete srs sections/check, template system-spec, localized merged PDF & nested lists", (t) => {
  const dir = makeTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  assert.equal(runCli(dir, ["init"]).status, 0);
  const res = runCli(dir, ["new", "--id", "REQ-001", "--name", "會員: OAuth", "--slug", "oauth"]);
  assert.equal(res.status, 0, res.stderr);

  const reqDir = path.join(dir, "project", "REQ-001-oauth");
  const openapiContent = fs.readFileSync(path.join(reqDir, "openapi.yaml"), "utf8");
  assert.match(openapiContent, /title: "REQ-001 會員: OAuth API"/);

  const srsContent = fs.readFileSync(path.join(reqDir, "srs.md"), "utf8");
  assert.match(srsContent, /## 功能需求/);
  assert.match(srsContent, /## 非功能需求與業務規則/);
  assert.match(srsContent, /## 相關文件/);

  // Clean project passes check
  assert.equal(runCli(dir, ["check"]).status, 0);

  // Unquoted colon in openapi.yaml title should trigger check failure
  fs.writeFileSync(
    path.join(reqDir, "openapi.yaml"),
    "openapi: 3.0.3\ninfo:\n  title: REQ-001 會員: OAuth API\n  version: 0.1.0\npaths: {}\n",
    "utf8"
  );
  const badYamlCheck = runCli(dir, ["check"]);
  assert.equal(badYamlCheck.status, 1);
  assert.match(badYamlCheck.stdout, /未加引號的冒號/);

  // Legacy template system-spec should emit live localized content without raw {{LANG_LABEL}}
  const tplSpec = runCli(dir, ["template", "system-spec", "--stdout"]);
  assert.equal(tplSpec.status, 0, tplSpec.stderr);
  assert.doesNotMatch(tplSpec.stdout, /\{\{LANG_LABEL\}\}/);
  assert.match(tplSpec.stdout, /規範版本/);
  assert.match(tplSpec.stdout, /合併策略/);

  // Localized merged markdown headings for non-zh-TW PDF export
  const enMerged = buildMergedRequirementMarkdown(reqDir, { lang: "en" });
  assert.match(enMerged.markdown, /# OpenAPI Specification \(`openapi\.yaml`\)/);
  assert.match(enMerged.markdown, /# UML Diagrams \(`uml\/`\)/);
  assert.doesNotMatch(enMerged.markdown, /OpenAPI 介面規格/);

  // <br> inside Markdown tables & nested lists render properly in HTML
  const html = buildHtmlDocument(
    "Formatting",
    "| Col |\n|---|\n| Line 1<br>Line 2 |\n\n- Parent\n  - Child\n    1. Sub\n- Sibling\n",
    { noUmlRender: true, lang: "en" }
  );
  assert.match(html, /<td[^>]*>Line 1<br\/>Line 2<\/td>/);
  assert.match(html, /<ul><li>Parent<ul><li>Child<ol><li>Sub<\/li><\/ol><\/li><\/ul><\/li><li>Sibling<\/li><\/ul>/);
});

test("#15 built-in rules have no legacy file names, db/history templates align, and reindex refreshes updatedAt", (t) => {
  const dir = makeTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const fileStyle = runCli(dir, ["rules", "file-style"]);
  assert.equal(fileStyle.status, 0, fileStyle.stderr);
  assert.doesNotMatch(fileStyle.stdout, /\bdb-table\.md\b/);
  assert.doesNotMatch(fileStyle.stdout, /\bwireframe\.md\b/);
  assert.doesNotMatch(fileStyle.stdout, /\bapi\.md\b/);
  assert.match(fileStyle.stdout, /project\/system-spec\.md/);
  assert.match(fileStyle.stdout, /uml\/wireframe\.puml/);

  const dbRule = runCli(dir, ["rules", "db-table"]);
  assert.equal(dbRule.status, 0, dbRule.stderr);
  assert.match(dbRule.stdout, /`db-schema\.md` 至少包含/);

  const wireRule = runCli(dir, ["rules", "wireframe"]);
  assert.equal(wireRule.status, 0, wireRule.stderr);
  assert.match(wireRule.stdout, /uml\/wireframe\.puml/);
  assert.match(wireRule.stdout, /@startsalt/);

  const estRule = runCli(dir, ["rules", "estimation"]);
  assert.equal(estRule.status, 0, estRule.stderr);
  assert.doesNotMatch(estRule.stdout, /\bspec:review\b/);

  assert.equal(runCli(dir, ["init"]).status, 0);
  assert.equal(runCli(dir, ["new", "--id", "REQ-001", "--name", "orders"]).status, 0);

  const reqDir = path.join(dir, "project", "REQ-001-orders");
  const dbContent = fs.readFileSync(path.join(reqDir, "db-schema.md"), "utf8");
  assert.match(dbContent, /- 狀態：待確認/);
  assert.match(dbContent, /## Migration 與資料保留規則/);

  const historyContent = fs.readFileSync(path.join(reqDir, "history.md"), "utf8");
  assert.match(historyContent, /\| 版本 \| 日期 \| 異動類型 \| 異動摘要 \| 影響範圍 \| 狀態 \|/);
  assert.match(historyContent, /\|\s*v0\.1\s*\|\s*\d{4}-\d{2}-\d{2}\s*\|/);

  // Modify srs.md with a future mtime (+5 min) -> reindex must advance updatedAt
  const indexBefore = fs.readFileSync(path.join(dir, "project", "index.md"), "utf8");
  const beforeMatch = indexBefore.match(/\| REQ-001 \|[^|]+\|[^|]+\|[^|]+\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/);
  assert.ok(beforeMatch);
  const createdBefore = beforeMatch[1];
  const updatedBefore = beforeMatch[2];

  const srsPath = path.join(reqDir, "srs.md");
  fs.writeFileSync(
    srsPath,
    fs.readFileSync(srsPath, "utf8").replace("待確認", "已審核").replace("待補充。", "支援訂單查詢。"),
    "utf8"
  );
  const futureDate = new Date(Date.now() + 5 * 60 * 1000);
  fs.utimesSync(srsPath, futureDate, futureDate);

  assert.equal(runCli(dir, ["reindex"]).status, 0);
  const indexAfter = fs.readFileSync(path.join(dir, "project", "index.md"), "utf8");
  const afterMatch = indexAfter.match(/\| REQ-001 \|[^|]+\|[^|]+\|[^|]+\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/);
  assert.ok(afterMatch);
  assert.equal(afterMatch[1], createdBefore);
  assert.notEqual(afterMatch[2], updatedBefore);
});

test("#16 upgrade localizes injected UI handoff section, getOption validates missing values and supports --flag=value", (t) => {
  const dir = makeTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  assert.equal(runCli(dir, ["init", "--lang", "en"]).status, 0);
  assert.equal(runCli(dir, ["new", "--id", "REQ-001", "--name", "demo"]).status, 0);

  const handoffPath = path.join(dir, "project", "REQ-001-demo", "handoff.md");
  fs.writeFileSync(
    handoffPath,
    [
      "# REQ-001 demo Developer Handoff Summary",
      "",
      "## API Contracts",
      "- GET /api/v1/demo",
      "",
      "## DB Changes",
      "- None",
      "",
      "## Acceptance Criteria",
      "- Works",
      ""
    ].join("\n"),
    "utf8"
  );

  const upgRes = runCli(dir, ["upgrade"]);
  assert.equal(upgRes.status, 0, upgRes.stderr);

  const handoffAfter = fs.readFileSync(handoffPath, "utf8");
  assert.match(handoffAfter, /## UI \/ Screen Specification/);
  assert.match(handoffAfter, /uml\/wireframe\.puml/);
  assert.doesNotMatch(handoffAfter, /畫面規格|驗收條件/);
  assert.ok(
    handoffAfter.indexOf("## UI / Screen Specification") < handoffAfter.indexOf("## Acceptance Criteria"),
    "UI section should be inserted before Acceptance Criteria"
  );

  // Missing value before another flag must fail and not create project/branch
  const missingVal = runCli(dir, ["new", "--name", "--branch"]);
  assert.notEqual(missingVal.status, 0);
  assert.match(missingVal.stderr, /--name/);
  assert.equal(fs.existsSync(path.join(dir, "project", "branch")), false);

  // Empty --flag= value must fail
  const emptyEq = runCli(dir, ["new", "--name="]);
  assert.notEqual(emptyEq.status, 0);
  assert.match(emptyEq.stderr, /--name/);

  // Valid --flag=value must work cleanly across commands
  const eqValid = runCli(dir, ["new", "--name=inline-test"]);
  assert.equal(eqValid.status, 0, eqValid.stderr);
  assert.equal(fs.existsSync(path.join(dir, "project", "inline-test", "srs.md")), true);

  const eqTpl = runCli(dir, ["templates", "uml-main", "--lang=ko"]);
  assert.equal(eqTpl.status, 0, eqTpl.stderr);
  assert.match(eqTpl.stdout, /주요 시퀀스 다이어그램/);
});

test("#17 finalize preserves own ID on re-run without collision, tables escape pipes, PDF sanitizes SVG/URLs, handoff & READMEs stay aligned", (t) => {
  const { sanitizeSvg, sanitizeUrl } = require("../src/pdf");

  // 1. Re-running finalize after cleaning dirty working tree keeps REQ-001 (not REQ-002) and merges to master
  const dir = makeTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  execFileSync("git", ["init", "-b", "master"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "dev@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Developer"], { cwd: dir });

  assert.equal(runCli(dir, ["init"]).status, 0);
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-m", "init"], { cwd: dir });

  assert.equal(runCli(dir, ["new", "--name", "cart", "--branch"]).status, 0);
  fs.appendFileSync(path.join(dir, "readme.md"), "\ndirty\n", "utf8");
  const fin1 = runCli(dir, ["finalize", "--name", "cart"]);
  assert.equal(fin1.status, 0, fin1.stderr);
  assert.equal(fs.existsSync(path.join(dir, "project", "REQ-001-cart", "srs.md")), true);

  execFileSync("git", ["checkout", "--", "readme.md"], { cwd: dir });
  const fin2 = runCli(dir, ["finalize", "--name", "cart", "--auto-merge"]);
  assert.equal(fin2.status, 0, fin2.stderr);
  assert.equal(fs.existsSync(path.join(dir, "project", "REQ-001-cart", "srs.md")), true);
  assert.equal(fs.existsSync(path.join(dir, "project", "REQ-002-cart")), false);
  const headBranch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
  assert.equal(headBranch, "master");

  // 2. Pipe characters in SRS summary and escaped pipes in Markdown tables do not shift columns
  const srsPath = path.join(dir, "project", "REQ-001-cart", "srs.md");
  fs.writeFileSync(
    srsPath,
    "# REQ-001 cart | checkout SRS\n\n- 狀態：已審核\n\n## 摘要\n支援 Credit | Debit | LinePay 付款。\n\n## 功能需求\n- OK\n\n## 驗收條件\n- OK\n",
    "utf8"
  );
  assert.equal(runCli(dir, ["reindex"]).status, 0);
  assert.equal(runCli(dir, ["reindex"]).status, 0);
  const statusOut = runCli(dir, ["status"]);
  assert.equal(statusOut.status, 0, statusOut.stderr);
  assert.match(statusOut.stdout, /- REQ-001 cart \| checkout \[已審核\]/);

  const tableHtml = buildHtmlDocument(
    "Pipe Table",
    "| Cmd | Flag | Note |\n|---|---|---|\n| `commit` | `--pr \\| --no-merge` | Safe |\n",
    { noUmlRender: true, lang: "en" }
  );
  assert.match(tableHtml, /<th[^>]*>Note<\/th>/);
  assert.match(tableHtml, /<td[^>]*><code>--pr \| --no-merge<\/code><\/td><td[^>]*>Safe<\/td>/);

  // 3. SVG & dangerous URL sanitization in PDF export
  const unsafeSvg =
    '<svg onload="alert(1)"><script>alert(2)</script><foreignObject><body/></foreignObject><a xlink:href="javascript:evil()"><text onclick="x()">Safe</text></a></svg>';
  const cleanedSvg = sanitizeSvg(unsafeSvg);
  assert.doesNotMatch(cleanedSvg, /<script|foreignObject|onload=|onclick=|javascript:/i);
  assert.match(cleanedSvg, /<text>Safe<\/text>/);
  assert.equal(sanitizeUrl("javascript:alert(1)"), "#");
  assert.equal(sanitizeUrl("  JaVa\nScRiPt:alert(1)"), "#");
  assert.equal(sanitizeUrl("data:text/html,<script>1</script>"), "#");
  assert.equal(sanitizeUrl("https://example.com"), "https://example.com");

  const unsafeHtml = buildHtmlDocument(
    "Security",
    "[bad](javascript:alert(1)) ![x](data:text/html,<script>) [ok](https://example.com)",
    { noUmlRender: true, lang: "en" }
  );
  assert.match(unsafeHtml, /<a href="#">bad<\/a>/);
  assert.match(unsafeHtml, /<img alt="x" src="#"/);
  assert.match(unsafeHtml, /<a href="https:\/\/example\.com">ok<\/a>/);

  // 4. handoff.md dynamic & static templates have status, source docs list, and single-spaced heading
  const { buildLocalizedReqFileContent } = require("../src/i18n");
  const emptyNameHandoff = buildLocalizedReqFileContent("zh-TW", "handoff.md", { REQ_ID: "REQ-001" });
  assert.match(emptyNameHandoff, /^# REQ-001 開發交接摘要$/m);
  assert.doesNotMatch(emptyNameHandoff, /REQ-001\s{2,}/);
  const tplHandoff = runCli(dir, ["templates", "handoff"]);
  assert.equal(tplHandoff.status, 0, tplHandoff.stderr);
  assert.match(tplHandoff.stdout, /^# \{\{REQ_ID\}\} \{\{REQ_NAME\}\} 開發交接摘要/m);
  assert.match(tplHandoff.stdout, /- 狀態：待確認/);
  assert.match(tplHandoff.stdout, /- `srs\.md`/);
  const staticHandoff = fs.readFileSync(path.join(TEMPLATES_DIR, "project", "req", "handoff.md"), "utf8");
  assert.match(staticHandoff, /- 狀態：待確認/);
  assert.match(staticHandoff, /## 來源文件[\s\S]*- `srs\.md`/);

  // 5. readme.md and README.zh-TW.md in package root stay identical
  assert.equal(
    fs.readFileSync(path.join(ROOT_DIR, "readme.md"), "utf8"),
    fs.readFileSync(path.join(ROOT_DIR, "README.zh-TW.md"), "utf8")
  );
});

test("#18 URL inline formatting guard, legacy spec version stamping, existing branch checkout, and draft/db/history check", (t) => {
  const { stampSpecVersionInContent } = require("../src/i18n");

  // 1. Links & images containing __ or * in URLs must not get <strong>/<em> inside href/src
  const urlHtml = buildHtmlDocument(
    "URL Guard",
    "[__bold__ link and `code`](https://example.com/__v1__/users) ![img](https://example.com/__v1__/a*b*.png)",
    { noUmlRender: true, lang: "en" }
  );
  assert.match(
    urlHtml,
    /<a href="https:\/\/example\.com\/__v1__\/users"><strong>bold<\/strong> link and <code>code<\/code><\/a>/
  );
  assert.match(urlHtml, /<img alt="img" src="https:\/\/example\.com\/__v1__\/a\*b\*\.png"/);

  // 2. Legacy system-spec.md with only Status line gets version stamped cleanly on upgrade
  const dir = makeTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  execFileSync("git", ["init", "-b", "master"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "dev@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Developer"], { cwd: dir });

  assert.equal(runCli(dir, ["init"]).status, 0);
  const specPath = path.join(dir, "project", "system-spec.md");
  fs.writeFileSync(specPath, "# 系統概覽\n\n- 狀態：草稿\n\n## 這個系統要解決什麼\n待補充。\n", "utf8");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-m", "legacy init"], { cwd: dir });

  const upgRes = runCli(dir, ["upgrade"]);
  assert.equal(upgRes.status, 0, upgRes.stderr);
  const stampedSpec = fs.readFileSync(specPath, "utf8");
  assert.match(stampedSpec, new RegExp(`- 規範版本：${PKG_VERSION.replace(/\./g, "\\.")}`));

  const strictAfterUpgrade = runCli(dir, ["check", "--strict"]);
  assert.equal(strictAfterUpgrade.status, 0, strictAfterUpgrade.stdout);

  assert.match(
    stampSpecVersionInContent("# Overview\n\n- Status：Draft\n", "0.2.8", "en"),
    /- Spec Version：0\.2\.8/
  );

  // 3. Existing local branch feat/login should be checked out instead of staying on master
  execFileSync("git", ["branch", "feat/login"], { cwd: dir });
  const newExistingBranch = runCli(dir, ["new", "--name", "login", "--branch"]);
  assert.equal(newExistingBranch.status, 0, newExistingBranch.stderr);
  const activeBranch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
  assert.equal(activeBranch, "feat/login");
  assert.equal(fs.existsSync(path.join(dir, "project", "login", "srs.md")), true);

  // Clean draft passes check (with {{REQ_ID}} allowed in draft)
  const cleanDraftCheck = runCli(dir, ["check"]);
  assert.equal(cleanDraftCheck.status, 0, cleanDraftCheck.stdout);
  assert.match(cleanDraftCheck.stdout, /1 個草稿/);

  // 4. check catches malformed openapi.yaml, sectionless db-schema.md, and tableless history.md in draft dirs
  const draftDir = path.join(dir, "project", "login");
  fs.writeFileSync(path.join(draftDir, "openapi.yaml"), "openapi: 3.0.3\ninfo:\n  title: Bad: Title\npaths: {}\n", "utf8");
  fs.writeFileSync(path.join(draftDir, "db-schema.md"), "# DB\nempty\n", "utf8");
  fs.writeFileSync(path.join(draftDir, "history.md"), "# History\nno table here\n", "utf8");

  const brokenDraftCheck = runCli(dir, ["check"]);
  assert.equal(brokenDraftCheck.status, 1);
  assert.match(brokenDraftCheck.stdout, /\[login\].*未加引號的冒號/);
  assert.match(brokenDraftCheck.stdout, /\[login\] db-schema\.md 缺少/);
  assert.match(brokenDraftCheck.stdout, /\[login\] history\.md 缺少/);
});

test("#19 legacy 5-column index migration, nested code fences, AGENTS --lang docs, getPositionalArgs, and main-branch commit check", (t) => {
  const dir = makeTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  assert.equal(runCli(dir, ["init", "--lang", "zh-TW"]).status, 0);
  assert.equal(runCli(dir, ["new", "--id", "REQ-001", "--name", "legacy-item"]).status, 0);

  // Rewrite project/index.md into legacy 5-column format and verify parsing & upgrade migration
  const indexPath = path.join(dir, "project", "index.md");
  fs.writeFileSync(
    indexPath,
    [
      "# 需求索引",
      "",
      "| 編號 | 標題 | 狀態 | 建立時間 | 更新時間 |",
      "|---|---|---|---|---|",
      "| REQ-001 | legacy \\| item | 已審核 | 2025-01-01 09:00:00 | 2025-01-02 10:00:00 |",
      ""
    ].join("\n"),
    "utf8"
  );

  const parsedLegacy = parseIndexRows(fs.readFileSync(indexPath, "utf8"));
  assert.equal(parsedLegacy.length, 1);
  assert.deepEqual(parsedLegacy[0], {
    id: "REQ-001",
    title: "legacy | item",
    description: "",
    status: "已審核",
    createdAt: "2025-01-01 09:00:00",
    updatedAt: "2025-01-02 10:00:00"
  });

  const statusRes = runCli(dir, ["status"]);
  assert.equal(statusRes.status, 0);
  assert.match(statusRes.stdout, /需求總數: 1/);
  assert.match(statusRes.stdout, /REQ-001 legacy \| item \[已審核\]/);

  const upgDry = runCli(dir, ["upgrade", "--dry-run"]);
  assert.equal(upgDry.status, 0);
  assert.match(upgDry.stdout, /UPDATED project\/index\.md.*5 欄索引/);

  const upgRes = runCli(dir, ["upgrade"]);
  assert.equal(upgRes.status, 0, upgRes.stderr);
  assert.match(upgRes.stdout, /UPDATED project\/index\.md/);

  const parsedMigrated = parseIndexRows(fs.readFileSync(indexPath, "utf8"));
  assert.equal(parsedMigrated.length, 1);
  assert.equal(parsedMigrated[0].id, "REQ-001");
  assert.equal(parsedMigrated[0].createdAt, "2025-01-01 09:00:00");
  const indexHeaderLine = fs.readFileSync(indexPath, "utf8").split("\n")[2];
  assert.match(indexHeaderLine, /敘述/);

  // 2. CommonMark closing fence matching in HTML/PDF builder
  const mdWithNestedFence = [
    "```markdown",
    "# Outer",
    "```yaml",
    "openapi: 3.0.3",
    "```",
    "````markdown",
    "```json",
    "{}",
    "```",
    "````"
  ].join("\n");
  const html = buildHtmlDocument("Fence Test", mdWithNestedFence, { noUmlRender: true, lang: "en" });
  const preBlocks = html.match(/<pre>[\s\S]*?<\/pre>/g) || [];
  assert.equal(preBlocks.length, 2, "Nested inner fences should not prematurely split outer blocks");
  assert.match(preBlocks[0], /```yaml/);
  assert.match(preBlocks[1], /```json/);

  const outerMarkdownWithYaml = buildHtmlDocument(
    "Outer Markdown",
    "```markdown\nExample:\n```yaml\nkey: value\n```",
    { noUmlRender: true, lang: "en" }
  );
  const singlePreCount = (outerMarkdownWithYaml.match(/<pre>/g) || []).length;
  assert.equal(singlePreCount, 1);
  assert.match(outerMarkdownWithYaml, /```yaml/);

  // 3. AGENTS.md & localized templates include [--lang <code>] for sa-spec templates
  for (const lang of ["zh-TW", "en", "zh-CN", "ja", "ko"]) {
    const res = runCli(dir, ["templates", "AGENTS", "--lang", lang]);
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /sa-spec templates \[name\] \[--lang <code>\] \[--list\] \[--json\]/);
  }
  const rootAgents = fs.readFileSync(path.join(ROOT_DIR, "AGENTS.md"), "utf8");
  assert.match(rootAgents, /sa-spec templates \[name\] \[--lang <code>\] \[--list\] \[--json\]/);
  const instRes = runCli(dir, ["instructions"]);
  assert.equal(instRes.status, 0);
  assert.match(instRes.stdout, /sa-spec templates \[.*\] \[--lang <code>\] \[--list\] \[--json\]/);

  // 4. getPositionalArgs skips both value flags and --flag=value options
  assert.deepEqual(
    getPositionalArgs(["REQ-001", "--output", "out.pdf", "--browser=/bin/chrome", "--split"], ["--output", "--browser"]),
    ["REQ-001"]
  );

  // 5. Finalize directly on main/master reports warning if git commit fails
  const gitDir = makeTempDir("sa-spec-git-fail-");
  t.after(() => fs.rmSync(gitDir, { recursive: true, force: true }));
  execFileSync("git", ["init"], { cwd: gitDir });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: gitDir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: gitDir });
  assert.equal(runCli(gitDir, ["init", "--lang", "en"]).status, 0);
  execFileSync("git", ["add", "-A"], { cwd: gitDir });
  execFileSync("git", ["commit", "-m", "init"], { cwd: gitDir });

  assert.equal(runCli(gitDir, ["new", "--name", "main-direct"]).status, 0);
  execFileSync("git", ["config", "--unset", "user.name"], { cwd: gitDir });
  execFileSync("git", ["config", "--unset", "user.email"], { cwd: gitDir });
  execFileSync("git", ["config", "user.useConfigOnly", "true"], { cwd: gitDir });
  const finFail = spawnSync(process.execPath, [CLI_PATH, "finalize", "--name", "main-direct"], {
    cwd: gitDir,
    encoding: "utf8",
    env: { ...process.env, SA_SPEC_NO_UML_NET: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" }
  });
  assert.equal(finFail.status, 0);
  assert.doesNotMatch(finFail.stdout, /已直接於主分支 .* 建立提交完成/);
  assert.match(finFail.stderr, /\[Git 警告\] 主分支 .* 提交未建立/);
});

test("#20 --id normalization, sorted ensureIndexRow, local history date, and checkIndexSync detection", (t) => {
  const dir = makeTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  assert.equal(runCli(dir, ["init", "--lang", "zh-TW"]).status, 0);

  // 1. Invalid --id should be rejected cleanly
  const badId = runCli(dir, ["new", "--id", "bad-id", "--name", "demo"]);
  assert.notEqual(badId.status, 0);
  assert.match(badId.stderr, /無效的需求編號/);

  const zeroId = runCli(dir, ["new", "--id", "0", "--name", "demo"]);
  assert.notEqual(zeroId.status, 0);
  assert.match(zeroId.stderr, /必須為大於 0 的數字/);

  // 2. --id req-2 and --id 1 normalize to REQ-002 / REQ-001 and keep index sorted by number
  assert.equal(runCli(dir, ["new", "--id", "req-2", "--name", "second"]).status, 0);
  assert.equal(fs.existsSync(path.join(dir, "project", "REQ-002-second", "srs.md")), true);

  assert.equal(runCli(dir, ["new", "--id", "1", "--name", "first"]).status, 0);
  assert.equal(fs.existsSync(path.join(dir, "project", "REQ-001-first", "srs.md")), true);

  const indexContent = fs.readFileSync(path.join(dir, "project", "index.md"), "utf8");
  const rows = parseIndexRows(indexContent);
  assert.deepEqual(
    rows.map((r) => r.id),
    ["REQ-001", "REQ-002"]
  );

  // 3. history.md uses local date (formatLocalDate()) rather than UTC date
  const historyContent = fs.readFileSync(path.join(dir, "project", "REQ-001-first", "history.md"), "utf8");
  assert.ok(historyContent.includes(`| v0.1 | ${formatLocalDate()} |`), "history.md should record local YYYY-MM-DD");

  // Clean workspace passes check including 索引同步檢查: OK
  const cleanCheck = runCli(dir, ["check"]);
  assert.equal(cleanCheck.status, 0, cleanCheck.stdout);
  assert.match(cleanCheck.stdout, /索引同步檢查: OK/);

  // 4. Out-of-sync index.md (orphan row + missing directory row) triggers check failure and recovers after reindex
  fs.rmSync(path.join(dir, "project", "REQ-002-second"), { recursive: true, force: true });
  const req3Dir = path.join(dir, "project", "REQ-003-manual");
  fs.cpSync(path.join(dir, "project", "REQ-001-first"), req3Dir, { recursive: true });
  for (const rel of ["srs.md", "openapi.yaml", "db-schema.md", "handoff.md", "history.md", "uml/sequence.puml", "uml/wireframe.puml"]) {
    const p = path.join(req3Dir, rel);
    fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(/REQ-001/g, "REQ-003"), "utf8");
  }

  const outOfSyncCheck = runCli(dir, ["check"]);
  assert.equal(outOfSyncCheck.status, 1);
  assert.match(outOfSyncCheck.stdout, /索引同步檢查: WARNING/);
  assert.match(outOfSyncCheck.stdout, /漏列: REQ-003/);
  assert.match(outOfSyncCheck.stdout, /找不到對應目錄: REQ-002/);

  assert.equal(runCli(dir, ["reindex"]).status, 0);
  const resyncedCheck = runCli(dir, ["check"]);
  assert.equal(resyncedCheck.status, 0, resyncedCheck.stdout);
  assert.match(resyncedCheck.stdout, /索引同步檢查: OK/);
});

test("#21 finalize stages system-spec.md, safe renumber regex & --name REQ-xxx, table backtick pipes, draft status, and readme templates", (t) => {
  const dir = makeTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  execFileSync("git", ["init", "-b", "master"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: dir });

  assert.equal(runCli(dir, ["init", "--lang", "zh-TW"]).status, 0);
  assert.match(fs.readFileSync(path.join(dir, "readme.md"), "utf8"), /sa-spec templates/);
  for (const lang of ["zh-TW", "en", "zh-CN", "ja", "ko"]) {
    const readmeTpl = runCli(dir, ["templates", "readme", "--lang", lang]);
    assert.equal(readmeTpl.status, 0, readmeTpl.stderr);
    assert.match(readmeTpl.stdout, /sa-spec templates/);
  }

  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["commit", "-m", "chore: init workspace"], { cwd: dir });

  // 1. Draft shows up in status & instructions --json
  assert.equal(runCli(dir, ["new", "--name", "auth", "--branch"]).status, 0);
  const draftStatus = runCli(dir, ["status"]);
  assert.equal(draftStatus.status, 0);
  assert.match(draftStatus.stdout, /進行中草稿: 1 \(auth\)/);

  // Modify project/system-spec.md before finalize -> should be staged & committed cleanly without blocking auto-merge
  const sysSpecPath = path.join(dir, "project", "system-spec.md");
  fs.writeFileSync(sysSpecPath, `${fs.readFileSync(sysSpecPath, "utf8")}\n## 系統模組\n- Auth\n`, "utf8");

  const finAuth = runCli(dir, ["finalize", "--name", "auth", "--auto-merge"]);
  assert.equal(finAuth.status, 0, finAuth.stderr);
  assert.doesNotMatch(finAuth.stderr, /工作區仍有未提交的變更/);
  assert.equal(execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: dir, encoding: "utf8" }).trim(), "master");
  assert.match(fs.readFileSync(sysSpecPath, "utf8"), /## 系統模組/);
  assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: dir, encoding: "utf8" }).trim(), "");

  // 2. --name REQ-001 matches REQ-001-pay and safe regex keeps REQ-0010 intact when re-numbering to REQ-002
  const dir2 = makeTempDir();
  t.after(() => fs.rmSync(dir2, { recursive: true, force: true }));
  execFileSync("git", ["init", "-b", "master"], { cwd: dir2 });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir2 });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: dir2 });
  assert.equal(runCli(dir2, ["init", "--lang", "en"]).status, 0);
  execFileSync("git", ["add", "-A"], { cwd: dir2 });
  execFileSync("git", ["commit", "-m", "init workspace"], { cwd: dir2 });

  // Branch feat/pay before master takes REQ-001
  execFileSync("git", ["branch", "feat/pay"], { cwd: dir2 });
  assert.equal(runCli(dir2, ["new", "--id", "REQ-001", "--name", "base"]).status, 0);
  execFileSync("git", ["add", "-A"], { cwd: dir2 });
  execFileSync("git", ["commit", "-m", "base req-001"], { cwd: dir2 });

  // Side branch has an earlier manually-numbered REQ-001-pay that mentions REQ-0010
  execFileSync("git", ["checkout", "feat/pay"], { cwd: dir2 });
  assert.equal(runCli(dir2, ["new", "--id", "REQ-001", "--name", "pay"]).status, 0);
  const paySrs = path.join(dir2, "project", "REQ-001-pay", "srs.md");
  fs.writeFileSync(paySrs, "# REQ-001 pay SRS\n\n- Status: Pending\n\nSee also REQ-0010.\n", "utf8");
  const finPay = runCli(dir2, ["finalize", "--name", "REQ-001", "--no-merge"]);
  assert.equal(finPay.status, 0, finPay.stderr);
  assert.equal(fs.existsSync(path.join(dir2, "project", "REQ-002-pay", "srs.md")), true);
  const renumberedSrs = fs.readFileSync(path.join(dir2, "project", "REQ-002-pay", "srs.md"), "utf8");
  assert.match(renumberedSrs, /# REQ-002 pay SRS/);
  assert.match(renumberedSrs, /See also REQ-0010\./);

  // 3. Markdown table protects pipes inside backticks & supports double-backtick inline code
  const mdTable = [
    "| Field | Type | Note |",
    "|---|---|---|",
    "| strategy | `auto-merge | pr` | ``use `backtick` safely`` |"
  ].join("\n");
  const html = buildHtmlDocument("Table Code Pipe Test", mdTable, { noUmlRender: true, lang: "en" });
  assert.match(html, /<td[^>]*><code>auto-merge \| pr<\/code><\/td>/);
  assert.match(html, /<td[^>]*><code>use `backtick` safely<\/code><\/td>/);

  // 4. Draft with only history.md is detected by instructions --json
  const dir3 = makeTempDir();
  t.after(() => fs.rmSync(dir3, { recursive: true, force: true }));
  assert.equal(runCli(dir3, ["init"]).status, 0);
  fs.mkdirSync(path.join(dir3, "project", "hist-only"), { recursive: true });
  fs.writeFileSync(path.join(dir3, "project", "hist-only", "history.md"), "# {{REQ_ID}}\n| v0.1 |\n", "utf8");
  const instJson = runCli(dir3, ["instructions", "--json"]);
  assert.equal(instJson.status, 0, instJson.stderr);
  const parsed = JSON.parse(instJson.stdout);
  assert.deepEqual(parsed.context.drafts, ["hist-only"]);
});

test("#22 templates --lang validation, i18n edge cases, finalize conflict/failure safety, zh-CN no-UI upgrade, PDF comments & dynamic fences", (t) => {
  const dir = makeTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  // 1. templates rejects unsupported --lang, accepts underscore variant zh_TW, init normalizes zh_TW, help lists [--browser <path>]
  const badTplLang = runCli(dir, ["templates", "--lang", "fr"]);
  assert.notEqual(badTplLang.status, 0);
  assert.match(badTplLang.stderr, /不支援的語言/);

  const okTplLang = runCli(dir, ["templates", "system-spec", "--lang", "zh_TW"]);
  assert.equal(okTplLang.status, 0, okTplLang.stderr);

  const helpRes = runCli(dir, ["--help"]);
  assert.equal(helpRes.status, 0);
  assert.match(helpRes.stdout, /sa-spec pdf .*\[--browser <path>\]/);

  const initUnderscore = runCli(dir, ["init", "--lang", "zh_TW"]);
  assert.equal(initUnderscore.status, 0, initUnderscore.stderr);
  assert.doesNotMatch(initUnderscore.stdout, /警告: 不支援的語言代碼/);
  assert.equal(detectProjectLanguage(dir).code, "zh-TW");

  // 2. detectProjectLanguage avoids 2-letter substring false positives, extractors accept bullet/bold syntax, and SRS heading prefix strips leading SRS:
  const sysSpecPath = path.join(dir, "project", "system-spec.md");
  fs.writeFileSync(sysSpecPath, "# System\n\n* **Language:** Slovenian\n", "utf8");
  assert.equal(detectProjectLanguage(dir).code, "custom");

  const boldMeta = [
    "* **狀態**：**已審核**",
    "* **規範版本：** 0.2.8",
    "- **Merge Strategy:** pr"
  ].join("\n");
  assert.equal(extractStatusFromContent(boldMeta), "已審核");
  assert.equal(extractSpecVersion(boldMeta), "0.2.8");
  assert.equal(extractMergeStrategy(boldMeta), "pr");
  assert.equal(extractSrsMetadata("# SRS：REQ-001 Login Flow\n\n- Status: Confirmed\n").title, "Login Flow");

  // 3. finalize rejects ambiguous REQ-xxx prefix matches tied at the same top number
  const ambigDir = makeTempDir();
  t.after(() => fs.rmSync(ambigDir, { recursive: true, force: true }));
  assert.equal(runCli(ambigDir, ["init", "--lang", "en"]).status, 0);
  assert.equal(runCli(ambigDir, ["new", "--id", "REQ-001", "--name", "alpha"]).status, 0);
  assert.equal(runCli(ambigDir, ["new", "--id", "REQ-001", "--name", "beta"]).status, 0);
  const ambigFin = runCli(ambigDir, ["finalize", "--name", "REQ-001"]);
  assert.notEqual(ambigFin.status, 0);
  assert.match(ambigFin.stderr, /找到多個相同優先序號的需求目錄/);

  // 4. Feature-branch git commit failure warns cleanly without pushing stale state or dirty-tree false alarm
  const featFailDir = makeTempDir();
  t.after(() => fs.rmSync(featFailDir, { recursive: true, force: true }));
  execFileSync("git", ["init", "-b", "master"], { cwd: featFailDir });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: featFailDir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: featFailDir });
  assert.equal(runCli(featFailDir, ["init", "--lang", "en"]).status, 0);
  execFileSync("git", ["add", "-A"], { cwd: featFailDir });
  execFileSync("git", ["commit", "-m", "init"], { cwd: featFailDir });
  assert.equal(runCli(featFailDir, ["new", "--name", "wip", "--branch"]).status, 0);
  execFileSync("git", ["config", "--unset", "user.name"], { cwd: featFailDir });
  execFileSync("git", ["config", "--unset", "user.email"], { cwd: featFailDir });
  execFileSync("git", ["config", "user.useConfigOnly", "true"], { cwd: featFailDir });
  const featCommitFail = spawnSync(process.execPath, [CLI_PATH, "finalize", "--name", "wip"], {
    cwd: featFailDir,
    encoding: "utf8",
    env: { ...process.env, SA_SPEC_NO_UML_NET: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" }
  });
  assert.equal(featCommitFail.status, 0);
  assert.match(featCommitFail.stderr, /\[Git 警告\] 分支 feat\/wip 提交未建立/);
  assert.doesNotMatch(featCommitFail.stderr, /工作區仍有未提交的變更/);

  // 5. Auto-merge conflict during finalize exits non-zero with explicit warning
  const conflictDir = makeTempDir();
  t.after(() => fs.rmSync(conflictDir, { recursive: true, force: true }));
  execFileSync("git", ["init", "-b", "master"], { cwd: conflictDir });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: conflictDir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: conflictDir });
  assert.equal(runCli(conflictDir, ["init", "--lang", "en"]).status, 0);
  const conflictSysSpec = path.join(conflictDir, "project", "system-spec.md");
  const baseSysSpec = fs.readFileSync(conflictSysSpec, "utf8");
  execFileSync("git", ["add", "-A"], { cwd: conflictDir });
  execFileSync("git", ["commit", "-m", "init"], { cwd: conflictDir });
  assert.equal(runCli(conflictDir, ["new", "--name", "side", "--branch"]).status, 0);
  fs.writeFileSync(conflictSysSpec, `${baseSysSpec}\n- Owner: Side Branch\n`, "utf8");
  execFileSync("git", ["add", "-A"], { cwd: conflictDir });
  execFileSync("git", ["commit", "-m", "side spec update"], { cwd: conflictDir });
  execFileSync("git", ["checkout", "master"], { cwd: conflictDir });
  fs.writeFileSync(conflictSysSpec, `${baseSysSpec}\n- Owner: Master Branch\n`, "utf8");
  execFileSync("git", ["add", "-A"], { cwd: conflictDir });
  execFileSync("git", ["commit", "-m", "master spec update"], { cwd: conflictDir });
  execFileSync("git", ["checkout", "feat/side"], { cwd: conflictDir });
  const mergeConflictRes = runCli(conflictDir, ["finalize", "--name", "side", "--auto-merge"]);
  assert.equal(mergeConflictRes.status, 1);
  assert.match(mergeConflictRes.stderr, /\[Git 警告\] 合併至 master 發生衝突/);
  assert.equal(execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: conflictDir, encoding: "utf8" }).trim(), "feat/side");
  assert.equal(fs.existsSync(path.join(conflictDir, ".git", "MERGE_HEAD")), false);

  // 6. zh-CN upgrade avoids false wireframe warning when handoff declares 无 UI 界面需求
  const zhCnDir = makeTempDir();
  t.after(() => fs.rmSync(zhCnDir, { recursive: true, force: true }));
  assert.equal(runCli(zhCnDir, ["init", "--lang", "zh-CN"]).status, 0);
  assert.equal(runCli(zhCnDir, ["new", "--id", "REQ-001", "--name", "backend-api"]).status, 0);
  const zhCnReqDir = path.join(zhCnDir, "project", "REQ-001-backend-api");
  fs.rmSync(path.join(zhCnReqDir, "uml", "wireframe.puml"), { force: true });
  fs.writeFileSync(path.join(zhCnReqDir, "srs.md"), "# REQ-001 后台接口\n\n## 目标\n- 供前端界面调用的 API。\n", "utf8");
  fs.writeFileSync(path.join(zhCnReqDir, "handoff.md"), "# 交接摘要\n\n- UI 范围：无 UI 界面需求，纯后端接口。\n", "utf8");
  const upZhCn = runCli(zhCnDir, ["upgrade"]);
  assert.equal(upZhCn.status, 0, upZhCn.stderr);
  assert.match(upZhCn.stdout, /SKIPPED project\/REQ-001-backend-api\/uml\/wireframe\.puml - 已標記為無 UI 需求/);
  assert.doesNotMatch(upZhCn.stdout, /WARN/i);

  // 7. PDF renderer strips HTML comments, keeps inline-code comments & pagebreak, and dynamically lengthens code fences
  const commentMd = [
    "<!-- single-line hidden -->",
    "<!--",
    "  multi-line hidden",
    "-->",
    "Visible <!-- inline hidden --> paragraph `<!-- code-kept -->`.",
    "<!-- pagebreak -->",
    "After pagebreak"
  ].join("\n");
  const commentHtml = buildHtmlDocument("Comments Test", commentMd, { noUmlRender: true, lang: "en" });
  assert.doesNotMatch(commentHtml, /single-line hidden|multi-line hidden|inline hidden/);
  assert.match(commentHtml, /<code>&lt;!-- code-kept --&gt;<\/code>/);
  assert.match(commentHtml, /<div class="page-break"><\/div>/);
  assert.match(commentHtml, /After pagebreak/);

  const fenceReqDir = path.join(dir, "project", "REQ-099-fence-demo");
  fs.mkdirSync(path.join(fenceReqDir, "uml"), { recursive: true });
  fs.writeFileSync(
    path.join(fenceReqDir, "openapi.yaml"),
    "openapi: 3.0.3\ninfo:\n  description: |\n    ```json\n    {\"ok\": true}\n    ```\n",
    "utf8"
  );
  const merged = buildMergedRequirementMarkdown(fenceReqDir, { lang: "en" });
  assert.match(merged.markdown, /````yaml\nopenapi: 3\.0\.3[\s\S]*```json[\s\S]*\n````/);
  const mergedHtml = buildHtmlDocument(merged.title, merged.markdown, { noUmlRender: true, lang: "en" });
  assert.equal((mergedHtml.match(/<pre>/g) || []).length, 1);
  assert.match(mergedHtml, /```json/);
});

test("#23 regression checks: slug disambiguation, binary safety, underscore lang, uml file guard, and GFM rendering", () => {
  // 1. Underscore lang normalization & backtick-wrapped metadata extraction
  assert.equal(normalizeLangKey("zh_CN"), "zh-cn");
  assert.equal(normalizeLangKey("zh_TW"), "zh-tw");
  assert.equal(normalizeLangKey("EN"), "en");
  assert.equal(extractStatusFromContent("- 狀態：`已審核`"), "已審核");
  assert.equal(extractStatusFromContent("- Status: **`Approved`**"), "Approved");
  assert.equal(extractSpecVersion("- 規範版本：`0.2.8`"), "0.2.8");
  assert.equal(extractMergeStrategy("- 合併策略：`pr`"), "pr");

  // 2. Math asterisks & pipe-less-outer GFM table rendering
  const md = [
    "Result: 2 * 3 * 4 = 24 and *italic* and *x*.",
    "",
    "Col A | Col B",
    "--- | ---:|",
    "V1 | V2",
    "V3 | V4",
    "# Heading | After Table"
  ].join("\n");
  const html = buildHtmlDocument("Formatting Regression", md, { noUmlRender: true, lang: "en" });
  assert.match(html, /2 \* 3 \* 4 = 24/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /<em>x<\/em>/);
  assert.match(html, /<td[^>]*>V1<\/td>/);
  assert.match(html, /<td[^>]*>V3<\/td>/);
  assert.match(html, /<td[^>]*>V4<\/td><\/tr><\/tbody><\/table>/);
  assert.match(html, /<h1>Heading \| After Table<\/h1>/);

  // 3. Language detection with backticks/underscore & non-directory uml guard in check + pdf
  const dir = makeTempDir("sa-spec-reg23-");
  try {
    let res = runCli(dir, ["init", "--lang", "en"]);
    assert.equal(res.status, 0, res.stderr);

    const langTempDir = path.join(dir, "tmp-zhcn");
    fs.mkdirSync(path.join(langTempDir, "project"), { recursive: true });
    fs.writeFileSync(path.join(langTempDir, "project", "system-spec.md"), "- 主要語言：`zh_CN`\n", "utf8");
    assert.equal(detectProjectLanguage(langTempDir).code, "zh-CN");

    res = runCli(dir, ["new", "--id", "REQ-001", "--name", "user-auth"]);
    assert.equal(res.status, 0, res.stderr);
    assert.ok(fs.existsSync(path.join(dir, "project", "REQ-001-user-auth")));

    // Exact slug guard: "--name auth" must NOT match "REQ-001-user-auth"
    const missFinalize = runCli(dir, ["finalize", "--name", "auth"]);
    assert.notEqual(missFinalize.status, 0);
    assert.ok(fs.existsSync(path.join(dir, "project", "REQ-001-user-auth")));

    // Non-directory uml file in project/REQ-002-bad-uml must yield clean validation issue without ENOTDIR crash
    const badUmlDir = path.join(dir, "project", "REQ-002-bad-uml");
    fs.mkdirSync(badUmlDir, { recursive: true });
    fs.writeFileSync(path.join(badUmlDir, "srs.md"), "# REQ-002 Bad UML\n\n- Status: Draft\n\n## Summary\nx\n\n## Functional Requirements\nx\n\n## Acceptance Criteria\nx\n", "utf8");
    fs.writeFileSync(path.join(badUmlDir, "uml"), "not a directory", "utf8");

    const mergedBadUml = buildMergedRequirementMarkdown(badUmlDir, { lang: "zh_CN" });
    assert.doesNotMatch(mergedBadUml.markdown, /not a directory/);

    const checkRes = runCli(dir, ["check"]);
    assert.equal(checkRes.status, 1);
    assert.match(checkRes.stdout + checkRes.stderr, /uml\/ 必須為目錄而非檔案/);

    // Verify merge label localization when underscore lang ("zh_CN") is passed
    fs.writeFileSync(path.join(badUmlDir, "openapi.yaml"), "openapi: 3.0.3\n", "utf8");
    const mergedZhCn = buildMergedRequirementMarkdown(badUmlDir, { lang: "zh_CN" });
    assert.match(mergedZhCn.markdown, /OpenAPI 接口规格/);

    // Remove bad-uml before testing finalize + pdf disambiguation & binary safety
    fs.rmSync(badUmlDir, { recursive: true, force: true });

    res = runCli(dir, ["new", "--id", "REQ-002", "--name", "auth"]);
    assert.equal(res.status, 0, res.stderr);
    const req2Dir = path.join(dir, "project", "REQ-002-auth");
    assert.ok(fs.existsSync(req2Dir));

    // Put raw binary PDF payload containing invalid UTF-8 bytes & placeholder bytes inside REQ-002-auth
    const binaryPdf = Buffer.concat([
      Buffer.from("%PDF-1.4\n"),
      Buffer.from([0x00, 0xff, 0xfe, 0x80, 0x99]),
      Buffer.from("REQ-002 {{REQ_ID}} binary"),
      Buffer.from([0xfe, 0xff, 0x00]),
      Buffer.from("\n%%EOF\n")
    ]);
    fs.writeFileSync(path.join(req2Dir, "sample.pdf"), binaryPdf);

    // sa-spec pdf "auth" must target REQ-002-auth rather than REQ-001-user-auth
    const pdfSlugRes = runCli(dir, ["pdf", "auth", "--no-uml-render", "--browser", process.execPath]);
    const pdfSlugOut = (pdfSlugRes.stdout + "\n" + pdfSlugRes.stderr).replace(/\\/g, "/");
    assert.match(pdfSlugOut, /project\/REQ-002-auth\/REQ-002-auth\.pdf/);
    assert.doesNotMatch(pdfSlugOut, /REQ-001-user-auth\.pdf/);

    // sa-spec pdf extensionless file inside dot-containing parent dir keeps parent dir intact
    const dottedDir = path.join(dir, "dir.v1");
    fs.mkdirSync(dottedDir, { recursive: true });
    fs.writeFileSync(path.join(dottedDir, "notes"), "# Notes\n", "utf8");
    const pdfDotRes = runCli(dir, ["pdf", path.join("dir.v1", "notes"), "--no-uml-render", "--browser", process.execPath]);
    const pdfDotOut = (pdfDotRes.stdout + "\n" + pdfDotRes.stderr).replace(/\\/g, "/");
    assert.match(pdfDotOut, /dir\.v1\/notes\.pdf/);

    // Inject a {{REQ_ID}} marker into REQ-002-auth/srs.md to confirm finalize processes REQ-002-auth while skipping sample.pdf
    const srs2Path = path.join(req2Dir, "srs.md");
    fs.writeFileSync(srs2Path, `${fs.readFileSync(srs2Path, "utf8")}\n<!-- marker:{{REQ_ID}} -->\n`, "utf8");

    // Finalize "--name auth" targets REQ-002-auth (preserving own non-colliding ID), replaces text placeholders, and preserves sample.pdf bytes
    const finAuth = runCli(dir, ["finalize", "--name", "auth", "--auto-merge"]);
    assert.equal(finAuth.status, 0, finAuth.stderr + "\n" + finAuth.stdout);
    assert.ok(fs.existsSync(req2Dir));
    assert.ok(fs.existsSync(path.join(dir, "project", "REQ-001-user-auth")));
    const srs2After = fs.readFileSync(srs2Path, "utf8");
    assert.match(srs2After, /<!-- marker:REQ-002 -->/);
    assert.doesNotMatch(srs2After, /\{\{REQ_ID\}\}/);
    const preserved = fs.readFileSync(path.join(req2Dir, "sample.pdf"));
    assert.equal(Buffer.compare(preserved, binaryPdf), 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("#24 comprehensive edge cases: merge strategy word boundaries, AGENTS escaping, pdf fences/parens/comments/EISDIR, validator EISDIR, finalize & pdf ID resolution", () => {
  const { extractMergeStrategy, buildLocalizedAgentsMarkdown } = require("../src/i18n");
  const { convertMarkdownFileToPdf } = require("../src/pdf");

  // 1. extractMergeStrategy word-boundary matching (defaults to pr for safety)
  assert.equal(extractMergeStrategy("- Merge Strategy: approve"), "pr");
  assert.equal(extractMergeStrategy("- 合併策略：production"), "pr");
  assert.equal(extractMergeStrategy("- Merge Strategy: auto-merge"), "auto-merge");
  assert.equal(extractMergeStrategy("- Merge Strategy: pr"), "pr");
  assert.equal(extractMergeStrategy("- 合併策略：走PR流程"), "pr");
  assert.equal(extractMergeStrategy("- Merge Strategy: pull-request"), "pr");
  assert.equal(extractMergeStrategy("- Merge Strategy: no-merge"), "pr");
  assert.equal(extractMergeStrategy("- Merge Strategy: manual"), "pr");

  // 2. AGENTS_LOCALIZED table pipe escaping & --no-uml-render flag alignment
  for (const lang of ["zh-CN", "ja", "ko"]) {
    const agentsText = buildLocalizedAgentsMarkdown(lang);
    assert.match(agentsText, /\[--auto-merge \\\| --pr \\\| --no-merge\]/);
    assert.match(agentsText, /\[--online-uml \\\| --no-uml-render\]/);
  }

  // 3. PDF inline URLs with balanced parens, inline triple backticks, indented fenced blocks, multi-comment lines
  const htmlDoc = buildHtmlDocument(
    "Edge Test",
    [
      "[Wiki](https://en.wikipedia.org/wiki/Markdown_(software))",
      "![Img](https://example.com/diagram_(v2).png)",
      "```inline``` still works here",
      "",
      "# Visible Heading",
      "",
      '  ```js title="app.js"',
      "const ok = true;",
      "  ```",
      "",
      "<!-- c1 --> <!-- c2 -->",
      "After comment"
    ].join("\n")
  );
  assert.match(htmlDoc, /href="https:\/\/en\.wikipedia\.org\/wiki\/Markdown_\(software\)"/);
  assert.match(htmlDoc, /src="https:\/\/example\.com\/diagram_\(v2\)\.png"/);
  assert.match(htmlDoc, /<code>inline<\/code> still works here/);
  assert.match(htmlDoc, /<h1[^>]*>Visible Heading<\/h1>/);
  assert.match(htmlDoc, /<code class="language-js">const ok = true;<\/code>/);
  assert.doesNotMatch(htmlDoc, /<p>\s*<\/p>/);
  assert.match(htmlDoc, /<p>After comment<\/p>/);

  // 4. convertMarkdownFileToPdf rejects directory cleanly & validator check handles non-file deliverables cleanly
  const dirCheck = makeTempDir("sa-spec-edge24-check-");
  try {
    assert.equal(runCli(dirCheck, ["init", "--lang", "zh-TW"]).status, 0);
    assert.equal(runCli(dirCheck, ["new", "--name", "demo"]).status, 0);
    assert.equal(runCli(dirCheck, ["finalize", "--name", "demo"]).status, 0);

    // Directory passed to convertMarkdownFileToPdf must return { ok: false }, not throw EISDIR
    const pdfDirResult = convertMarkdownFileToPdf(
      path.join(dirCheck, "project", "REQ-001-demo"),
      path.join(dirCheck, "out.pdf")
    );
    assert.equal(pdfDirResult.ok, false);

    // Regular file at draft path must not match as draft dir
    fs.writeFileSync(path.join(dirCheck, "project", "ghost"), "not a dir");
    const ghostFinalize = runCli(dirCheck, ["finalize", "--name", "ghost"]);
    assert.notEqual(ghostFinalize.status, 0);
    assert.doesNotMatch(ghostFinalize.stderr, /ENOTDIR|EISDIR/);

    // Partial non-REQ word "req" must NOT match REQ-001-demo in finalize or pdf
    const reqWordFinalize = runCli(dirCheck, ["finalize", "--name", "req"]);
    assert.notEqual(reqWordFinalize.status, 0);
    const reqWordPdf = runCli(dirCheck, ["pdf", "req", "--no-uml-render", "--browser", process.execPath]);
    assert.notEqual(reqWordPdf.status, 0);
    assert.doesNotMatch(reqWordPdf.stdout + reqWordPdf.stderr, /REQ-001-demo\.pdf/);

    // Non-zero-padded numeric ID "REQ-1" resolves REQ-001-demo cleanly
    const pdfNumRes = runCli(dirCheck, ["pdf", "REQ-1", "--no-uml-render", "--browser", process.execPath]);
    const pdfNumOut = (pdfNumRes.stdout + "\n" + pdfNumRes.stderr).replace(/\\/g, "/");
    assert.match(pdfNumOut, /project\/REQ-001-demo\/REQ-001-demo\.pdf/);

    // Replacing srs.md with a directory produces a clean validation error instead of EISDIR crash
    const srsPath = path.join(dirCheck, "project", "REQ-001-demo", "srs.md");
    fs.unlinkSync(srsPath);
    fs.mkdirSync(srsPath);
    const checkDirDeliverable = runCli(dirCheck, ["check"]);
    assert.notEqual(checkDirDeliverable.status, 0);
    assert.match(checkDirDeliverable.stdout + checkDirDeliverable.stderr, /srs\.md 必須為檔案而非目錄/);
    assert.doesNotMatch(checkDirDeliverable.stderr, /EISDIR/);
  } finally {
    fs.rmSync(dirCheck, { recursive: true, force: true });
  }

  // 5. Bare REQ-001 renumber omits bogus "-req-001" suffix and uses sensible commit subjects
  const dirGit = makeTempDir("sa-spec-edge24-git-");
  try {
    const git = (args) => {
      const r = spawnSync("git", args, { cwd: dirGit, encoding: "utf8" });
      assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr || r.stdout}`);
      return (r.stdout || "").trim();
    };
    git(["init", "-b", "main"]);
    git(["config", "user.name", "Tester"]);
    git(["config", "user.email", "tester@example.com"]);

    assert.equal(runCli(dirGit, ["init", "--lang", "zh-TW"]).status, 0);
    git(["add", "."]);
    git(["commit", "-m", "chore: init"]);
    git(["branch", "feat/bare-req"]);
    git(["branch", "feat/slug-req"]);

    // Seed REQ-001-existing on main after branching side branches
    assert.equal(runCli(dirGit, ["new", "--name", "existing"]).status, 0);
    assert.equal(runCli(dirGit, ["finalize", "--name", "existing"]).status, 0);

    // Case A: bare REQ-001 without slug renumbers to REQ-002 (NOT REQ-002-req-001) even on case-insensitive FS
    git(["checkout", "feat/bare-req"]);
    assert.equal(runCli(dirGit, ["new", "--name", "bare-temp"]).status, 0);
    fs.renameSync(path.join(dirGit, "project", "bare-temp"), path.join(dirGit, "project", "REQ-001"));
    git(["add", "."]);
    git(["commit", "-m", "wip: bare REQ-001"]);

    const bareFin = runCli(dirGit, ["finalize", "--name", "REQ-001", "--no-merge"]);
    assert.equal(bareFin.status, 0, bareFin.stderr || bareFin.stdout);
    assert.equal(fs.existsSync(path.join(dirGit, "project", "REQ-002")), true);
    assert.equal(fs.existsSync(path.join(dirGit, "project", "REQ-002-req-001")), false);
    assert.equal(git(["log", "-1", "--pretty=%s"]), "docs(REQ-002): REQ-002 - 規格確認歸檔");

    // Case B: REQ-001-alpha finalized via --name REQ-001 uses "alpha" as commit subject (not redundant REQ-001)
    git(["checkout", "feat/slug-req"]);
    assert.equal(runCli(dirGit, ["new", "--name", "alpha"]).status, 0);
    fs.renameSync(path.join(dirGit, "project", "alpha"), path.join(dirGit, "project", "REQ-001-alpha"));
    git(["add", "."]);
    git(["commit", "-m", "wip: REQ-001-alpha"]);

    const alphaFin = runCli(dirGit, ["finalize", "--name", "REQ-001", "--no-merge"]);
    assert.equal(alphaFin.status, 0, alphaFin.stderr || alphaFin.stdout);
    assert.equal(fs.existsSync(path.join(dirGit, "project", "REQ-003-alpha")), true);
    assert.equal(git(["log", "-1", "--pretty=%s"]), "docs(REQ-003): alpha - 規格確認歸檔");
  } finally {
    fs.rmSync(dirGit, { recursive: true, force: true });
  }
});

test("#25 third-pass audit: strict init --lang, SRS placeholder/heading metadata, PDF inline/table edge cases, case-insensitive REQ-* & EISDIR guards", () => {
  const { extractSrsMetadata } = require("../src/i18n");

  // 1. init rejects unsupported --lang before writing any workspace files
  const badInitDir = makeTempDir("sa-spec-badlang25-");
  try {
    const res = runCli(badInitDir, ["init", "--lang", "fr"]);
    assert.notEqual(res.status, 0);
    assert.match(res.stderr, /不支援的語言代碼/);
    assert.equal(fs.existsSync(path.join(badInitDir, "AGENTS.md")), false);
    assert.equal(fs.existsSync(path.join(badInitDir, "project")), false);
  } finally {
    fs.rmSync(badInitDir, { recursive: true, force: true });
  }

  // 2. extractSrsMetadata supports numbered headings, strips bare "SRS" title, and skips all 5 language TBD placeholders
  const bareTitleMeta = extractSrsMetadata("# REQ-001 SRS\n\n- 狀態：待確認\n\n## 1. 摘要\n待補充。\n真實摘要說明");
  assert.equal(bareTitleMeta.title, "");
  assert.equal(bareTitleMeta.description, "真實摘要說明");

  for (const ph of ["待補充。", "待補充.", "TBD.", "待补充.", "未定.", "미정."]) {
    const meta = extractSrsMetadata(`# REQ-001 Demo\n\n## Summary\n${ph}\n`);
    assert.equal(meta.description, "", `Expected empty description for placeholder ${ph}`);
  }

  // 3. PDF inline bold with underscores/asterisks & table row starting with inline code backticks
  const html = buildHtmlDocument(
    "Audit 25 PDF",
    [
      "Bold __user_id__ and intraword foo__bar__baz and **a * b**",
      "",
      "| Syntax | Purpose |",
      "|---|---|",
      "| `id` | Identifier |",
      "```code``` | Inline backtick cell should stay in table",
      "```js",
      "const fencedAfterTable = 1;",
      "```"
    ].join("\n")
  );
  assert.match(html, /<strong>user_id<\/strong>/);
  assert.match(html, /foo__bar__baz/);
  assert.match(html, /<strong>a \* b<\/strong>/);
  assert.match(html, /<tbody>[\s\S]*<code>code<\/code>[\s\S]*<\/tbody><\/table>/);
  assert.match(html, /<code class="language-js">const fencedAfterTable = 1;<\/code>/);

  // 4. Duplicate normalized IDs (REQ-1-a vs REQ-001-b), lowercase req-002-c, uml/*.puml dir guard, & EISDIR safety across commands
  const edgeDir = makeTempDir("sa-spec-edge25-");
  try {
    assert.equal(runCli(edgeDir, ["init", "--lang", "en"]).status, 0);
    assert.equal(runCli(edgeDir, ["new", "--id", "REQ-001", "--name", "alpha"]).status, 0);
    assert.equal(runCli(edgeDir, ["new", "--id", "REQ-002", "--name", "beta"]).status, 0);
    assert.equal(runCli(edgeDir, ["new", "--id", "REQ-003", "--name", "gamma"]).status, 0);

    // Case-insensitive directory + non-zero-padded numeric collision check
    fs.renameSync(path.join(edgeDir, "project", "REQ-002-beta"), path.join(edgeDir, "project", "REQ-1-beta"));
    fs.renameSync(path.join(edgeDir, "project", "REQ-003-gamma"), path.join(edgeDir, "project", "req-002-gamma"));

    const dupCheck = runCli(edgeDir, ["check"]);
    assert.notEqual(dupCheck.status, 0);
    assert.match(dupCheck.stdout, /REQ-001 重複出現在:.*REQ-1-beta/);

    // Next draft finalized must see lowercase req-002-gamma too and get REQ-003 (not colliding REQ-002)
    assert.equal(runCli(edgeDir, ["new", "--name", "next-feature"]).status, 0);
    const finNext = runCli(edgeDir, ["finalize", "--name", "next-feature"]);
    assert.equal(finNext.status, 0, finNext.stderr || finNext.stdout);
    assert.equal(fs.existsSync(path.join(edgeDir, "project", "REQ-003-next-feature")), true);

    // Replace uml/sequence.puml with a directory -> check reports both file type error and no valid .puml
    const mainPumlPath = path.join(edgeDir, "project", "REQ-003-next-feature", "uml", "sequence.puml");
    fs.unlinkSync(mainPumlPath);
    fs.mkdirSync(mainPumlPath);
    fs.unlinkSync(path.join(edgeDir, "project", "REQ-003-next-feature", "uml", "wireframe.puml"));
    const pumlDirCheck = runCli(edgeDir, ["check"]);
    assert.notEqual(pumlDirCheck.status, 0);
    assert.match(pumlDirCheck.stdout, /uml\/sequence\.puml 必須為檔案而非目錄/);
    assert.match(pumlDirCheck.stdout, /uml\/ 目錄內沒有任何 \.puml 檔案/);

    // Replace srs.md with a directory -> reindex and upgrade survive cleanly without EISDIR crash
    const srsDirPath = path.join(edgeDir, "project", "REQ-003-next-feature", "srs.md");
    fs.unlinkSync(srsDirPath);
    fs.mkdirSync(srsDirPath);
    const reindexRes = runCli(edgeDir, ["reindex"]);
    assert.equal(reindexRes.status, 0, reindexRes.stderr);
    const upgradeRes = runCli(edgeDir, ["upgrade", "--dry-run"]);
    assert.equal(upgradeRes.status, 0, upgradeRes.stderr);

    // Replace project/index.md and project/system-spec.md with dirs -> status/doctor/instructions do not throw EISDIR
    const idxPath = path.join(edgeDir, "project", "index.md");
    const specPath = path.join(edgeDir, "project", "system-spec.md");
    fs.unlinkSync(idxPath);
    fs.mkdirSync(idxPath);
    fs.unlinkSync(specPath);
    fs.mkdirSync(specPath);

    const statusRes = runCli(edgeDir, ["status"]);
    assert.notEqual(statusRes.status, 0);
    assert.doesNotMatch(statusRes.stderr, /EISDIR|ENOTDIR/);

    const doctorRes = runCli(edgeDir, ["doctor"]);
    assert.notEqual(doctorRes.status, 0);
    assert.doesNotMatch(doctorRes.stderr, /EISDIR|ENOTDIR/);

    const instRes = runCli(edgeDir, ["instructions", "--json"]);
    assert.equal(instRes.status, 0, instRes.stderr);
    const instParsed = JSON.parse(instRes.stdout);
    assert.equal(instParsed.context.initialized, false);
  } finally {
    fs.rmSync(edgeDir, { recursive: true, force: true });
  }
});

test("#26 remaining fs.existsSync guards: init path-type conflicts, skills/rules files, upgrade uml/wireframe conflicts", () => {
  // 1. init rejects directory at AGENTS.md and file at project/
  const dirConflict = fs.mkdtempSync(path.join(os.tmpdir(), "sa-spec-26-init-"));
  try {
    fs.mkdirSync(path.join(dirConflict, "AGENTS.md"));
    const initAgentsDir = runCli(dirConflict, ["init", "--lang", "en"]);
    assert.notEqual(initAgentsDir.status, 0);
    assert.match(initAgentsDir.stderr, /目錄而非檔案/);

    fs.rmSync(path.join(dirConflict, "AGENTS.md"), { recursive: true, force: true });
    fs.rmSync(path.join(dirConflict, "project"), { recursive: true, force: true });
    fs.writeFileSync(path.join(dirConflict, "project"), "not a dir", "utf8");
    const initProjFile = runCli(dirConflict, ["init", "--lang", "en"]);
    assert.notEqual(initProjFile.status, 0);
    assert.match(initProjFile.stderr, /檔案而非目錄/);
  } finally {
    fs.rmSync(dirConflict, { recursive: true, force: true });
  }

  // 2. check --strict & instructions ignore regular files named skills/rules; upgrade handles uml file & wireframe dir safely
  const upgDir = fs.mkdtempSync(path.join(os.tmpdir(), "sa-spec-26-upg-"));
  try {
    assert.equal(runCli(upgDir, ["init", "--lang", "zh-TW"]).status, 0);
    fs.writeFileSync(path.join(upgDir, "skills"), "not a legacy dir", "utf8");
    fs.writeFileSync(path.join(upgDir, "rules"), "not a legacy dir", "utf8");

    const strictRes = runCli(upgDir, ["check", "--strict"]);
    assert.equal(strictRes.status, 0, strictRes.stdout + strictRes.stderr);
    assert.doesNotMatch(strictRes.stdout, /舊版專案內置/);

    const reqUmlFile = path.join(upgDir, "project", "REQ-001-legacy");
    fs.mkdirSync(reqUmlFile, { recursive: true });
    fs.writeFileSync(path.join(reqUmlFile, "uml.puml"), "@startuml\n@enduml\n", "utf8");
    fs.writeFileSync(path.join(reqUmlFile, "uml"), "file blocking dir", "utf8");

    const reqWireDir = path.join(upgDir, "project", "REQ-002-ui");
    fs.mkdirSync(path.join(reqWireDir, "uml", "wireframe.puml"), { recursive: true });
    fs.writeFileSync(path.join(reqWireDir, "srs.md"), "# 登入畫面\n\n點擊按鈕\n", "utf8");

    const upgRes = runCli(upgDir, ["upgrade"]);
    assert.equal(upgRes.status, 0, upgRes.stderr);
    assert.doesNotMatch(upgRes.stderr, /ENOTDIR|EISDIR/);
    assert.match(upgRes.stdout, /已存在但為檔案而非目錄/);
    assert.match(upgRes.stdout, /線框圖/);
  } finally {
    fs.rmSync(upgDir, { recursive: true, force: true });
  }
});

test("#27 PDF renderHtmlToPdf path/status guards, --browser validation, and --split --output rejection", () => {
  const { renderHtmlToPdf } = require("../src/pdf");
  const pdfTmp = fs.mkdtempSync(path.join(os.tmpdir(), "sa-spec-27-pdf-"));
  try {
    // 1. Invalid --browser path fails explicitly instead of silently falling back
    const badBrowserRes = renderHtmlToPdf("<h1>Hi</h1>", path.join(pdfTmp, "out.pdf"), path.join(pdfTmp, "missing-chrome"));
    assert.equal(badBrowserRes.ok, false);
    assert.match(badBrowserRes.error, /指定的瀏覽器路徑不存在或不是檔案/);

    // 2. Output path pointing to an existing directory is rejected
    const outDir = path.join(pdfTmp, "existing-dir");
    fs.mkdirSync(outDir);
    const dirOutRes = renderHtmlToPdf("<h1>Hi</h1>", outDir);
    assert.equal(dirOutRes.ok, false);
    assert.match(dirOutRes.error, /輸出路徑為目錄而非 PDF 檔案/);

    // 3. Failing browser executable does not falsely succeed when an older PDF file exists
    const fakeBrowser = path.join(pdfTmp, "fail-browser.sh");
    fs.writeFileSync(fakeBrowser, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    const stalePdf = path.join(pdfTmp, "stale.pdf");
    fs.writeFileSync(stalePdf, "%PDF-1.4\nstale\n", "utf8");
    const origPath = process.env.PATH;
    process.env.PATH = "";
    try {
      const failRes = renderHtmlToPdf("<h1>Hi</h1>", stalePdf, fakeBrowser);
      assert.equal(failRes.ok, false);
      assert.equal(fs.readFileSync(stalePdf, "utf8"), "%PDF-1.4\nstale\n");
    } finally {
      process.env.PATH = origPath;
    }

    // 4. CLI rejects --split or --all combined with --output
    assert.equal(runCli(pdfTmp, ["init", "--lang", "en"]).status, 0);
    assert.equal(runCli(pdfTmp, ["new", "--id", "REQ-001", "--name", "demo"]).status, 0);
    const splitOutRes = runCli(pdfTmp, ["pdf", "REQ-001", "--split", "--output", "out.pdf"]);
    assert.notEqual(splitOutRes.status, 0);
    assert.match(splitOutRes.stderr, /--split 與 --output 不能同時使用/);
    const allOutRes = runCli(pdfTmp, ["pdf", "--all", "--output", "out.pdf"]);
    assert.notEqual(allOutRes.status, 0);
    assert.match(allOutRes.stderr, /--all 與 --output 不能同時使用/);
  } finally {
    fs.rmSync(pdfTmp, { recursive: true, force: true });
  }
});

test("#28 instructions, rules, SKILL, and localized AGENTS enforce task brief, task checklist, and process/business checklists", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sa-spec-28-checklist-"));
  try {
    assert.equal(runCli(tmpDir, ["init", "--lang", "zh-TW"]).status, 0);
    const agentsZhTw = fs.readFileSync(path.join(tmpDir, "AGENTS.md"), "utf8");
    assert.match(agentsZhTw, /任務清單/);
    assert.match(agentsZhTw, /流程檢查清單/);
    assert.match(agentsZhTw, /業務檢查清單/);

    const overviewJsonRes = runCli(tmpDir, ["instructions", "--json"]);
    assert.equal(overviewJsonRes.status, 0, overviewJsonRes.stderr);
    const overview = JSON.parse(overviewJsonRes.stdout);
    assert.ok(Array.isArray(overview.executionProtocol) && overview.executionProtocol.length >= 3);
    assert.equal(overview.stages.length, 5);
    for (const s of overview.stages) {
      assert.ok(Array.isArray(s.tasks) && s.tasks.length > 0, `${s.stage} missing tasks`);
      assert.ok(Array.isArray(s.processChecklist) && s.processChecklist.length > 0, `${s.stage} missing processChecklist`);
      assert.ok(Array.isArray(s.businessChecklist) && s.businessChecklist.length > 0, `${s.stage} missing businessChecklist`);
    }

    for (const stageName of ["init", "propose", "analyze", "commit", "pdf"]) {
      const stageJsonRes = runCli(tmpDir, ["instructions", stageName, "--json"]);
      assert.equal(stageJsonRes.status, 0, stageJsonRes.stderr);
      const parsed = JSON.parse(stageJsonRes.stdout);
      assert.ok(Array.isArray(parsed.executionProtocol) && parsed.executionProtocol.length >= 3);
      assert.ok(Array.isArray(parsed.tasks) && parsed.tasks.length > 0);
      assert.ok(Array.isArray(parsed.processChecklist) && parsed.processChecklist.length > 0);
      assert.ok(Array.isArray(parsed.businessChecklist) && parsed.businessChecklist.length > 0);
      assert.match(parsed.skillDocument, /流程上檢查清單/);
      assert.match(parsed.skillDocument, /業務上檢查清單/);
    }

    const analyzeTextRes = runCli(tmpDir, ["instructions", "analyze"]);
    assert.equal(analyzeTextRes.status, 0, analyzeTextRes.stderr);
    assert.match(analyzeTextRes.stdout, /## 任務執行原則 \(Execution Protocol\)/);
    assert.match(analyzeTextRes.stdout, /## 任務清單 \(Task Checklist - analyze\)/);
    assert.match(analyzeTextRes.stdout, /## 流程檢查清單 \(Process Checklist\)/);
    assert.match(analyzeTextRes.stdout, /## 業務檢查清單 \(Business Checklist\)/);

    const reviewRes = runCli(tmpDir, ["rules", "review"]);
    assert.equal(reviewRes.status, 0, reviewRes.stderr);
    assert.match(reviewRes.stdout, /流程檢查清單（Process Checklist）/);
    assert.match(reviewRes.stdout, /業務檢查清單（Business Checklist）/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("#29 cross-file contradiction detection in check and Git pre-commit hook management", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sa-spec-29-guardrails-"));
  try {
    const initRes = runCli(tmpDir, ["init", "--hooks", "--lang", "zh-TW"]);
    assert.equal(initRes.status, 0, initRes.stderr);
    const hookPath = path.join(tmpDir, ".git", "hooks", "pre-commit");
    assert.equal(fs.existsSync(hookPath), true);
    const hookText = fs.readFileSync(hookPath, "utf8");
    assert.match(hookText, /sa-spec managed pre-commit hook/);
    assert.match(hookText, /sa-spec check --strict/);

    const statusRes = runCli(tmpDir, ["hooks", "status"]);
    assert.equal(statusRes.status, 0, statusRes.stderr);
    assert.match(statusRes.stdout, /已安裝 sa-spec pre-commit hook/);

    const removeRes = runCli(tmpDir, ["hooks", "remove"]);
    assert.equal(removeRes.status, 0, removeRes.stderr);
    assert.equal(fs.existsSync(hookPath), false);

    // Custom hook preservation
    fs.writeFileSync(hookPath, "#!/bin/sh\necho custom\n", { mode: 0o755 });
    const warnInstallRes = runCli(tmpDir, ["hooks", "install"]);
    assert.notEqual(warnInstallRes.status, 0);
    assert.match(warnInstallRes.stdout + warnInstallRes.stderr, /已存在自訂 pre-commit hook/);
    assert.match(fs.readFileSync(hookPath, "utf8"), /echo custom/);

    const warnRemoveRes = runCli(tmpDir, ["hooks", "remove"]);
    assert.notEqual(warnRemoveRes.status, 0);
    assert.equal(fs.existsSync(hookPath), true);

    assert.equal(runCli(tmpDir, ["hooks", "install", "--force"]).status, 0);
    assert.match(fs.readFileSync(hookPath, "utf8"), /sa-spec managed pre-commit hook/);

    // Cross-file contradictions in check
    assert.equal(runCli(tmpDir, ["new", "--id", "REQ-001", "--name", "contra"]).status, 0);
    const reqDir = path.join(tmpDir, "project", "REQ-001-contra");
    fs.writeFileSync(
      path.join(reqDir, "srs.md"),
      "# REQ-001 登入\n\n- 狀態：待確認\n\n## 摘要\n登入。\n\n## 功能需求\n登入。\n\n## 驗收條件\n通過。\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(reqDir, "uml", "wireframe.puml"),
      "@startuml\nAlice -> Bob: Hi\n@enduml\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(reqDir, "openapi.yaml"),
      "# 無 API\nopenapi: 3.0.3\ninfo:\n  title: Demo\n  version: 0.1.0\npaths: {}\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(reqDir, "handoff.md"),
      [
        "# Handoff",
        "- 狀態：已審核",
        "## 6. API 契約",
        "- POST /api/login",
        "## 7. DB 變更",
        "- 無",
        "## 8. UI / 畫面規格",
        "- 無 UI 介面需求",
        "## 9. 驗收條件",
        "- 通過"
      ].join("\n"),
      "utf8"
    );

    const checkRes = runCli(tmpDir, ["check"]);
    assert.notEqual(checkRes.status, 0);
    assert.match(checkRes.stdout, /uml\/wireframe\.puml 必須使用 PlantUML Salt 語法/);
    assert.match(checkRes.stdout, /handoff\.md 標記無 UI 介面需求，但 uml\/wireframe\.puml 同時存在/);
    assert.match(checkRes.stdout, /srs\.md 狀態為「待確認」，但 handoff\.md 已標示為「已審核」/);
    assert.match(checkRes.stdout, /openapi\.yaml 標記無 API，但 handoff\.md 列出具體 API 端點/);

    // Reverse OpenAPI vs handoff contradiction
    fs.writeFileSync(
      path.join(reqDir, "openapi.yaml"),
      "openapi: 3.0.3\ninfo:\n  title: Demo\n  version: 0.1.0\npaths:\n  /api/login:\n    post:\n      responses:\n        '200':\n          description: ok\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(reqDir, "handoff.md"),
      [
        "# Handoff",
        "- 狀態：待確認",
        "## 6. API 契約",
        "- 無 API",
        "## 7. DB 變更",
        "- 無",
        "## 8. UI / 畫面規格",
        "- 參考 wireframe",
        "## 9. 驗收條件",
        "- 通過"
      ].join("\n"),
      "utf8"
    );
    const checkRevRes = runCli(tmpDir, ["check"]);
    assert.notEqual(checkRevRes.status, 0);
    assert.match(checkRevRes.stdout, /openapi\.yaml 已定義 API paths，但 handoff\.md 標記無 API/);

    // Japanese status contradiction (確認待ち vs 承認済み)
    fs.writeFileSync(
      path.join(reqDir, "srs.md"),
      "# REQ-001 ログイン\n\n- ステータス: 確認待ち\n\n## 概要\nログイン。\n\n## 機能要件\nログイン。\n\n## 受入条件\n合格。\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(reqDir, "handoff.md"),
      [
        "# Handoff",
        "- ステータス: 承認済み",
        "## 6. API",
        "- POST /api/login",
        "## 7. データベース",
        "- なし",
        "## 8. UI",
        "- wireframe 参照",
        "## 9. 受入条件",
        "- 合格"
      ].join("\n"),
      "utf8"
    );
    const checkJaRes = runCli(tmpDir, ["check"]);
    assert.notEqual(checkJaRes.status, 0);
    assert.match(checkJaRes.stdout, /srs\.md 狀態為「確認待ち」，但 handoff\.md 已標示為「承認済み」/);

    // Actual git commit is blocked by installed pre-commit hook when check --strict fails
    const shimBinDir = path.join(tmpDir, ".shim-bin");
    fs.mkdirSync(shimBinDir, { recursive: true });
    const cliEntry = path.resolve(__dirname, "..", "bin", "sa-spec.js");
    fs.writeFileSync(
      path.join(shimBinDir, "sa-spec"),
      `#!/bin/sh\nexec "${process.execPath}" "${cliEntry}" "$@"\n`,
      { mode: 0o755 }
    );
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: tmpDir });
    execFileSync("git", ["config", "user.name", "Tester"], { cwd: tmpDir });
    execFileSync("git", ["add", "project", "AGENTS.md", "readme.md"], { cwd: tmpDir });
    const { spawnSync } = require("child_process");
    const blockedCommit = spawnSync("git", ["commit", "-m", "should be blocked"], {
      cwd: tmpDir,
      encoding: "utf8",
      env: { ...process.env, PATH: `${shimBinDir}:${process.env.PATH || ""}` }
    });
    assert.notEqual(blockedCommit.status, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("#30 harness upgrades: check --json structured feedback, YAML structure check, and multi-REQ scope lock", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sa-spec-30-harness-"));
  try {
    assert.equal(runCli(tmpDir, ["init", "--lang", "zh-TW"]).status, 0);
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: tmpDir });
    execFileSync("git", ["config", "user.name", "Tester"], { cwd: tmpDir });

    assert.equal(runCli(tmpDir, ["new", "--id", "REQ-001", "--name", "alpha"]).status, 0);
    assert.equal(runCli(tmpDir, ["new", "--id", "REQ-002", "--name", "beta"]).status, 0);
    execFileSync("git", ["add", "-A"], { cwd: tmpDir });
    execFileSync("git", ["commit", "-m", "baseline specs"], { cwd: tmpDir });

    // Clean state passes check --strict --json
    const cleanJsonRes = runCli(tmpDir, ["check", "--strict", "--json"]);
    assert.equal(cleanJsonRes.status, 0, cleanJsonRes.stderr);
    const cleanParsed = JSON.parse(cleanJsonRes.stdout);
    assert.equal(cleanParsed.ok, true);
    assert.equal(cleanParsed.scopeLock.ok, true);
    assert.deepEqual(cleanParsed.issues, []);

    // YAML tab indent + missing info + scalar-indent anomaly
    const req1Api = path.join(tmpDir, "project", "REQ-001-alpha", "openapi.yaml");
    fs.writeFileSync(
      req1Api,
      "openapi: 3.0.3\ninfo: BadScalar\n\tversion: 0.1.0\npaths: {}\n",
      "utf8"
    );
    const yamlJsonRes = runCli(tmpDir, ["check", "--json"]);
    assert.notEqual(yamlJsonRes.status, 0);
    const yamlParsed = JSON.parse(yamlJsonRes.stdout);
    assert.equal(yamlParsed.ok, false);
    assert.ok(yamlParsed.issues.some((it) => it.rule === "OPENAPI_YAML_INVALID" && it.fixHint));

    // Restore valid YAML (including sequence-of-objects like parameters), then modify BOTH committed REQ-001 and REQ-002 -> scope lock triggers on --strict
    fs.writeFileSync(
      req1Api,
      [
        "openapi: 3.0.3",
        "info:",
        "  title: Alpha",
        "  version: 0.1.0",
        "paths:",
        "  /items/{id}:",
        "    get:",
        "      parameters:",
        "        - name: id",
        "          in: path",
        "          required: true",
        "      responses:",
        "        '200':",
        "          description: ok",
        ""
      ].join("\n"),
      "utf8"
    );
    fs.appendFileSync(path.join(tmpDir, "project", "REQ-002-beta", "srs.md"), "\n<!-- touched -->\n", "utf8");

    const lockedRes = runCli(tmpDir, ["check", "--strict", "--json"]);
    assert.notEqual(lockedRes.status, 0);
    const lockedParsed = JSON.parse(lockedRes.stdout);
    assert.equal(lockedParsed.scopeLock.ok, false);
    assert.deepEqual(lockedParsed.scopeLock.modifiedReqDirs, ["REQ-001-alpha", "REQ-002-beta"]);
    assert.ok(lockedParsed.issues.some((it) => it.rule === "SCOPE_LOCK_MULTI_REQ"));

    // Explicit --allow-multi-req overrides scope lock
    const allowedRes = runCli(tmpDir, ["check", "--strict", "--json", "--allow-multi-req"]);
    assert.equal(allowedRes.status, 0, allowedRes.stderr);
    const allowedParsed = JSON.parse(allowedRes.stdout);
    assert.equal(allowedParsed.ok, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("#31 OpenAPI 3.0.3 & PlantUML syntax pre-checks, cross-REQ impact index, pdf --html, and doctor env report", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sa-spec-31-lint-impact-"));
  try {
    assert.equal(runCli(tmpDir, ["init", "--lang", "zh-TW"]).status, 0);
    const docRes = runCli(tmpDir, ["doctor"]);
    assert.equal(docRes.status, 0, docRes.stderr);
    assert.match(docRes.stdout, /PDF 瀏覽器:/);
    assert.match(docRes.stdout, /PlantUML CLI:/);

    assert.equal(runCli(tmpDir, ["new", "--id", "REQ-001", "--name", "auth"]).status, 0);
    assert.equal(runCli(tmpDir, ["new", "--id", "REQ-002", "--name", "order"]).status, 0);

    const req1Dir = path.join(tmpDir, "project", "REQ-001-auth");
    const req2Dir = path.join(tmpDir, "project", "REQ-002-order");

    // 1. OpenAPI contract + PlantUML syntax errors detected via check --json
    fs.writeFileSync(
      path.join(req1Dir, "openapi.yaml"),
      [
        "openapi: 3.0.3",
        "info:",
        "  title: Auth",
        "  version: 0.1.0",
        "paths:",
        "  users:",
        "    post:",
        "      requestBody:",
        "        content:",
        "          application/json:",
        "            schema:",
        "              $ref: '#/components/schemas/MissingReq'"
      ].join("\n"),
      "utf8"
    );
    fs.writeFileSync(path.join(req1Dir, "uml", "sequence.puml"), "@startuml\n' empty diagram\n@enduml\n", "utf8");
    fs.writeFileSync(
      path.join(req1Dir, "uml", "flow.puml"),
      "@startuml\npackage Auth {\n  [Login]\n@enduml\n",
      "utf8"
    );

    const badCheckRes = runCli(tmpDir, ["check", "--json"]);
    assert.notEqual(badCheckRes.status, 0);
    const badParsed = JSON.parse(badCheckRes.stdout);
    assert.ok(badParsed.issues.some((i) => i.rule === "OPENAPI_CONTRACT_INVALID" && /必須以 "\/" 開頭/.test(i.message)));
    assert.ok(badParsed.issues.some((i) => i.rule === "OPENAPI_CONTRACT_INVALID" && /缺少 responses/.test(i.message)));
    assert.ok(badParsed.issues.some((i) => i.rule === "OPENAPI_CONTRACT_INVALID" && /MissingReq/.test(i.message)));
    assert.ok(badParsed.issues.some((i) => i.rule === "PLANTUML_SYNTAX_INVALID" && /圖表內容為空/.test(i.message)));
    assert.ok(badParsed.issues.some((i) => i.rule === "PLANTUML_SYNTAX_INVALID" && /大括號不成對/.test(i.message)));

    // 2. Valid overlapping OpenAPI & DB tables across REQ-001 and REQ-002 -> impact & instructions analyze report collisions
    fs.rmSync(path.join(req1Dir, "uml", "flow.puml"), { force: true });
    fs.writeFileSync(path.join(req1Dir, "uml", "sequence.puml"), "@startuml\nAlice -> Bob: Auth\n@enduml\n", "utf8");
    const validApi = [
      "openapi: 3.0.3",
      "info:",
      "  title: Shared",
      "  version: 0.1.0",
      "paths:",
      "  /api/users:",
      "    get:",
      "      responses:",
      "        '200':",
      "          description: ok"
    ].join("\n");
    fs.writeFileSync(path.join(req1Dir, "openapi.yaml"), validApi, "utf8");
    fs.writeFileSync(path.join(req2Dir, "openapi.yaml"), validApi, "utf8");
    fs.writeFileSync(path.join(req1Dir, "db-schema.md"), "# DB\n\n## users\n\n- id\n", "utf8");
    fs.writeFileSync(path.join(req2Dir, "db-schema.md"), "# DB\n\n## Table: users\n\n- id\n", "utf8");

    const impactRes = runCli(tmpDir, ["impact", "--json"]);
    assert.equal(impactRes.status, 0, impactRes.stderr);
    const impact = JSON.parse(impactRes.stdout);
    assert.equal(impact.requirements.length, 2);
    assert.ok(impact.apiCollisions.some((c) => c.endpoint === "GET /api/users" && c.dirs.length === 2));
    assert.ok(impact.tableCollisions.some((c) => c.table === "users" && c.dirs.length === 2));

    const instAnalyzeRes = runCli(tmpDir, ["instructions", "analyze", "--json"]);
    assert.equal(instAnalyzeRes.status, 0, instAnalyzeRes.stderr);
    const instAnalyze = JSON.parse(instAnalyzeRes.stdout);
    assert.ok(instAnalyze.impactIndex && instAnalyze.impactIndex.apiCollisions.length === 1);

    // 3. Browserless pdf --html export works without Chrome
    const htmlMergedRes = runCli(tmpDir, ["pdf", "REQ-001", "--html"]);
    assert.equal(htmlMergedRes.status, 0, htmlMergedRes.stderr);
    const outMergedHtml = path.join(req1Dir, "REQ-001-auth.html");
    assert.equal(fs.existsSync(outMergedHtml), true);
    assert.match(fs.readFileSync(outMergedHtml, "utf8"), /<html/i);

    const htmlSingleRes = runCli(tmpDir, ["pdf", "project/REQ-001-auth/srs.md", "--html"]);
    assert.equal(htmlSingleRes.status, 0, htmlSingleRes.stderr);
    assert.equal(fs.existsSync(path.join(req1Dir, "srs.html")), true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("#32 safe-by-default pr merge strategy, Approved placeholder completeness gate, and impact-filtered analyze", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sa-spec-32-pr-gate-"));
  try {
    assert.equal(runCli(tmpDir, ["init", "--lang", "zh-TW"]).status, 0);
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: tmpDir });
    execFileSync("git", ["config", "user.name", "Tester"], { cwd: tmpDir });
    assert.match(fs.readFileSync(path.join(tmpDir, "project", "system-spec.md"), "utf8"), /合併策略：pr/);

    execFileSync("git", ["add", "-A"], { cwd: tmpDir });
    execFileSync("git", ["commit", "-m", "init"], { cwd: tmpDir });

    // 1. finalize defaults to pr mode (does not touch master without --auto-merge)
    assert.equal(runCli(tmpDir, ["new", "--name", "billing", "--branch"]).status, 0);
    const finDefault = runCli(tmpDir, ["finalize", "--name", "billing"]);
    assert.equal(finDefault.status, 0, finDefault.stderr);
    assert.match(finDefault.stdout, /已略過自動合併/);
    assert.equal(
      execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: tmpDir, encoding: "utf8" }).trim(),
      "feat/billing"
    );

    // 2. Approved status forbids template placeholders (待補充 / TBD)
    const reqDir = path.join(tmpDir, "project", "REQ-001-billing");
    fs.writeFileSync(
      path.join(reqDir, "srs.md"),
      "# REQ-001 計費\n\n- 狀態：已審核\n\n## 摘要\n計費。\n\n## 功能需求\n- 待補充。\n\n## 驗收條件\n通過。\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(reqDir, "handoff.md"),
      [
        "# Handoff",
        "- 狀態：已審核",
        "## 6. API 契約",
        "- 無 API",
        "## 7. DB 變更",
        "- 無",
        "## 8. UI / 畫面規格",
        "- 參考 wireframe",
        "## 9. 驗收條件",
        "- 通過"
      ].join("\n"),
      "utf8"
    );
    const checkApprovedRes = runCli(tmpDir, ["check", "--strict", "--json"]);
    assert.notEqual(checkApprovedRes.status, 0);
    const approvedParsed = JSON.parse(checkApprovedRes.stdout);
    assert.ok(approvedParsed.issues.some((i) => i.rule === "APPROVED_HAS_PLACEHOLDER"));

    // 3. instructions analyze references impactIndex filtering
    const analyzeRes = runCli(tmpDir, ["instructions", "analyze"]);
    assert.equal(analyzeRes.status, 0, analyzeRes.stderr);
    assert.match(analyzeRes.stdout, /impactIndex/);
    assert.match(analyzeRes.stdout, /過濾出/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("#33 examples/basic-login passes check --strict --json, and SKILL/AGENTS sync pr default + impact-filtered analyze", () => {
  const exampleDir = path.resolve(__dirname, "..", "examples", "basic-login");
  const checkRes = runCli(exampleDir, ["check", "--strict", "--json"]);
  assert.equal(checkRes.status, 0, checkRes.stdout + checkRes.stderr);
  const parsed = JSON.parse(checkRes.stdout);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.issues, []);

  const impactRes = runCli(exampleDir, ["impact", "--json"]);
  assert.equal(impactRes.status, 0, impactRes.stderr);
  const impact = JSON.parse(impactRes.stdout);
  assert.equal(impact.requirements.length, 2);
  assert.ok(impact.apiCollisions.some((c) => c.endpoint === "POST /api/v1/auth/login" && c.dirs.length === 2));
  assert.ok(impact.tableCollisions.some((c) => c.table === "users" && c.dirs.length === 2));

  const skillText = fs.readFileSync(path.resolve(__dirname, "..", "templates", "skills", "system-analysis", "SKILL.md"), "utf8");
  assert.match(skillText, /預設為 `pr` 模式/);
  assert.match(skillText, /sa-spec impact/);
  assert.doesNotMatch(skillText, /AI 必須自動切換回主分支/);

  const agentsTplText = fs.readFileSync(path.resolve(__dirname, "..", "templates", "AGENTS.md"), "utf8");
  assert.match(agentsTplText, /預設為 `pr` 模式/);
  assert.doesNotMatch(agentsTplText, /AI 必須自動切換回主分支/);
});
