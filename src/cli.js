const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  buildHtmlDocument,
  convertMarkdownFileToPdf,
  buildMergedRequirementMarkdown,
  renderHtmlToPdf
} = require("./pdf");
const {
  SUPPORTED_LANGS,
  getLangStrings,
  detectProjectLanguage,
  extractStatusFromContent,
  extractMergeStrategy,
  stampSpecVersionInContent,
  parseIndexRows,
  buildIndexMarkdown,
  buildSystemSpecMarkdown,
  buildWorkspaceReadmeMarkdown,
  buildLocalizedReqFileContent
} = require("./i18n");
const {
  ensureGitRepository,
  getDefaultRemote,
  fetchRemote,
  pushBranchToRemote,
  detectMainBranch,
  getCurrentBranch,
  getLatestMaxReqId,
  remoteBranchHasReqId
} = require("./git");
const { runDoctor, runCheck } = require("./validator");
const { runInstructions, runRules, runTemplatesList } = require("./instructions");

const cwd = process.cwd();
const rootDir = path.resolve(__dirname, "..");
const templatesDir = path.join(rootDir, "templates");

function getPackageVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
  return pkg.version;
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case "init":
      initProject(args.slice(1));
      return;
    case "new":
      createReqTemplate(args.slice(1));
      return;
    case "finalize":
      finalizeReq(args.slice(1));
      return;
    case "reindex":
      reindexProject();
      return;
    case "check":
      runCheck(cwd, isSourceRepo(), getPackageVersion(), showStatus);
      return;
    case "upgrade":
    case "update":
      upgradeProject(args.slice(1));
      return;
    case "doctor":
      runDoctor(cwd, getPackageVersion());
      return;
    case "status":
      showStatus();
      return;
    case "template":
      runTemplate(args.slice(1));
      return;
    case "templates":
      runTemplatesList({ templatesDir, args: args.slice(1), fail });
      return;
    case "instructions":
      runInstructions({
        cwd,
        templatesDir,
        isSourceRepoFlag: isSourceRepo(),
        packageVersion: getPackageVersion(),
        args: args.slice(1),
        fail
      });
      return;
    case "rules":
      runRules({ templatesDir, args: args.slice(1), fail });
      return;
    case "pdf":
      runPdf(args.slice(1));
      return;
    case "version":
    case "--version":
    case "-v":
      showVersion();
      return;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      showHelp();
      return;
    default:
      fail(`Unknown command: ${command}`);
  }
}

function isSourceRepo() {
  if (path.resolve(cwd) === path.resolve(rootDir)) {
    return true;
  }
  const pkgPath = path.join(cwd, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      return pkg && pkg.name === "@loviusc/sa-spec";
    } catch (_) {
      return false;
    }
  }
  return false;
}

function initProject(args = []) {
  const includeRules = args.includes("--full");
  const langArg = getOption(args, "--lang");
  let langConfig = SUPPORTED_LANGS["zh-tw"];
  if (langArg) {
    const key = langArg.toLowerCase();
    if (SUPPORTED_LANGS[key]) {
      langConfig = SUPPORTED_LANGS[key];
    } else {
      console.log(`警告: 不支援的語言代碼 "${langArg}"，支援語系: zh-TW, en, zh-CN, ja, ko。已預設使用繁體中文。`);
    }
  }

  const version = getPackageVersion();
  const agentsTemplateName = langConfig.code === "en" ? "AGENTS.en.md" : "AGENTS.md";

  const results = [
    ensureGitRepository(cwd),
    ensureDir("project"),
    ensureFileFromTemplate(agentsTemplateName, "AGENTS.md"),
    writeGeneratedFileIfMissing("readme.md", buildWorkspaceReadmeMarkdown(langConfig.code)),
    writeGeneratedFileIfMissing(path.join("project", "index.md"), buildIndexMarkdown(langConfig.code)),
    writeGeneratedFileIfMissing(
      path.join("project", "system-spec.md"),
      buildSystemSpecMarkdown(langConfig, version)
    )
  ];

  printResultList("init", results);
  console.log(`專案規格主要語言已設定為: ${langConfig.label}`);
  if (includeRules) {
    console.log(
      "提示: 完整分析規範與補充規則已內建於 sa-spec CLI（透過 sa-spec instructions / sa-spec rules 讀取），專案目錄不額外建立 skills/ 與 rules/。"
    );
  }
}

function showStatus(showHeading = true) {
  if (showHeading) {
    console.log("sa-spec status");
  }

  const systemSpecPath = path.join(cwd, "project", "system-spec.md");
  const indexPath = path.join(cwd, "project", "index.md");

  if (fs.existsSync(systemSpecPath)) {
    const content = fs.readFileSync(systemSpecPath, "utf8");
    const status = extractStatusFromContent(content);
    console.log(`系統規格書狀態: ${status || "未標示"}`);
  } else {
    console.log("系統規格書狀態: 缺少 project/system-spec.md");
    process.exitCode = 1;
  }

  if (!fs.existsSync(indexPath)) {
    console.log("需求索引: 缺少 project/index.md");
    process.exitCode = 1;
    return;
  }

  const rows = parseIndexRows(fs.readFileSync(indexPath, "utf8"));
  console.log(`需求總數: ${rows.length}`);

  if (rows.length === 0) {
    console.log("目前尚無需求。");
    return;
  }

  for (const row of rows.slice(-5)) {
    console.log(`- ${row.id} ${row.title} [${row.status}]`);
  }
}

