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
  formatLocalDate,
  getLangStrings,
  detectProjectLanguage,
  extractStatusFromContent,
  extractMergeStrategy,
  stampSpecVersionInContent,
  escapeIndexCell,
  splitIndexCells,
  parseIndexRows,
  buildIndexMarkdown,
  buildSystemSpecMarkdown,
  buildWorkspaceReadmeMarkdown,
  buildLocalizedReqFileContent,
  buildLocalizedAgentsMarkdown,
  extractSrsMetadata
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
const { runDoctor, runCheck, isDraftSpecDir, isExistingDir, isExistingFile, isReqDirName } = require("./validator");
const { runInstructions, runRules, runTemplatesList, getOption, getPositionalArgs } = require("./instructions");

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

  try {
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
        runCheck(cwd, isSourceRepo(), getPackageVersion(), showStatus, args.slice(1));
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
        runTemplatesList({ cwd, templatesDir, args: args.slice(1), fail });
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
  } catch (err) {
    fail(err && err.message ? err.message : String(err));
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
    const key = langArg.toLowerCase().trim().replace(/_/g, "-");
    if (SUPPORTED_LANGS[key]) {
      langConfig = SUPPORTED_LANGS[key];
    } else {
      fail(`不支援的語言代碼 "${langArg}"，支援語系: zh-TW, en, zh-CN, ja, ko。`);
      return;
    }
  }

  const version = getPackageVersion();

  const results = [
    ensureGitRepository(cwd),
    ensureDir("project"),
    writeGeneratedFileIfMissing("AGENTS.md", buildLocalizedAgentsMarkdown(langConfig.code, templatesDir)),
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

  if (isExistingFile(systemSpecPath)) {
    const content = fs.readFileSync(systemSpecPath, "utf8");
    const status = extractStatusFromContent(content);
    console.log(`系統規格書狀態: ${status || "未標示"}`);
  } else {
    console.log("系統規格書狀態: 缺少 project/system-spec.md");
    process.exitCode = 1;
  }

  if (!isExistingFile(indexPath)) {
    console.log("需求索引: 缺少 project/index.md");
    process.exitCode = 1;
    return;
  }

  const rows = parseIndexRows(fs.readFileSync(indexPath, "utf8"));
  console.log(`需求總數: ${rows.length}`);

  const projectDir = path.join(cwd, "project");
  const drafts = isExistingDir(projectDir)
    ? fs
        .readdirSync(projectDir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && isDraftSpecDir(path.join(projectDir, e.name), e.name))
        .map((e) => e.name)
        .sort()
    : [];
  if (drafts.length > 0) {
    console.log(`進行中草稿: ${drafts.length} (${drafts.join(", ")})`);
  }

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
    const content = buildSystemSpecMarkdown(detectProjectLanguage(cwd), getPackageVersion());
    outputTemplateContent(content, path.join("project", "system-spec.md"), args.slice(1));
    return;
  }

  if (type === "req") {
    createReqTemplate(args.slice(1), "template req");
    return;
  }

  fail("Usage: sa-spec template <system-spec|req> [options]");
}

