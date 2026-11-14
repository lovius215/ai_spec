const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync, execFileSync } = require("child_process");
const { encodePlantUml, buildHtmlDocument } = require("../src/pdf");

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

  // Introduce version mismatch + multi-diagram puml + leftover placeholder + broken handoff
  const specPath = path.join(dir, "project", "system-spec.md");
  fs.writeFileSync(specPath, fs.readFileSync(specPath, "utf8").replace(PKG_VERSION, "0.2.5"), "utf8");

  const reqDir = path.join(dir, "project", "REQ-001-login");
  fs.writeFileSync(
    path.join(reqDir, "uml", "main.puml"),
    "@startuml\nA -> B\n@enduml\n@startuml\nC -> D\n@enduml\n",
    "utf8"
  );
  fs.writeFileSync(path.join(reqDir, "srs.md"), "# {{REQ_ID}} broken\n", "utf8");
  fs.writeFileSync(path.join(reqDir, "handoff.md"), "# Empty handoff\n", "utf8");

  const dirtyCheck = runCli(dir, ["check"]);
  assert.equal(dirtyCheck.status, 0);
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
  const branchA = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: workA, encoding: "utf8" }).trim();
  assert.equal(branchA, "feat/auth");

  // B creates feat/pay and finalizes -> auto-merges REQ-001-pay into master and pushes
  assert.equal(runCli(workB, ["new", "--name", "pay", "--branch"]).status, 0);
  const finB = runCli(workB, ["finalize", "--name", "pay"]);
  assert.equal(finB.status, 0, finB.stderr);
  assert.equal(fs.existsSync(path.join(workB, "project", "REQ-001-pay")), true);

  // Now A finalizes auth with auto-merge -> fetches origin/master, sees REQ-001-pay, assigns REQ-002-auth!
  execFileSync("git", ["checkout", "feat/auth"], { cwd: workA });
  const finA2 = runCli(workA, ["finalize", "--name", "auth"]);
  assert.equal(finA2.status, 0, finA2.stderr);
  assert.equal(fs.existsSync(path.join(workA, "project", "REQ-002-auth")), true);
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

  // Source repo protection
  const srcDry = runCli(ROOT_DIR, ["upgrade", "--dry-run"]);
  assert.equal(srcDry.status, 0);
  assert.match(srcDry.stdout, /套件開發主目錄/);
  assert.equal(fs.existsSync(path.join(ROOT_DIR, "skills", "system-analysis", "SKILL.md")), true);
});

test("#9 PlantUML encoder, SVG rendering, and HTML fallback work cleanly offline", (t) => {
  const encoded = encodePlantUml("@startuml\nAlice -> Bob: Hi\n@enduml");
  assert.ok(encoded.length > 10);
  assert.match(encoded, /^[0-9A-Za-z\-_]+$/);

  const fallbackHtml = buildHtmlDocument("Test", "```plantuml\n@startuml\nA -> B\n@enduml\n```", {
    noUmlRender: true
  });
  assert.match(fallbackHtml, /class="language-plantuml"/);
  assert.match(fallbackHtml, /\.uml-diagram/);

  // Test local plantuml CLI SVG embedding via mock binary on PATH
  const binDir = makeTempDir("sa-spec-bin-");
  t.after(() => fs.rmSync(binDir, { recursive: true, force: true }));
  const mockPlantUml = path.join(binDir, "plantuml");
  fs.writeFileSync(mockPlantUml, '#!/bin/sh\necho "<svg><text>UML</text></svg>"\n', { mode: 0o755 });

  const prevPath = process.env.PATH;
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