function runTemplate(args) {
  const type = args[0];

  if (type === "system-spec") {
    outputTemplate(path.join("project", "system-spec.md"), args.slice(1));
    return;
  }

  if (type === "req") {
    createReqTemplate(args.slice(1), "template req");
    return;
  }

  fail("Usage: sa-spec template <system-spec|req> [options]");
}

function outputTemplate(templatePath, args) {
  const output = getOption(args, "--output");
  const content = readTemplate(templatePath);

  if (args.includes("--stdout") || !output) {
    process.stdout.write(content.endsWith("\n") ? content : `${content}\n`);
    return;
  }

  writeFileIfMissing(path.resolve(cwd, output), content);
  console.log(`Created ${output}`);
}

function resolveSlugOrFail(name, explicitSlug) {
  if (explicitSlug) {
    const cleaned = slugify(explicitSlug);
    if (!cleaned) {
      fail(`錯誤: --slug "${explicitSlug}" 必須包含英數字（a-z, 0-9）。`);
      return null;
    }
    return cleaned;
  }
  const slug = slugify(name);
  if (!slug) {
    fail(
      `錯誤: 需求名稱 "${name}" 無法轉換為有效的 ASCII 目錄/分支代號。請改用英文名稱（例如 --name shopping-cart），或加上 --slug <ascii-slug>（例如 --name "${name}" --slug shopping-cart）。`
    );
    return null;
  }
  return slug;
}

function writeReqArtifact(langCode, relType, targetRelPath, replacements) {
  const localized = buildLocalizedReqFileContent(langCode, relType, replacements);
  if (localized !== null) {
    return writeGeneratedFileIfMissing(targetRelPath, localized);
  }
  return ensureFileFromTemplate(path.join("project", "req", relType), targetRelPath, replacements);
}

function createReqTemplate(args, label = "new") {
  const id = getOption(args, "--id");
  const name = getOption(args, "--name");
  const explicitSlug = getOption(args, "--slug");

  if (!name) {
    fail("Usage: sa-spec new [--id REQ-001] --name login [--slug login] [--branch]");
    return;
  }

  const slug = resolveSlugOrFail(name, explicitSlug);
  if (!slug) return;

  const langConfig = detectProjectLanguage(cwd);

  // 草稿模式（Git-Flow 多人協作）：未指定 id 時建立草稿目錄，以 {{REQ_ID}} 佔位
  if (!id) {
    if (args.includes("--branch")) {
      const branchName = `feat/${slug}`;
      const branchRes = spawnSync("git", ["checkout", "-b", branchName], { cwd, encoding: "utf8" });
      if (branchRes.status === 0) {
        console.log(`已建立並切換至分支: ${branchName}`);
      } else {
        console.log(`提示: 分支切換略過 (${(branchRes.stderr || "").trim() || "可能是已有同名分支或未在 git 目錄"})`);
      }

      const remote = getDefaultRemote(cwd);
      const activeBranch = getCurrentBranch(cwd) || branchName;
      if (remote && activeBranch) {
        pushBranchToRemote(cwd, remote, activeBranch);
      }
    }

    const reqDir = path.join("project", slug);
    const umlDir = path.join(reqDir, "uml");
    const replacements = { REQ_ID: "{{REQ_ID}}", REQ_NAME: name };
    const results = [
      ensureDir(reqDir),
      ensureDir(umlDir),
      writeReqArtifact(langConfig.code, "srs.md", path.join(reqDir, "srs.md"), replacements),
      ensureFileFromTemplate(path.join("project", "req", "uml", "main.puml"), path.join(umlDir, "main.puml"), replacements),
      ensureFileFromTemplate(
        path.join("project", "req", "uml", "wireframe.puml"),
        path.join(umlDir, "wireframe.puml"),
        replacements
      ),
      ensureFileFromTemplate(path.join("project", "req", "openapi.yaml"), path.join(reqDir, "openapi.yaml"), replacements),
      writeReqArtifact(langConfig.code, "db-schema.md", path.join(reqDir, "db-schema.md"), replacements),
      writeReqArtifact(langConfig.code, "handoff.md", path.join(reqDir, "handoff.md"), replacements),
      writeReqArtifact(langConfig.code, "history.md", path.join(reqDir, "history.md"), replacements)
    ];

    printResultList(label, results);
    console.log(`\n已建立草稿需求：${reqDir}（內部使用 {{REQ_ID}} 佔位符）`);
    console.log(`分析確認後，可使用 sa-spec finalize --name ${slug} 定號歸檔。`);
    return;
  }

  // 傳統模式：指定序號
  const reqDir = path.join("project", `${id}-${slug}`);
  const umlDir = path.join(reqDir, "uml");
  const replacements = { REQ_ID: id, REQ_NAME: name };
  const results = [
    ensureDir(reqDir),
    ensureDir(umlDir),
    writeReqArtifact(langConfig.code, "srs.md", path.join(reqDir, "srs.md"), replacements),
    ensureFileFromTemplate(path.join("project", "req", "uml", "main.puml"), path.join(umlDir, "main.puml"), replacements),
    ensureFileFromTemplate(
      path.join("project", "req", "uml", "wireframe.puml"),
      path.join(umlDir, "wireframe.puml"),
      replacements
    ),
    ensureFileFromTemplate(path.join("project", "req", "openapi.yaml"), path.join(reqDir, "openapi.yaml"), replacements),
    writeReqArtifact(langConfig.code, "db-schema.md", path.join(reqDir, "db-schema.md"), replacements),
    writeReqArtifact(langConfig.code, "handoff.md", path.join(reqDir, "handoff.md"), replacements),
    writeReqArtifact(langConfig.code, "history.md", path.join(reqDir, "history.md"), replacements),
    ensureIndexRow(id, name, langConfig.code)
  ];

  printResultList(label, results);
}