function outputTemplateContent(content, defaultOutputName, args) {
  const output = getOption(args, "--output");

  if (args.includes("--stdout") || !output) {
    process.stdout.write(content.endsWith("\n") ? content : `${content}\n`);
    return;
  }

  writeFileIfMissing(path.resolve(cwd, output || defaultOutputName), content);
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

function resolveReqIdOrFail(rawId) {
  const trimmed = String(rawId || "").trim();
  const match = trimmed.match(/^(?:REQ-)?(\d+)$/i);
  if (!match) {
    fail(`錯誤: 無效的需求編號 "${rawId}"。請使用 REQ-001 格式（例如 --id REQ-001）。`);
    return null;
  }
  const num = parseInt(match[1], 10);
  if (!Number.isFinite(num) || num <= 0) {
    fail(`錯誤: 需求編號 "${rawId}" 必須為大於 0 的數字（例如 --id REQ-001）。`);
    return null;
  }
  const width = Math.max(3, match[1].length);
  return `REQ-${String(num).padStart(width, "0")}`;
}

function createReqTemplate(args, label = "new") {
  const rawId = getOption(args, "--id");
  const name = getOption(args, "--name");
  const explicitSlug = getOption(args, "--slug");

  if (!name) {
    fail("Usage: sa-spec new [--id REQ-001] --name login [--slug login] [--branch]");
    return;
  }

  const id = rawId ? resolveReqIdOrFail(rawId) : null;
  if (rawId && !id) return;

  const slug = resolveSlugOrFail(name, explicitSlug);
  if (!slug) return;

  const langConfig = detectProjectLanguage(cwd);

  // 草稿模式（Git-Flow 多人協作）：未指定 id 時建立草稿目錄，以 {{REQ_ID}} 佔位
  if (!id) {
    if (args.includes("--branch")) {
      const targetBranch = `feat/${slug}`;
      const mainBranch = detectMainBranch(cwd);
      let activeBranch = getCurrentBranch(cwd);

      if (activeBranch === targetBranch) {
        console.log(`已在目標分支: ${targetBranch}`);
      } else if (activeBranch && mainBranch && activeBranch !== mainBranch && activeBranch.startsWith("feat/")) {
        console.log(`沿用目前 feature 分支: ${activeBranch}`);
      } else {
        const existsRes = spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${targetBranch}`], {
          cwd,
          encoding: "utf8"
        });
        if (existsRes.status === 0) {
          const switchRes = spawnSync("git", ["checkout", targetBranch], { cwd, encoding: "utf8" });
          if (switchRes.status === 0) {
            console.log(`已切換至既有分支: ${targetBranch}`);
          } else {
            console.warn(`警告: 切換至既有分支 ${targetBranch} 失敗 (${(switchRes.stderr || "").trim()})`);
          }
        } else {
          const branchRes = spawnSync("git", ["checkout", "-b", targetBranch], { cwd, encoding: "utf8" });
          if (branchRes.status === 0) {
            console.log(`已建立並切換至分支: ${targetBranch}`);
          } else {
            console.log(`提示: 分支切換略過 (${(branchRes.stderr || "").trim() || "未在 git 目錄"})`);
          }
        }
        activeBranch = getCurrentBranch(cwd);
      }

      const remote = getDefaultRemote(cwd);
      if (remote && activeBranch && activeBranch !== mainBranch) {
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
      writeReqArtifact(langConfig.code, "uml/main.puml", path.join(umlDir, "main.puml"), replacements),
      writeReqArtifact(langConfig.code, "uml/wireframe.puml", path.join(umlDir, "wireframe.puml"), replacements),
      writeReqArtifact(langConfig.code, "openapi.yaml", path.join(reqDir, "openapi.yaml"), replacements),
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
    writeReqArtifact(langConfig.code, "uml/main.puml", path.join(umlDir, "main.puml"), replacements),
    writeReqArtifact(langConfig.code, "uml/wireframe.puml", path.join(umlDir, "wireframe.puml"), replacements),
    writeReqArtifact(langConfig.code, "openapi.yaml", path.join(reqDir, "openapi.yaml"), replacements),
    writeReqArtifact(langConfig.code, "db-schema.md", path.join(reqDir, "db-schema.md"), replacements),
    writeReqArtifact(langConfig.code, "handoff.md", path.join(reqDir, "handoff.md"), replacements),
    writeReqArtifact(langConfig.code, "history.md", path.join(reqDir, "history.md"), replacements),
    ensureIndexRow(id, name, langConfig.code)
  ];

  printResultList(label, results);
}

function parseReqIdNum(name) {
  const match = String(name || "").trim().match(/^REQ-(\d+)(?:-|$)/i);
  return match ? Number(match[1]) : null;
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
  if (!isExistingDir(projectDir)) {
    fail("project/ 目錄不存在。");
    return;
  }

  let sourceDir = null;
  let cleanSlug = slug;

  const entries = fs.readdirSync(projectDir, { withFileTypes: true });
  const isReqNameQuery = parseReqIdNum(rawName) !== null;
  const findDraftEntry = (draftName) =>
    entries.find(
      (e) =>
        e.isDirectory() &&
        parseReqIdNum(e.name) === null &&
        e.name.toLowerCase() === draftName
    );

  // 1. 優先尋找草稿目錄 (project/<slug> 或 project/draft-<slug>)，避免大小寫不敏感檔案系統誤判 REQ-xxx
  const draftMatch = !isReqNameQuery ? findDraftEntry(slug) || findDraftEntry(`draft-${slug}`) : null;
  if (draftMatch) {
    sourceDir = path.join(projectDir, draftMatch.name);
  } else {
    // 2. 支援對既有 REQ-xxx-<slug> 或 REQ-xxx 重新定號（若有多筆取最新編號）
    const reqNumQuery = rawName.trim().match(/^REQ-(\d+)$/i);
    const targetReqNum = reqNumQuery ? Number(reqNumQuery[1]) : null;
    const exactReqDir = entries.find(
      (e) =>
        e.isDirectory() &&
        parseReqIdNum(e.name) !== null &&
        e.name.toUpperCase() === rawName.trim().toUpperCase()
    );
    const reqMatches = exactReqDir
      ? [exactReqDir]
      : entries
          .filter(
            (e) =>
              e.isDirectory() &&
              (e.name.toUpperCase() === rawName.trim().toUpperCase() ||
                (targetReqNum !== null && parseReqIdNum(e.name) === targetReqNum) ||
                (/^REQ-\d+/i.test(e.name) &&
                  Boolean(slug) &&
                  e.name.replace(/^REQ-\d+-?/i, "").toLowerCase() === slug))
          )
          .sort((a, b) => {
            const na = parseInt((a.name.match(/^REQ-(\d+)/i) || [])[1] || "0", 10);
            const nb = parseInt((b.name.match(/^REQ-(\d+)/i) || [])[1] || "0", 10);
            return nb - na;
          });
    if (reqMatches.length > 1) {
      const topNum = parseInt((reqMatches[0].name.match(/^REQ-(\d+)/i) || [])[1] || "0", 10);
      const tiedMatches = reqMatches.filter(
        (e) => parseInt((e.name.match(/^REQ-(\d+)/i) || [])[1] || "0", 10) === topNum
      );
      if (tiedMatches.length > 1) {
        fail(
          `找到多個相同優先序號的需求目錄，請改用完整目錄名稱或 --slug 指定: ${tiedMatches.map((e) => e.name).join(", ")}`
        );
        return;
      }
    }
    const reqMatch = reqMatches[0];
    if (reqMatch) {
      sourceDir = path.join(projectDir, reqMatch.name);
      const stripped = reqMatch.name.replace(/^REQ-\d+-?/i, "");
      if (stripped) {
        cleanSlug = explicitSlug ? slug : stripped;
      } else if (!explicitSlug && /^REQ-\d+$/i.test(reqMatch.name)) {
        cleanSlug = "";
      }
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

  const oldDirName = path.basename(sourceDir);
  const oldIdMatch = oldDirName.match(/^(REQ-\d+)/i);
  const oldReqId = oldIdMatch ? oldIdMatch[1].toUpperCase() : null;

  const maxId = getLatestMaxReqId(cwd, projectDir, mainBranch, remote, oldReqId ? oldDirName : null);
  const nextNum = maxId + 1;
  const nextId = `REQ-${String(nextNum).padStart(3, "0")}`;

  if (oldReqId) {
    if (nextId === oldReqId) {
      console.log(`序號無衝突，沿用既有編號 ${oldReqId}`);
    } else {
      console.log(`偵測到既有目錄 ${oldDirName}，重新定號 (Re-number): ${oldReqId} -> ${nextId}`);
    }
  }

  const finalDirName =
    oldReqId && nextId === oldReqId
      ? oldDirName
      : cleanSlug
        ? `${nextId}-${cleanSlug}`
        : nextId;
  const finalDir = path.join(projectDir, finalDirName);

  if (fs.existsSync(finalDir) && sourceDir !== finalDir) {
    fail(`目標目錄已存在，無法重命名: project/${finalDirName}`);
    return;
  }

  if (sourceDir !== finalDir) {
    fs.renameSync(sourceDir, finalDir);
  }

  const TEXT_REPLACE_EXTS = /\.(?:md|markdown|yaml|yml|puml|plantuml|txt|json|csv|sql)$/i;
  for (const filePath of listFilesRecursive(finalDir)) {
    if (!TEXT_REPLACE_EXTS.test(filePath)) continue;
    try {
      const content = fs.readFileSync(filePath, "utf8");
      let updated = content.split("{{REQ_ID}}").join(nextId);
      if (oldReqId && oldReqId !== nextId) {
        const oldIdRegex = new RegExp(`\\b${oldReqId}(?!\\d)`, "gi");
        updated = updated.replace(oldIdRegex, nextId);
      }
      if (updated !== content) {
        fs.writeFileSync(filePath, updated, "utf8");
      }
    } catch (_) {}
  }

  reindexProject();
  console.log(`\n 需求已成功定號歸檔為: ${nextId} (${finalDirName})`);

  const finalRel = path.posix.join("project", finalDirName);
  const oldRel = sourceDir !== finalDir ? path.posix.join("project", oldDirName) : null;
  const stageFinalizePaths = () => {
    const pathsToAdd = [finalRel, "project/index.md"];
    if (isExistingFile(path.join(cwd, "project", "system-spec.md"))) {
      pathsToAdd.push("project/system-spec.md");
    }
    spawnSync("git", ["add", "-A", "--", ...pathsToAdd], { cwd, encoding: "utf8" });
    if (oldRel) {
      const trackedOld = spawnSync("git", ["ls-files", "--", oldRel], { cwd, encoding: "utf8" });
      if (trackedOld.status === 0 && (trackedOld.stdout || "").trim()) {
        spawnSync("git", ["add", "-u", "--", oldRel], { cwd, encoding: "utf8" });
      }
    }
  };

  const systemSpecPath = path.join(cwd, "project", "system-spec.md");
  const configMergeStrategy = isExistingFile(systemSpecPath)
    ? extractMergeStrategy(fs.readFileSync(systemSpecPath, "utf8"))
    : "auto-merge";
  const shouldAutoMerge = !args.includes("--no-merge") && !args.includes("--pr") && configMergeStrategy !== "pr";

  const commitSubjectName = /^REQ-\d+$/i.test(rawName.trim()) ? cleanSlug || nextId : rawName;
  if (currentBranch && mainBranch && currentBranch !== mainBranch) {
    console.log(`[Git] 正在為分支 ${currentBranch} 建立歸檔 commit...`);
    stageFinalizePaths();
    const commitRes = spawnSync("git", ["commit", "-m", `docs(${nextId}): ${commitSubjectName} - 規格確認歸檔`], {
      cwd,
      encoding: "utf8"
    });
    if (commitRes.status === 0) {
      console.log(`[Git] 分支 ${currentBranch} 提交完成: docs(${nextId}): ${commitSubjectName} - 規格確認歸檔`);
    } else {
      const stagedCheck = spawnSync("git", ["diff", "--cached", "--name-only"], { cwd, encoding: "utf8" });
      if ((stagedCheck.stdout || "").trim()) {
        const errMsg = (commitRes.stderr || commitRes.stdout || "").trim();
        console.warn(
          `[Git 警告] 分支 ${currentBranch} 提交未建立（可能尚未設定 Git user.name / user.email 或被 hook 阻擋）${errMsg ? `: ${errMsg}` : "。"}`
        );
        return;
      }
      console.log(`[Git] 分支 ${currentBranch} 無新變更需要提交，繼續後續流程。`);
    }
    if (remote) {
      pushBranchToRemote(cwd, remote, currentBranch);
    }

    if (shouldAutoMerge) {
      // Pre-merge collision guard against remote main branch
      if (remote && remoteBranchHasReqId(cwd, remote, mainBranch, nextId)) {
        console.error(
          `[Git 衝突防護] 遠端 ${remote}/${mainBranch} 在定號期間已新增 ${nextId}！已停止自動合併，請先更新主分支後重新執行 sa-spec finalize --name ${cleanSlug || nextId} 重新領號。`
        );
        process.exitCode = 1;
        return;
      }

      const dirtyStatus = spawnSync("git", ["status", "--porcelain"], { cwd, encoding: "utf8" });
      const dirtyOutput = dirtyStatus.status === 0 ? (dirtyStatus.stdout || "").trim() : "";
      if (dirtyOutput) {
        console.warn(
          `[Git 警告] 工作區仍有未提交的變更，為避免污染或切換失敗，已略過自動合併至 ${mainBranch}：\n${dirtyOutput}\n請處理剩餘變更後手動執行：git checkout ${mainBranch} && git merge ${currentBranch}`
        );
      } else {
        console.log(`[Git] 自動切換至主分支 ${mainBranch} 並合併 ${currentBranch}...`);
        const checkoutRes = spawnSync("git", ["checkout", mainBranch], { cwd, encoding: "utf8" });
        if (checkoutRes.status !== 0) {
          console.error(`[Git 警告] 切換至主分支 ${mainBranch} 失敗: ${(checkoutRes.stderr || "").trim()}`);
          process.exitCode = 1;
          return;
        }

        if (remote) {
          const pullRes = spawnSync("git", ["pull", "--ff-only", remote, mainBranch], { cwd, encoding: "utf8" });
          if (pullRes.status !== 0) {
            console.warn(`[Git 警告] 同步 ${remote}/${mainBranch} 略過: ${(pullRes.stderr || "").trim()}`);
          }
        }

        const mergeRes = spawnSync("git", ["merge", currentBranch, "--no-edit"], { cwd, encoding: "utf8" });
        let mergedCleanly = mergeRes.status === 0;
        let autoResolvedIndex = false;
        if (!mergedCleanly) {
          const conflictedRes = spawnSync("git", ["diff", "--name-only", "--diff-filter=U"], {
            cwd,
            encoding: "utf8"
          });
          const conflictedFiles =
            conflictedRes.status === 0
              ? (conflictedRes.stdout || "")
                  .split(/\r?\n/)
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [];
          if (conflictedFiles.length === 1 && conflictedFiles[0] === "project/index.md") {
            reindexProject();
            spawnSync("git", ["add", "project/index.md"], { cwd, encoding: "utf8" });
            const resolvedCommit = spawnSync("git", ["commit", "--no-edit"], { cwd, encoding: "utf8" });
            if (resolvedCommit.status === 0) {
              mergedCleanly = true;
              autoResolvedIndex = true;
            }
          }
        }

        if (mergedCleanly) {
          console.log(
            autoResolvedIndex
              ? `[Git] 已成功將 ${currentBranch} 合併至 ${mainBranch}（並自動重建 project/index.md 索引）！`
              : `[Git] 已成功將 ${currentBranch} 合併至 ${mainBranch}！`
          );
          if (!autoResolvedIndex) {
            reindexProject();
            const statusRes = spawnSync("git", ["status", "--porcelain", "project/index.md"], {
              cwd,
              encoding: "utf8"
            });
            if (statusRes.stdout && statusRes.stdout.trim()) {
              spawnSync("git", ["add", "project/index.md"], { cwd, encoding: "utf8" });
              spawnSync("git", ["commit", "-m", `chore: update project/index.md for ${nextId}`], {
                cwd,
                encoding: "utf8"
              });
            }
          }
          if (remote) {
            pushBranchToRemote(cwd, remote, mainBranch);
          }
          console.log(
            ` 全部歸檔流程完成！已自動領取新號 ${nextId} 並自動合併回主分支 ${mainBranch}${remote ? ` 且推送至 ${remote}` : ""}。`
          );
        } else {
          spawnSync("git", ["merge", "--abort"], { cwd, encoding: "utf8" });
          spawnSync("git", ["checkout", currentBranch], { cwd, encoding: "utf8" });
          console.error(
            `[Git 警告] 合併至 ${mainBranch} 發生衝突，已中止合併並切回 ${currentBranch}，請手動確認衝突狀況：\n${(mergeRes.stderr || mergeRes.stdout || "").trim()}`
          );
          process.exitCode = 1;
        }
      }
    } else {
      console.log(
        `提示：已略過自動合併（${configMergeStrategy === "pr" ? "合併策略為 pr" : "指定 --no-merge / --pr"}）。請透過 PR 審核合併，或手動執行：`
      );
      console.log(`  git checkout ${mainBranch} && git merge ${currentBranch}`);
    }
  } else if (currentBranch && currentBranch === mainBranch) {
    stageFinalizePaths();
    const commitRes = spawnSync("git", ["commit", "-m", `docs(${nextId}): ${commitSubjectName} - 規格確認歸檔`], {
      cwd,
      encoding: "utf8"
    });
    if (commitRes.status === 0) {
      console.log(`[Git] 已直接於主分支 ${mainBranch} 建立提交完成。`);
      if (remote) {
        pushBranchToRemote(cwd, remote, mainBranch);
      }
    } else {
      const errMsg = (commitRes.stderr || commitRes.stdout || "").trim();
      console.warn(
        `[Git 警告] 主分支 ${mainBranch} 提交未建立（可能無變更或尚未設定 Git user.name / user.email）${errMsg ? `: ${errMsg}` : "。"}`
      );
    }
  } else {
    console.log("建議接下來執行：");
    console.log(`  git add -A -- ${finalRel} project/index.md project/system-spec.md`);
    console.log(`  git commit -m "docs(${nextId}): ${commitSubjectName} - 規格確認歸檔"`);
  }
}

function reindexProject(options = {}) {
  const { quiet = false } = options;
  const projectDir = path.join(cwd, "project");
  const indexPath = path.join(projectDir, "index.md");
  if (!isExistingDir(projectDir)) {
    fail("project/ directory not found.");
    return { count: 0, changed: false };
  }

  const langConfig = detectProjectLanguage(cwd);
  const t = getLangStrings(langConfig.code);

  const existingMap = new Map();
  if (isExistingFile(indexPath)) {
    for (const row of parseIndexRows(fs.readFileSync(indexPath, "utf8"))) {
      existingMap.set(row.id, row);
    }
  }

  const entries = fs.readdirSync(projectDir, { withFileTypes: true });
  const reqDirs = entries.filter((e) => e.isDirectory() && isReqDirName(e.name));

  const rows = [];
  for (const entry of reqDirs) {
    const dirName = entry.name;
    const match = dirName.match(/^(REQ-\d+)(?:-(.*))?$/i);
    if (!match) continue;
    const id = match[1].toUpperCase();
    const fallbackTitle = match[2] || dirName;

    const reqDirPath = path.join(projectDir, dirName);
    const srsPath = path.join(reqDirPath, "srs.md");

    let latestMtimeMs = 0;
    for (const filePath of listFilesRecursive(reqDirPath)) {
      try {
        const mtimeMs = fs.statSync(filePath).mtimeMs;
        if (mtimeMs > latestMtimeMs) latestMtimeMs = mtimeMs;
      } catch (_) {}
    }
    const latestMtimeStr = formatLocalDateTime(latestMtimeMs > 0 ? new Date(latestMtimeMs) : new Date());

    let title = fallbackTitle;
    let description = t.tbd;
    let status = t.pending;
    let createdAt = latestMtimeStr;
    let updatedAt = latestMtimeStr;
    let prev = null;

    if (existingMap.has(id)) {
      prev = existingMap.get(id);
      title = prev.title || title;
      description = prev.description || description;
      status = prev.status || status;
      createdAt = prev.createdAt || createdAt;
      updatedAt = prev.updatedAt || updatedAt;
    }

    if (isExistingFile(srsPath)) {
      const srsContent = fs.readFileSync(srsPath, "utf8");
      const meta = extractSrsMetadata(srsContent);
      if (meta.title) {
        title = meta.title;
      }
      if (meta.description) {
        description = meta.description;
      }
      if (meta.status) {
        status = meta.status;
      }
    }

    if (prev) {
      if (latestMtimeStr > (prev.updatedAt || "")) {
        updatedAt = latestMtimeStr;
      } else if (title !== prev.title || description !== prev.description || status !== prev.status) {
        const nowStr = formatLocalDateTime(new Date());
        updatedAt = nowStr > (prev.updatedAt || "") ? nowStr : latestMtimeStr;
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

  const prevContent = isExistingFile(indexPath) ? fs.readFileSync(indexPath, "utf8") : "";
  const nextContent = buildIndexMarkdown(langConfig.code, rows);
  fs.writeFileSync(indexPath, nextContent, "utf8");
  if (!quiet) {
    console.log(`sa-spec reindex: 已重新索引 ${rows.length} 個需求至 project/index.md`);
  }
  return { count: rows.length, changed: prevContent !== nextContent };
}

function ensureIndexRow(id, name, langCode = "zh-TW") {
  const indexRel = path.join("project", "index.md");
  const indexPath = path.join(cwd, indexRel);
  if (!isExistingFile(indexPath)) {
    return { action: "skip", target: indexRel };
  }

  const content = fs.readFileSync(indexPath, "utf8");
  const rows = parseIndexRows(content);
  const upperId = String(id).toUpperCase();
  if (rows.some((r) => String(r.id || "").trim().toUpperCase() === upperId)) {
    return { action: "skip", target: indexRel };
  }

  const t = getLangStrings(langCode);
  const now = formatLocalDateTime(new Date());
  rows.push({
    id: upperId,
    title: name,
    description: t.tbd,
    status: t.pending,
    createdAt: now,
    updatedAt: now
  });
  rows.sort((a, b) => {
    const na = parseInt((String(a.id).match(/\d+/) || ["0"])[0], 10);
    const nb = parseInt((String(b.id).match(/\d+/) || ["0"])[0], 10);
    return na - nb;
  });
  fs.writeFileSync(indexPath, buildIndexMarkdown(langCode, rows), "utf8");
  return { action: "update", target: indexRel };
}

function formatLocalDateTime(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${formatLocalDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function ensureDir(relativeDir) {
  const targetDir = path.join(cwd, relativeDir);
  if (isExistingDir(targetDir)) {
    return { action: "skip", target: relativeDir };
  }
  if (fs.existsSync(targetDir)) {
    fail(`路徑已存在但為檔案而非目錄: ${relativeDir}`);
  }
  fs.mkdirSync(targetDir, { recursive: true });
  return { action: "create", target: relativeDir };
}

function shouldSkipExistingTargetFile(targetPath, targetRelativePath) {
  if (isExistingFile(targetPath)) {
    return true;
  }
  if (fs.existsSync(targetPath)) {
    fail(`路徑已存在但為目錄而非檔案: ${targetRelativePath}`);
  }
  return false;
}

function ensureFileFromTemplate(templateRelativePath, targetRelativePath, replacements = {}) {
  const targetPath = path.join(cwd, targetRelativePath);
  if (shouldSkipExistingTargetFile(targetPath, targetRelativePath)) {
    return { action: "skip", target: targetRelativePath };
  }
  const content = applyReplacements(readTemplate(templateRelativePath), replacements);
  writeFileIfMissing(targetPath, content);
  return { action: "create", target: targetRelativePath };
}

function writeGeneratedFileIfMissing(targetRelativePath, content) {
  const targetPath = path.join(cwd, targetRelativePath);
  if (shouldSkipExistingTargetFile(targetPath, targetRelativePath)) {
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

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toPosixPath(p) {
  return String(p || "").replace(/\\/g, "/");
}

function getManagedLegacyRelativePaths() {
  const files = [];
  for (const dirName of ["skills", "rules"]) {
    const absDir = path.join(templatesDir, dirName);
    if (fs.existsSync(absDir)) {
      for (const file of listFilesRecursive(absDir)) {
        files.push(toPosixPath(path.relative(templatesDir, file)));
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
    const childRel = toPosixPath(path.join(relDir, entry.name));
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
      target: toPosixPath(`${relDir}/`),
      message: "移除舊版目錄"
    });
  }

  return canRemove;
}

function removeLegacyManagedAssets(dryRun = false, keepLegacy = false) {
  const legacyRoots = ["skills", "rules"].filter((dirName) => isExistingDir(path.join(cwd, dirName)));
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
    if (isExistingFile(absPath)) {
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
    if (!isExistingDir(absRoot)) continue;
    for (const fileAbs of listFilesRecursive(absRoot)) {
      const relPath = toPosixPath(path.relative(cwd, fileAbs));
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
  const t = getLangStrings(langConfig.code);
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
    results.push(updateFileWithContent("AGENTS.md", buildLocalizedAgentsMarkdown(langConfig.code, templatesDir), dryRun));
    results.push(...removeLegacyManagedAssets(dryRun, keepLegacy));

    const systemSpecRel = path.join("project", "system-spec.md");
    const systemSpecAbs = path.join(cwd, systemSpecRel);
    if (isExistingFile(systemSpecAbs)) {
      const currentSpec = fs.readFileSync(systemSpecAbs, "utf8");
      const stamped = stampSpecVersionInContent(currentSpec, version, langConfig.code);
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
  if (isExistingDir(projectDir)) {
    const entries = fs.readdirSync(projectDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && isReqDirName(entry.name)) {
        const reqRelDir = path.join("project", entry.name);
        const oldUmlRelPath = path.join(reqRelDir, "uml.puml");
        const oldUmlAbsPath = path.join(cwd, oldUmlRelPath);
        const newUmlRelDir = path.join(reqRelDir, "uml");
        const newUmlAbsDir = path.join(cwd, newUmlRelDir);
        const newMainUmlRelPath = path.join(newUmlRelDir, "main.puml");
        const newMainUmlAbsPath = path.join(cwd, newMainUmlRelPath);

        if (isExistingFile(oldUmlAbsPath)) {
          if (fs.existsSync(newUmlAbsDir) && !isExistingDir(newUmlAbsDir)) {
            results.push({
              action: "warn",
              target: newUmlRelDir,
              message: `目標目錄路徑 ${newUmlRelDir} 已存在但為檔案而非目錄，無法遷移 ${oldUmlRelPath}。`
            });
          } else if (!fs.existsSync(newMainUmlAbsPath)) {
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
        if (isExistingFile(handoffAbsPath)) {
          let content = fs.readFileSync(handoffAbsPath, "utf8");
          let updatedHandoff = false;
          if (content.includes("uml.puml")) {
            content = content.replace(/uml\.puml/g, "uml/");
            updatedHandoff = true;
          }
          const hasUiSection =
            content.includes(`## ${t.handoffSections[7]}`) ||
            /^##\s+.*(?:UI|畫面|界面|画面|화면|Wireframe)/im.test(content);
          if (!hasUiSection) {
            const uiSection = `\n## ${t.handoffSections[7]}\n${t.handoffUiNote}\n`;
            const acHeading = `## ${t.handoffSections[8]}`;
            if (content.includes(acHeading)) {
              content = content.replace(acHeading, `${uiSection}\n${acHeading}`);
            } else if (content.includes("## 驗收條件")) {
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
          if (
            /無\s*UI|无\s*UI|純後端|纯后端|無介面|无界面|No UI|UI 要件なし|画面なし|バックエンド専用|UI 요구사항 없음|UI 없음|화면 없음|백엔드 전용/i.test(
              text
            )
          ) {
            explicitNoUi = true;
          }
          if (
            /畫面|画面|화면|介面|界面|UI|前端|按鈕|按钮|ボタン|버튼|表單|表单|フォーム|폼|點擊|点击|頁面|页面|ページ|페이지|Page|Screen|View|Modal/i.test(
              text
            )
          ) {
            likelyHasUi = true;
          }
        };

        if (isExistingFile(handoffAbsPath)) {
          inspectUiText(fs.readFileSync(handoffAbsPath, "utf8"));
        }
        if (isExistingFile(srsAbsPath)) {
          inspectUiText(fs.readFileSync(srsAbsPath, "utf8"));
        }

        if (!isExistingFile(wireframeAbsPath)) {
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

    if (!isSourceRepo()) {
      const indexRelPath = path.join("project", "index.md");
      const indexAbsPath = path.join(cwd, indexRelPath);
      if (isExistingFile(indexAbsPath)) {
        if (dryRun) {
          const prevContent = fs.readFileSync(indexAbsPath, "utf8");
          const hasLegacyFiveCol = prevContent.split("\n").some((line) => {
            const trimmed = line.trim();
            if (!trimmed.startsWith("|")) return false;
            if (/^\|(?:\s*:?-{2,}:?\s*\|)+\s*$/.test(trimmed)) return false;
            return splitIndexCells(trimmed).length === 5;
          });
          if (hasLegacyFiveCol) {
            results.push({
              action: "update",
              target: indexRelPath,
              message: "偵測到舊版 5 欄索引格式，將升級為 6 欄格式"
            });
          }
        } else {
          const { changed, count } = reindexProject({ quiet: true });
          if (changed) {
            results.push({
              action: "update",
              target: indexRelPath,
              message: `重新索引 ${count} 個需求並更新為最新索引格式`
            });
          }
        }
      }
    }
  }

  printResultList(dryRun ? "upgrade (dry-run)" : "upgrade", results);
}

function updateFileWithContent(targetRelativePath, nextContent, dryRun = false) {
  const targetAbsolutePath = path.join(cwd, targetRelativePath);
  let resolvedContent = nextContent;
  if (!fs.existsSync(targetAbsolutePath)) {
    if (!dryRun) {
      writeFileIfMissing(targetAbsolutePath, resolvedContent);
    }
    return { action: "create", target: targetRelativePath };
  }
  if (!isExistingFile(targetAbsolutePath)) {
    return { action: "warn", target: targetRelativePath, message: "目標路徑為目錄而非檔案，已略過覆寫" };
  }

  const currentContent = fs.readFileSync(targetAbsolutePath, "utf8");
  if (currentContent.includes("<claude-mem-context>")) {
    const memMatch = currentContent.match(/(<claude-mem-context>[\s\S]*?<\/claude-mem-context>)/);
    if (memMatch && !resolvedContent.includes("<claude-mem-context>")) {
      resolvedContent = `${resolvedContent.trimEnd()}\n\n\n${memMatch[1]}\n`;
    }
  }

  if (currentContent.trim() === resolvedContent.trim()) {
    return { action: "skip", target: targetRelativePath };
  }

  if (!dryRun) {
    fs.writeFileSync(targetAbsolutePath, resolvedContent, "utf8");
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
    console.log(`${action} ${toPosixPath(result.target)}${result.message ? ` - ${result.message}` : ""}`);
  }
}

function resolveReqTargetDir(target) {
  const directAbs = path.resolve(cwd, target);
  if (isExistingDir(directAbs)) {
    return directAbs;
  }

  const projectDir = path.join(cwd, "project");
  if (!isExistingDir(projectDir)) return null;

  const projectSubAbs = path.join(projectDir, target);
  if (isExistingDir(projectSubAbs)) {
    return projectSubAbs;
  }

  const dirs = fs
    .readdirSync(projectDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  const upper = target.toUpperCase();
  const slug = slugify(target);

  const exact = dirs.find(
    (name) => name.toUpperCase() === upper || (slug && name.toLowerCase() === slug)
  );
  if (exact) return path.join(projectDir, exact);

  const reqNumQuery = target.trim().match(/^REQ-(\d+)$/i);
  if (reqNumQuery) {
    const targetReqNum = Number(reqNumQuery[1]);
    const idMatches = dirs.filter((name) => parseReqIdNum(name) === targetReqNum);
    if (idMatches.length > 0) {
      const exactPrefixMatch = idMatches.find((name) => name.toUpperCase().startsWith(`${upper}-`));
      return path.join(projectDir, exactPrefixMatch || idMatches[0]);
    }
  }

  if (slug) {
    const reqSlugMatches = dirs
      .filter(
        (name) =>
          /^REQ-\d+-/i.test(name) &&
          name.replace(/^REQ-\d+-?/i, "").toLowerCase() === slug
      )
      .sort((a, b) => {
        const na = parseInt((a.match(/^REQ-(\d+)/i) || [])[1] || "0", 10);
        const nb = parseInt((b.match(/^REQ-(\d+)/i) || [])[1] || "0", 10);
        return nb - na;
      });
    if (reqSlugMatches.length > 0) {
      return path.join(projectDir, reqSlugMatches[0]);
    }
  }

  return null;
}

function exportReqDirToPdf(reqAbsDir, options = {}) {
  const { split = false, output = null, browser = null, pdfOptions = {} } = options;
  const dirName = path.basename(reqAbsDir);
  const results = [];

  if (!split) {
    const merged = buildMergedRequirementMarkdown(reqAbsDir, pdfOptions);
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
  const onlineUml = args.includes("--online-uml");
  const output = getOption(args, "--output");
  const browser = getOption(args, "--browser");
  const langConfig = detectProjectLanguage(cwd);
  const pdfOptions = { noUmlRender, onlineUml, lang: langConfig.code };

  const positional = getPositionalArgs(args, ["--output", "--browser"]);
  const target = positional[0];
  if (split && output) {
    fail("錯誤: --split 與 --output 不能同時使用（--split 會為每個 Markdown 檔案分別產生對應的 PDF）。");
    return;
  }
  if (all && output) {
    fail("錯誤: --all 與 --output 不能同時使用（--all 會為每個需求目錄分別產生對應的 PDF）。");
    return;
  }
  if (!all && !target) {
    fail(
      "Usage: sa-spec pdf <file.md|REQ-001|name> [--split] [--output out.pdf] [--browser <path>] [--online-uml | --no-uml-render]\n       sa-spec pdf --all [--split] [--online-uml | --no-uml-render]"
    );
    return;
  }

  const results = [];

  if (all) {
    const projectDir = path.join(cwd, "project");
    if (!isExistingDir(projectDir)) {
      fail("找不到 project/ 目錄。");
      return;
    }
    const entries = fs.readdirSync(projectDir, { withFileTypes: true });
    const reqDirs = entries
      .filter((e) => e.isDirectory() && isReqDirName(e.name))
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
    const defaultPdfAbs = path.join(
      path.dirname(directFileAbs),
      `${path.basename(directFileAbs, path.extname(directFileAbs))}.pdf`
    );
    const targetPdf = output
      ? path.relative(cwd, path.resolve(cwd, output))
      : path.relative(cwd, defaultPdfAbs);
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
  sa-spec templates [name] [--lang <code>] [--list] [--json]
  sa-spec template <system-spec|req> [options]
  sa-spec pdf <file.md|REQ-001|name> [--split] [--output out.pdf] [--browser <path>] [--online-uml | --no-uml-render]
  sa-spec pdf --all [--split] [--browser <path>] [--online-uml | --no-uml-render]
  sa-spec reindex
  sa-spec check [--strict]
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
