const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync, execFileSync } = require("child_process");
const { encodePlantUml, buildHtmlDocument, buildMergedRequirementMarkdown } = require("../src/pdf");

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
    path.join(reqDir, "uml", "main.puml"),
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

  // B creates feat/pay and finalizes -> scans origin/feat/auth, reserves REQ-002-pay without colliding!
  assert.equal(runCli(workB, ["new", "--name", "pay", "--branch"]).status, 0);
  const finB = runCli(workB, ["finalize", "--name", "pay"]);
  assert.equal(finB.status, 0, finB.stderr);
  assert.equal(fs.existsSync(path.join(workB, "project", "REQ-002-pay")), true);

  // Now A finalizes auth with auto-merge -> sees origin/master REQ-002-pay, assigns REQ-003-auth and merges cleanly!
  execFileSync("git", ["checkout", "feat/auth"], { cwd: workA });
  const finA2 = runCli(workA, ["finalize", "--name", "auth"]);
  assert.equal(finA2.status, 0, finA2.stderr);
  assert.equal(fs.existsSync(path.join(workA, "project", "REQ-003-auth")), true);
  assert.equal(fs.existsSync(path.join(workA, "project", "REQ-002-pay")), true);
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

  const mainPuml = fs.readFileSync(path.join(dir, "project", "cart-checkout", "uml", "main.puml"), "utf8");
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

  const finRes = runCli(dir, ["finalize", "--name", "shopping-cart"]);
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