function finalizeReq(args) {
  const rawName = getOption(args, "--name");
  const explicitSlug = getOption(args, "--slug");
  if (!rawName) {
    fail("Usage: sa-spec finalize --name <name-or-slug> [--slug <ascii-slug>] [--no-merge | --pr]");
    return;
  }

  const slug = resolveSlugOrFail(rawName, explicitSlug);
  if (!slug) return;

  const projectDir = path.join(cwd, "project");
  if (!fs.existsSync(projectDir)) {
    fail("project/ 目錄不存在。");
    return;
  }

  let sourceDir = null;
  let cleanSlug = slug;

  // 1. 優先尋找草稿目錄 (project/<slug> 或 project/draft-<slug>)
  if (fs.existsSync(path.join(projectDir, slug))) {
    sourceDir = path.join(projectDir, slug);
  } else if (fs.existsSync(path.join(projectDir, `draft-${slug}`))) {
    sourceDir = path.join(projectDir, `draft-${slug}`);
  } else {
    // 2. 支援對既有 REQ-xxx-<slug> 或 REQ-xxx 重新定號
    const entries = fs.readdirSync(projectDir, { withFileTypes: true });
    const reqMatch = entries.find(
      (e) =>
        e.isDirectory() &&
        (e.name.toUpperCase() === rawName.toUpperCase() ||
          (e.name.startsWith("REQ-") && e.name.toLowerCase().endsWith(`-${slug}`)))
    );
    if (reqMatch) {
      sourceDir = path.join(projectDir, reqMatch.name);
      cleanSlug = reqMatch.name.replace(/^REQ-\d+-/i, "");
      if (cleanSlug.toUpperCase().startsWith("REQ-")) {
        cleanSlug = slug;
      }
      console.log(`偵測到既有目錄 ${reqMatch.name}，將進行重新定號 (Re-number)...`);
    }
  }

  if (!sourceDir) {
    fail(`找不到草稿或需求目錄: project/${slug} 或 project/REQ-*-${slug}`);
    return;
  }

  // 先推目前分支並同步遠端狀態，接著才查詢主分支最新 REQ 序號
  const mainBranch = detectMainBranch(cwd);
  const currentBranch = getCurrentBranch(cwd);
  const remote = getDefaultRemote(cwd);

  if (remote && currentBranch) {
    pushBranchToRemote(cwd, remote, currentBranch);
    fetchRemote(cwd, remote);
  }

  const maxId = getLatestMaxReqId(cwd, projectDir, mainBranch, remote);
  const nextNum = maxId + 1;
  const nextId = `REQ-${String(nextNum).padStart(3, "0")}`;

  const oldDirName = path.basename(sourceDir);
  const finalDirName = `${nextId}-${cleanSlug}`;
  const finalDir = path.join(projectDir, finalDirName);

  if (fs.existsSync(finalDir) && sourceDir !== finalDir) {
    fail(`目標目錄已存在，無法重命名: project/${finalDirName}`);
    return;
  }

  const oldIdMatch = oldDirName.match(/^(REQ-\d+)/i);
  const oldReqId = oldIdMatch ? oldIdMatch[1].toUpperCase() : null;

  if (sourceDir !== finalDir) {
    fs.renameSync(sourceDir, finalDir);
  }

  for (const filePath of listFilesRecursive(finalDir)) {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      let updated = content.split("{{REQ_ID}}").join(nextId);
      if (oldReqId && oldReqId !== nextId) {
        updated = updated.split(oldReqId).join(nextId);
      }
      if (updated !== content) {
        fs.writeFileSync(filePath, updated, "utf8");
      }
    } catch (_) {}
  }

  reindexProject();
  console.log(`\n 需求已成功定號歸檔為: ${nextId} (${finalDirName})`);

  const systemSpecPath = path.join(cwd, "project", "system-spec.md");
  const configMergeStrategy = fs.existsSync(systemSpecPath)
    ? extractMergeStrategy(fs.readFileSync(systemSpecPath, "utf8"))
    : "auto-merge";
  const shouldAutoMerge = !args.includes("--no-merge") && !args.includes("--pr") && configMergeStrategy !== "pr";

  if (currentBranch && mainBranch && currentBranch !== mainBranch) {
    console.log(`[Git] 正在為分支 ${currentBranch} 建立歸檔 commit...`);
    spawnSync("git", ["add", "project/"], { cwd, encoding: "utf8" });
    const commitRes = spawnSync("git", ["commit", "-m", `docs(${nextId}): ${rawName} - 規格確認歸檔`], {
      cwd,
      encoding: "utf8"
    });
    if (commitRes.status === 0) {
      console.log(`[Git] 分支 ${currentBranch} 提交完成: docs(${nextId}): ${rawName} - 規格確認歸檔`);
    }
    if (remote) {
      pushBranchToRemote(cwd, remote, currentBranch);
    }

    if (shouldAutoMerge) {
      // Pre-merge collision guard against remote main branch
      if (remote && remoteBranchHasReqId(cwd, remote, mainBranch, nextId)) {
        console.error(
          `[Git 衝突防護] 遠端 ${remote}/${mainBranch} 在定號期間已新增 ${nextId}！已停止自動合併，請先更新主分支後重新執行 sa-spec finalize --name ${cleanSlug} 重新領號。`
        );
        process.exitCode = 1;
        return;
      }

      console.log(`[Git] 自動切換至主分支 ${mainBranch} 並合併 ${currentBranch}...`);
      const checkoutRes = spawnSync("git", ["checkout", mainBranch], { cwd, encoding: "utf8" });
      if (checkoutRes.status !== 0) {
        console.error(`[Git 警告] 切換至主分支 ${mainBranch} 失敗: ${(checkoutRes.stderr || "").trim()}`);
        return;
      }

      if (remote) {
        const pullRes = spawnSync("git", ["pull", "--ff-only", remote, mainBranch], { cwd, encoding: "utf8" });
        if (pullRes.status !== 0) {
          console.warn(`[Git 警告] 同步 ${remote}/${mainBranch} 略過: ${(pullRes.stderr || "").trim()}`);
        }
      }

      const mergeRes = spawnSync("git", ["merge", currentBranch, "--no-edit"], { cwd, encoding: "utf8" });
      if (mergeRes.status === 0) {
        console.log(`[Git] 已成功將 ${currentBranch} 合併至 ${mainBranch}！`);
        reindexProject();
        const statusRes = spawnSync("git", ["status", "--porcelain", "project/index.md"], { cwd, encoding: "utf8" });
        if (statusRes.stdout && statusRes.stdout.trim()) {
          spawnSync("git", ["add", "project/index.md"], { cwd, encoding: "utf8" });
          spawnSync("git", ["commit", "-m", `chore: update project/index.md for ${nextId}`], { cwd, encoding: "utf8" });
        }
        if (remote) {
          pushBranchToRemote(cwd, remote, mainBranch);
        }
        console.log(
          ` 全部歸檔流程完成！已自動領取新號 ${nextId} 並自動合併回主分支 ${mainBranch}${remote ? ` 且推送至 ${remote}` : ""}。`
        );
      } else {
        console.error(
          `[Git 警告] 合併至 ${mainBranch} 發生衝突，請手動確認衝突狀況：\n${(mergeRes.stderr || mergeRes.stdout || "").trim()}`
        );
      }
    } else {
      console.log(
        `提示：已略過自動合併（${configMergeStrategy === "pr" ? "合併策略為 pr" : "指定 --no-merge / --pr"}）。請透過 PR 審核合併，或手動執行：`
      );
      console.log(`  git checkout ${mainBranch} && git merge ${currentBranch}`);
    }
  } else if (currentBranch && currentBranch === mainBranch) {
    spawnSync("git", ["add", "project/"], { cwd, encoding: "utf8" });
    spawnSync("git", ["commit", "-m", `docs(${nextId}): ${rawName} - 規格確認歸檔`], { cwd, encoding: "utf8" });
    console.log(`[Git] 已直接於主分支 ${mainBranch} 建立提交完成。`);
    if (remote) {
      pushBranchToRemote(cwd, remote, mainBranch);
    }
  } else {
    console.log("建議接下來執行：");
    console.log("  git add project/");
    console.log(`  git commit -m "docs(${nextId}): ${rawName} - 規格確認歸檔"`);
  }
}

function reindexProject() {
  const projectDir = path.join(cwd, "project");
  const indexPath = path.join(projectDir, "index.md");
  if (!fs.existsSync(projectDir)) {
    fail("project/ directory not found.");
    return;
  }

  const langConfig = detectProjectLanguage(cwd);
  const t = getLangStrings(langConfig.code);

  const existingMap = new Map();
  if (fs.existsSync(indexPath)) {
    for (const row of parseIndexRows(fs.readFileSync(indexPath, "utf8"))) {
      existingMap.set(row.id, row);
    }
  }

  const entries = fs.readdirSync(projectDir, { withFileTypes: true });
  const reqDirs = entries.filter((e) => e.isDirectory() && e.name.startsWith("REQ-"));

  const rows = [];
  for (const entry of reqDirs) {
    const dirName = entry.name;
    const match = dirName.match(/^(REQ-\d+)(?:-(.*))?$/i);
    if (!match) continue;
    const id = match[1].toUpperCase();
    const fallbackTitle = match[2] || dirName;

    const reqDirPath = path.join(projectDir, dirName);
    const srsPath = path.join(reqDirPath, "srs.md");

    let title = fallbackTitle;
    let description = t.tbd;
    let status = t.pending;
    let createdAt = formatLocalDateTime(new Date());
    let updatedAt = createdAt;

    if (existingMap.has(id)) {
      const prev = existingMap.get(id);
      title = prev.title || title;
      description = prev.description || description;
      status = prev.status || status;
      createdAt = prev.createdAt || createdAt;
      updatedAt = prev.updatedAt || updatedAt;
    }

    if (fs.existsSync(srsPath)) {
      const srsContent = fs.readFileSync(srsPath, "utf8");
      const titleMatch = srsContent.match(/^#\s*(?:需求規格[：:]\s*(?:REQ-\d+\s*)?|REQ-\d+\s+(.+?)\s+SRS)(.*)$/m);
      if (titleMatch) {
        const extracted = (titleMatch[1] || titleMatch[2] || "").trim();
        if (extracted) title = extracted;
      }
      const srsStatus = extractStatusFromContent(srsContent);
      if (srsStatus) {
        status = srsStatus;
      }
    }

    const numMatch = id.match(/\d+/);
    const num = numMatch ? parseInt(numMatch[0], 10) : 0;

    rows.push({ num, id, title, description, status, createdAt, updatedAt });
  }

  rows.sort((a, b) => a.num - b.num);

  const idCountMap = new Map();
  for (const r of rows) {
    idCountMap.set(r.id, (idCountMap.get(r.id) || 0) + 1);
  }
  const duplicateIds = Array.from(idCountMap.entries()).filter(([, count]) => count > 1);
  if (duplicateIds.length > 0) {
    console.warn("\n[警告] 發現重複需求編號衝突：");
    for (const [dupId, count] of duplicateIds) {
      console.warn(`  - ${dupId}: 共有 ${count} 個需求目錄共用此編號！`);
    }
    console.warn("  修復建議：請將衝突目錄之一改回草稿名稱後，重新執行 sa-spec finalize 或 scc 重新領號。\n");
  }

  const nextContent = buildIndexMarkdown(langConfig.code, rows);
  fs.writeFileSync(indexPath, nextContent, "utf8");
  console.log(`sa-spec reindex: 已重新索引 ${rows.length} 個需求至 project/index.md`);
}

function ensureIndexRow(id, name, langCode = "zh-TW") {
  const indexPath = path.join(cwd, "project", "index.md");
  if (!fs.existsSync(indexPath)) {
    return { action: "skip", target: path.join("project", "index.md") };
  }

  const content = fs.readFileSync(indexPath, "utf8");
  if (content.includes(`| ${id} |`)) {
    return { action: "skip", target: path.join("project", "index.md") };
  }

  const t = getLangStrings(langCode);
  const now = formatLocalDateTime(new Date());
  const row = `| ${id} | ${name} | ${t.tbd} | ${t.pending} | ${now} | ${now} |`;
  const nextContent = content.endsWith("\n") ? `${content}${row}\n` : `${content}\n${row}\n`;
  fs.writeFileSync(indexPath, nextContent, "utf8");
  return { action: "update", target: path.join("project", "index.md") };
}

function formatLocalDateTime(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return (
    [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join("-") +
    " " +
    [pad(date.getHours()), pad(date.getMinutes())].join(":")
  );
}

function ensureDir(relativeDir) {
  const targetDir = path.join(cwd, relativeDir);
  if (fs.existsSync(targetDir)) {
    return { action: "skip", target: relativeDir };
  }
  fs.mkdirSync(targetDir, { recursive: true });
  return { action: "create", target: relativeDir };
}

function ensureFileFromTemplate(templateRelativePath, targetRelativePath, replacements = {}) {
  const targetPath = path.join(cwd, targetRelativePath);
  if (fs.existsSync(targetPath)) {
    return { action: "skip", target: targetRelativePath };
  }
  const content = applyReplacements(readTemplate(templateRelativePath), replacements);
  writeFileIfMissing(targetPath, content);
  return { action: "create", target: targetRelativePath };
}

function writeGeneratedFileIfMissing(targetRelativePath, content) {
  const targetPath = path.join(cwd, targetRelativePath);
  if (fs.existsSync(targetPath)) {
    return { action: "skip", target: targetRelativePath };
  }
  writeFileIfMissing(targetPath, content);
  return { action: "create", target: targetRelativePath };
}

function writeFileIfMissing(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function readTemplate(relativePath) {
  return fs.readFileSync(path.join(templatesDir, relativePath), "utf8");
}

function listFilesRecursive(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(dir, entry.name);
    return entry.isDirectory() ? listFilesRecursive(absolutePath) : [absolutePath];
  });
}

function applyReplacements(content, replacements) {
  return Object.entries(replacements).reduce(
    (result, [key, value]) => result.split(`{{${key}}}`).join(value),
    content
  );
}

function getOption(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] || null : null;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getManagedLegacyRelativePaths() {
  const files = [];
  for (const dirName of ["skills", "rules"]) {
    const absDir = path.join(templatesDir, dirName);
    if (fs.existsSync(absDir)) {
      for (const file of listFilesRecursive(absDir)) {
        files.push(path.relative(templatesDir, file));
      }
    }
  }
  return files;
}

function pruneEmptyLegacyDirs(relDir, dryRun, managedSet, results) {
  const absDir = path.join(cwd, relDir);
  if (!fs.existsSync(absDir)) {
    return true;
  }

  const entries = fs.readdirSync(absDir, { withFileTypes: true });
  let canRemove = true;

  for (const entry of entries) {
    const childRel = path.join(relDir, entry.name);
    if (entry.isDirectory()) {
      if (!pruneEmptyLegacyDirs(childRel, dryRun, managedSet, results)) {
        canRemove = false;
      }
    } else if (entry.name !== ".DS_Store" && !(dryRun && managedSet.has(childRel))) {
      canRemove = false;
    }
  }

  if (canRemove) {
    if (!dryRun) {
      const dsStore = path.join(absDir, ".DS_Store");
      if (fs.existsSync(dsStore)) {
        fs.unlinkSync(dsStore);
      }
      fs.rmdirSync(absDir);
    }
    results.push({
      action: dryRun ? "would-remove" : "remove",
      target: `${relDir}/`,
      message: "移除舊版目錄"
    });
  }

  return canRemove;
}

function removeLegacyManagedAssets(dryRun = false, keepLegacy = false) {
  const legacyRoots = ["skills", "rules"].filter((dirName) => fs.existsSync(path.join(cwd, dirName)));
  if (legacyRoots.length === 0) {
    return [];
  }

  if (keepLegacy) {
    return [
      {
        action: "skip",
        target: legacyRoots.map((d) => `${d}/`).join(", "),
        message: "已指定 --keep-legacy，保留舊版專案檔案"
      }
    ];
  }

  const results = [];
  const managedPaths = getManagedLegacyRelativePaths();
  const managedSet = new Set(managedPaths);

  for (const relPath of managedPaths) {
    const absPath = path.join(cwd, relPath);
    if (fs.existsSync(absPath)) {
      if (!dryRun) {
        fs.unlinkSync(absPath);
      }
      results.push({
        action: dryRun ? "would-remove" : "remove",
        target: relPath,
        message: "改由 sa-spec CLI 內建提供"
      });
    }
  }

  for (const rootName of legacyRoots) {
    const absRoot = path.join(cwd, rootName);
    if (!fs.existsSync(absRoot)) continue;
    for (const fileAbs of listFilesRecursive(absRoot)) {
      const relPath = path.relative(cwd, fileAbs);
      if (path.basename(fileAbs) === ".DS_Store" || managedSet.has(relPath)) {
        continue;
      }
      results.push({
        action: "warn",
        target: relPath,
        message: "偵測到非套件預設自訂檔案，已保留未刪除"
      });
    }
    pruneEmptyLegacyDirs(rootName, dryRun, managedSet, results);
  }

  return results;
}

function upgradeProject(args = []) {
  const dryRun = args.includes("--dry-run");
  const keepLegacy = args.includes("--keep-legacy");
  const langConfig = detectProjectLanguage(cwd);
  const version = getPackageVersion();
  console.log(`專案目前語言: ${langConfig.label}（依現有語言升級，不變更設定）`);
  const results = [];

  if (isSourceRepo()) {
    results.push({
      action: "skip",
      target: "AGENTS.md & skills/ & rules/",
      message: "套件開發主目錄，保留原始開發設定與範本"
    });
  } else {
    const agentsTemplate = langConfig.code === "en" ? "AGENTS.en.md" : "AGENTS.md";
    results.push(updateFileFromTemplate(agentsTemplate, "AGENTS.md", dryRun));
    results.push(...removeLegacyManagedAssets(dryRun, keepLegacy));

    const systemSpecRel = path.join("project", "system-spec.md");
    const systemSpecAbs = path.join(cwd, systemSpecRel);
    if (fs.existsSync(systemSpecAbs)) {
      const currentSpec = fs.readFileSync(systemSpecAbs, "utf8");
      const stamped = stampSpecVersionInContent(currentSpec, version);
      if (stamped !== currentSpec) {
        if (!dryRun) {
          fs.writeFileSync(systemSpecAbs, stamped, "utf8");
        }
        results.push({
          action: "update",
          target: systemSpecRel,
          message: `更新規範版本鎖定為 ${version}`
        });
      }
    }
  }

  const projectDir = path.join(cwd, "project");
  if (fs.existsSync(projectDir)) {
    const entries = fs.readdirSync(projectDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith("REQ-")) {
        const reqRelDir = path.join("project", entry.name);
        const oldUmlRelPath = path.join(reqRelDir, "uml.puml");
        const oldUmlAbsPath = path.join(cwd, oldUmlRelPath);
        const newUmlRelDir = path.join(reqRelDir, "uml");
        const newUmlAbsDir = path.join(cwd, newUmlRelDir);
        const newMainUmlRelPath = path.join(newUmlRelDir, "main.puml");
        const newMainUmlAbsPath = path.join(cwd, newMainUmlRelPath);

        if (fs.existsSync(oldUmlAbsPath)) {
          if (!fs.existsSync(newMainUmlAbsPath)) {
            if (!dryRun) {
              if (!fs.existsSync(newUmlAbsDir)) {
                fs.mkdirSync(newUmlAbsDir, { recursive: true });
              }
              fs.renameSync(oldUmlAbsPath, newMainUmlAbsPath);
            }
            results.push({
              action: "migrate",
              target: `${oldUmlRelPath} -> ${newMainUmlRelPath}`
            });
          } else {
            results.push({
              action: "warn",
              target: oldUmlRelPath,
              message: `目標 ${newMainUmlRelPath} 已存在，請確認是否可手動移除舊檔。`
            });
          }
        }

        const handoffRelPath = path.join(reqRelDir, "handoff.md");
        const handoffAbsPath = path.join(cwd, handoffRelPath);
        if (fs.existsSync(handoffAbsPath)) {
          let content = fs.readFileSync(handoffAbsPath, "utf8");
          let updatedHandoff = false;
          if (content.includes("uml.puml")) {
            content = content.replace(/uml\.puml/g, "uml/");
            updatedHandoff = true;
          }
          if (!content.includes("## UI") && !content.includes("畫面規格") && !content.includes("界面规格") && !content.includes("画面仕様") && !content.includes("화면 사양")) {
            const uiSection = `\n## UI / 畫面規格\n待補充；若有前端介面需求，參照 \`uml/wireframe.puml\`；若無 UI 需求，明確標示「無 UI 介面需求」。\n`;
            if (content.includes("## 驗收條件")) {
              content = content.replace("## 驗收條件", `${uiSection}\n## 驗收條件`);
            } else {
              content = `${content.trimEnd()}\n${uiSection}`;
            }
            updatedHandoff = true;
          }
          if (updatedHandoff) {
            if (!dryRun) {
              fs.writeFileSync(handoffAbsPath, content, "utf8");
            }
            results.push({
              action: "update",
              target: handoffRelPath,
              message: "更新來源參照與補全 UI/畫面規格章節"
            });
          }
        }

        const wireframeRelPath = path.join(newUmlRelDir, "wireframe.puml");
        const wireframeAbsPath = path.join(cwd, wireframeRelPath);
        const srsRelPath = path.join(reqRelDir, "srs.md");
        const srsAbsPath = path.join(cwd, srsRelPath);

        let explicitNoUi = false;
        let likelyHasUi = false;

        const inspectUiText = (text) => {
          if (/無\s*UI|純後端|無介面|No UI|UI 要件なし|UI 요구사항 없음/i.test(text)) {
            explicitNoUi = true;
          }
          if (/畫面|介面|UI|前端|按鈕|表單|點擊|頁面|Page|Screen|View|Modal/i.test(text)) {
            likelyHasUi = true;
          }
        };

        if (fs.existsSync(handoffAbsPath)) {
          inspectUiText(fs.readFileSync(handoffAbsPath, "utf8"));
        }
        if (fs.existsSync(srsAbsPath)) {
          inspectUiText(fs.readFileSync(srsAbsPath, "utf8"));
        }

        if (!fs.existsSync(wireframeAbsPath)) {
          if (explicitNoUi) {
            results.push({
              action: "skip",
              target: wireframeRelPath,
              message: "已標記為無 UI 需求，略過 wireframe"
            });
          } else if (likelyHasUi) {
            results.push({
              action: "warn",
              target: wireframeRelPath,
              message: "偵測到包含前端介面描述，建議透過 AI (sca) 補齊 PlantUML Salt 線框圖"
            });
          }
        }
      }
    }
  }

  printResultList(dryRun ? "upgrade (dry-run)" : "upgrade", results);
}

function updateFileFromTemplate(templateRelativePath, targetRelativePath, dryRun = false) {
  const targetAbsolutePath = path.join(cwd, targetRelativePath);
  const templateAbsolutePath = path.join(templatesDir, templateRelativePath);
  if (!fs.existsSync(templateAbsolutePath)) {
    return { action: "skip", target: targetRelativePath };
  }

  let templateContent = readTemplate(templateRelativePath);
  if (!fs.existsSync(targetAbsolutePath)) {
    if (!dryRun) {
      writeFileIfMissing(targetAbsolutePath, templateContent);
    }
    return { action: "create", target: targetRelativePath };
  }

  const currentContent = fs.readFileSync(targetAbsolutePath, "utf8");
  if (currentContent.includes("<claude-mem-context>")) {
    const memMatch = currentContent.match(/(<claude-mem-context>[\s\S]*?<\/claude-mem-context>)/);
    if (memMatch && !templateContent.includes("<claude-mem-context>")) {
      templateContent = `${templateContent.trimEnd()}\n\n\n${memMatch[1]}\n`;
    }
  }

  if (currentContent.trim() === templateContent.trim()) {
    return { action: "skip", target: targetRelativePath };
  }

  if (!dryRun) {
    fs.writeFileSync(targetAbsolutePath, templateContent, "utf8");
  }
  return { action: "update", target: targetRelativePath };
}

function printResultList(label, results) {
  console.log(`sa-spec ${label}`);
  for (const result of results) {
    const action =
      result.action === "create"
        ? "CREATED"
        : result.action === "update"
        ? "UPDATED"
        : result.action === "migrate"
        ? "MIGRATED"
        : result.action === "remove"
        ? "REMOVED"
        : result.action === "would-remove"
        ? "WOULD REMOVE"
        : result.action === "warn"
        ? "WARNING"
        : "SKIPPED";
    console.log(`${action} ${result.target}${result.message ? ` - ${result.message}` : ""}`);
  }
}

function resolveReqTargetDir(target) {
  const directAbs = path.resolve(cwd, target);
  if (fs.existsSync(directAbs) && fs.statSync(directAbs).isDirectory()) {
    return directAbs;
  }

  const projectDir = path.join(cwd, "project");
  if (!fs.existsSync(projectDir)) return null;

  const projectSubAbs = path.join(projectDir, target);
  if (fs.existsSync(projectSubAbs) && fs.statSync(projectSubAbs).isDirectory()) {
    return projectSubAbs;
  }

  const entries = fs.readdirSync(projectDir, { withFileTypes: true });
  const upper = target.toUpperCase();
  const slug = slugify(target);
  const found = entries.find((e) => {
    if (!e.isDirectory()) return false;
    const name = e.name;
    if (name.toUpperCase() === upper) return true;
    if (name.toUpperCase().startsWith(`${upper}-`)) return true;
    if (slug && name.toLowerCase().endsWith(`-${slug}`)) return true;
    return false;
  });

  return found ? path.join(projectDir, found.name) : null;
}

function exportReqDirToPdf(reqAbsDir, options = {}) {
  const { split = false, output = null, browser = null, pdfOptions = {} } = options;
  const dirName = path.basename(reqAbsDir);
  const results = [];

  if (!split) {
    const merged = buildMergedRequirementMarkdown(reqAbsDir);
    if (!merged.markdown.trim()) {
      results.push({ action: "skip", target: dirName, message: "無可轉換的 Markdown 內容" });
      return results;
    }

    const defaultOut = path.join(reqAbsDir, `${dirName}.pdf`);
    const targetPdf = output ? path.resolve(cwd, output) : defaultOut;
    const html = buildHtmlDocument(merged.title, merged.markdown, pdfOptions);
    const res = renderHtmlToPdf(html, targetPdf, browser);
    const relPdf = path.relative(cwd, targetPdf);

    if (res.ok) {
      results.push({ action: "create", target: relPdf, message: `整包規格書匯出完成 (${res.engine})` });
    } else {
      results.push({ action: "warn", target: relPdf, message: res.error });
    }
    return results;
  }

  const mdFiles = ["srs.md", "db-schema.md", "handoff.md", "history.md"];
  for (const fileName of mdFiles) {
    const mdAbs = path.join(reqAbsDir, fileName);
    if (!fs.existsSync(mdAbs)) continue;
    const pdfAbs = mdAbs.replace(/\.md$/i, ".pdf");
    const res = convertMarkdownFileToPdf(mdAbs, pdfAbs, browser, pdfOptions);
    const relPdf = path.relative(cwd, pdfAbs);
    if (res.ok) {
      results.push({ action: "create", target: relPdf, message: `匯出完成 (${res.engine})` });
    } else {
      results.push({ action: "warn", target: relPdf, message: res.error });
    }
  }
  return results;
}

function runPdf(args = []) {
  const split = args.includes("--split");
  const all = args.includes("--all");
  const noUmlRender = args.includes("--no-uml-render");
  const output = getOption(args, "--output");
  const browser = getOption(args, "--browser");
  const pdfOptions = { noUmlRender };

  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--output" || arg === "--browser") {
      i++;
      continue;
    }
    if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }

  const target = positional[0];
  if (!all && !target) {
    fail(
      "Usage: sa-spec pdf <file.md|REQ-001|name> [--split] [--output out.pdf] [--browser <path>] [--no-uml-render]\n       sa-spec pdf --all [--split] [--no-uml-render]"
    );
    return;
  }

  const results = [];

  if (all) {
    const projectDir = path.join(cwd, "project");
    if (!fs.existsSync(projectDir)) {
      fail("找不到 project/ 目錄。");
      return;
    }
    const entries = fs.readdirSync(projectDir, { withFileTypes: true });
    const reqDirs = entries
      .filter((e) => e.isDirectory() && e.name.startsWith("REQ-"))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (reqDirs.length === 0) {
      console.log("sa-spec pdf: 目前 project/ 內尚無已歸檔的需求 (REQ-*)。");
      return;
    }

    for (const entry of reqDirs) {
      const reqAbs = path.join(projectDir, entry.name);
      const subResults = exportReqDirToPdf(reqAbs, { split, browser, pdfOptions });
      results.push(...subResults);
      if (subResults.some((r) => r.action === "warn")) {
        process.exitCode = 1;
      }
    }
    printResultList("pdf", results);
    return;
  }

  const directFileAbs = path.resolve(cwd, target);
  if (fs.existsSync(directFileAbs) && fs.statSync(directFileAbs).isFile()) {
    const res = convertMarkdownFileToPdf(directFileAbs, output, browser, pdfOptions);
    const targetPdf = output
      ? path.relative(cwd, path.resolve(cwd, output))
      : path.relative(cwd, directFileAbs.replace(/\.[^.]+$/, ".pdf"));
    if (res.ok) {
      results.push({ action: "create", target: targetPdf, message: `單檔轉換完成 (${res.engine})` });
    } else {
      results.push({ action: "warn", target: targetPdf, message: res.error });
      process.exitCode = 1;
    }
    printResultList("pdf", results);
    return;
  }

  const reqDirAbs = resolveReqTargetDir(target);
  if (reqDirAbs) {
    results.push(...exportReqDirToPdf(reqDirAbs, { split, output, browser, pdfOptions }));
    if (results.some((r) => r.action === "warn")) {
      process.exitCode = 1;
    }
    printResultList("pdf", results);
    return;
  }

  fail(`找不到指定的 Markdown 檔案或需求目錄: ${target}`);
}

function showHelp() {
  console.log(`sa-spec

Usage:
  sa-spec init [--full] [--lang zh-TW|en|zh-CN|ja|ko]
  sa-spec new [--id REQ-001] --name login [--slug login] [--branch]
  sa-spec finalize --name login [--slug login] [--no-merge | --pr]
  sa-spec instructions [init|propose|analyze|commit|pdf] [--with-rules] [--json]
  sa-spec rules [name|all] [--list] [--json]
  sa-spec templates [name] [--list] [--json]
  sa-spec template <system-spec|req> [options]
  sa-spec pdf <file.md|REQ-001|name> [--split] [--output out.pdf] [--no-uml-render]
  sa-spec pdf --all [--split] [--no-uml-render]
  sa-spec reindex
  sa-spec check
  sa-spec doctor
  sa-spec status
  sa-spec upgrade [--dry-run] [--keep-legacy]
  sa-spec update [--dry-run] [--keep-legacy]
  sa-spec --version
`);
}

function showVersion() {
  console.log(getPackageVersion());
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

main();
