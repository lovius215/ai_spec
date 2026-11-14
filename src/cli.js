const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  buildHtmlDocument,
  convertMarkdownFileToPdf,
  buildMergedRequirementMarkdown,
  renderHtmlToPdf
} = require("./pdf");

const cwd = process.cwd();
const rootDir = path.resolve(__dirname, "..");
const templatesDir = path.join(rootDir, "templates");

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
      runCheck();
      return;
    case "upgrade":
    case "update":
      upgradeProject(args.slice(1));
      return;
    case "doctor":
      runDoctor();
      return;
    case "status":
      showStatus();
      return;
    case "template":
      runTemplate(args.slice(1));
      return;
    case "templates":
      runTemplatesList(args.slice(1));
      return;
    case "instructions":
      runInstructions(args.slice(1));
      return;
    case "rules":
      runRules(args.slice(1));
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

const SUPPORTED_LANGS = {
  "zh-tw": { code: "zh-TW", name: "繁體中文", label: "繁體中文 (zh-TW)" },
  "en": { code: "en", name: "English", label: "English (en)" },
  "zh-cn": { code: "zh-CN", name: "简体中文", label: "简体中文 (zh-CN)" },
  "ja": { code: "ja", name: "日本語", label: "日本語 (ja)" },
  "ko": { code: "ko", name: "한국어", label: "한국어 (ko)" }
};

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

  const replacements = {
    LANG_LABEL: langConfig.label,
    LANG_CODE: langConfig.code
  };

  const results = [
    ensureGitRepository(),
    ensureDir("project"),
    ensureFileFromTemplate("AGENTS.md", "AGENTS.md", replacements),
    ensureFileFromTemplate("readme.md", "readme.md", replacements),
    ensureFileFromTemplate(path.join("project", "index.md"), path.join("project", "index.md"), replacements),
    ensureFileFromTemplate(path.join("project", "system-spec.md"), path.join("project", "system-spec.md"), replacements)
  ];

  printResultList("init", results);
  console.log(`專案規格主要語言已設定為: ${langConfig.label}`);
  if (includeRules) {
    console.log("提示: 完整分析規範與補充規則已內建於 sa-spec CLI（透過 sa-spec instructions / sa-spec rules 讀取），專案目錄不額外建立 skills/ 與 rules/。");
  }
}

function ensureGitRepository() {
  const gitVersion = spawnSync("git", ["--version"], { cwd, encoding: "utf8" });
  if (gitVersion.error && gitVersion.error.code === "ENOENT") {
    return {
      action: "warn",
      target: "git",
      message: "Git 未安裝；後續歸檔會使用版本管理，請先安裝 Git。"
    };
  }

  if (gitVersion.status !== 0) {
    return {
      action: "warn",
      target: "git",
      message: "無法確認 Git 是否可用；後續歸檔可能無法使用版本管理。"
    };
  }

  const workTree = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd, encoding: "utf8" });
  if (workTree.status === 0 && workTree.stdout.trim() === "true") {
    return { action: "skip", target: "git repository" };
  }

  const init = spawnSync("git", ["init"], { cwd, encoding: "utf8" });
  if (init.status !== 0) {
    process.exitCode = 1;
    return {
      action: "warn",
      target: "git init",
      message: (init.stderr || init.stdout || "git init 執行失敗。").trim()
    };
  }

  return { action: "update", target: ".git" };
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

function runDoctor() {
  return checkRequiredPaths("sa-spec doctor");
}

function checkRequiredPaths(heading) {
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

function runCheck() {
  console.log("sa-spec check");
  if (!checkRequiredPaths(null)) {
    return;
  }
  if (!isSourceRepo()) {
    const hasLegacySkills = fs.existsSync(path.join(cwd, "skills"));
    const hasLegacyRules = fs.existsSync(path.join(cwd, "rules"));
    if (hasLegacySkills || hasLegacyRules) {
      console.log("提示: 偵測到舊版專案內置 skills/ 或 rules/，建議執行 sa-spec upgrade 移除並改用套件內建規範。");
    }
  }
  checkDuplicateReqIds();
  console.log("");
  showStatus(false);
}

function checkDuplicateReqIds() {
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
  } else {
    console.log("序號唯一性: OK");
    return true;
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
    const match = content.match(/^- 狀態：\s*(.+)$/m);
    console.log(`系統規格書狀態: ${match ? match[1].trim() : "未標示"}`);
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
  const outputIndex = args.indexOf("--output");
  const output = outputIndex >= 0 ? args[outputIndex + 1] : null;
  const content = readTemplate(templatePath);

  if (args.includes("--stdout") || !output) {
    process.stdout.write(content.endsWith("\n") ? content : `${content}\n`);
    return;
  }

  writeFileIfMissing(path.resolve(cwd, output), content);
  console.log(`Created ${output}`);
}

function createReqTemplate(args, label = "new") {
  const id = getOption(args, "--id");
  const name = getOption(args, "--name");

  if (!name) {
    fail("Usage: sa-spec new [--id REQ-001] --name login [--branch]");
    return;
  }

  const slug = slugify(name);

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

      const remote = getDefaultRemote();
      const activeBranch = getCurrentBranch() || branchName;
      if (remote && activeBranch) {
        pushBranchToRemote(remote, activeBranch);
      }
    }

    const reqDir = path.join("project", slug);
    const umlDir = path.join(reqDir, "uml");
    const replacements = { REQ_ID: "{{REQ_ID}}", REQ_NAME: name };
    const results = [
      ensureDir(reqDir),
      ensureDir(umlDir),
      ensureFileFromTemplate(path.join("project", "req", "srs.md"), path.join(reqDir, "srs.md"), replacements),
      ensureFileFromTemplate(path.join("project", "req", "uml", "main.puml"), path.join(umlDir, "main.puml"), replacements),
      ensureFileFromTemplate(path.join("project", "req", "uml", "wireframe.puml"), path.join(umlDir, "wireframe.puml"), replacements),
      ensureFileFromTemplate(path.join("project", "req", "openapi.yaml"), path.join(reqDir, "openapi.yaml"), replacements),
      ensureFileFromTemplate(path.join("project", "req", "db-schema.md"), path.join(reqDir, "db-schema.md"), replacements),
      ensureFileFromTemplate(path.join("project", "req", "handoff.md"), path.join(reqDir, "handoff.md"), replacements),
      ensureFileFromTemplate(path.join("project", "req", "history.md"), path.join(reqDir, "history.md"), replacements)
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
    ensureFileFromTemplate(path.join("project", "req", "srs.md"), path.join(reqDir, "srs.md"), replacements),
    ensureFileFromTemplate(path.join("project", "req", "uml", "main.puml"), path.join(umlDir, "main.puml"), replacements),
    ensureFileFromTemplate(path.join("project", "req", "uml", "wireframe.puml"), path.join(umlDir, "wireframe.puml"), replacements),
    ensureFileFromTemplate(path.join("project", "req", "openapi.yaml"), path.join(reqDir, "openapi.yaml"), replacements),
    ensureFileFromTemplate(path.join("project", "req", "db-schema.md"), path.join(reqDir, "db-schema.md"), replacements),
    ensureFileFromTemplate(path.join("project", "req", "handoff.md"), path.join(reqDir, "handoff.md"), replacements),
    ensureFileFromTemplate(path.join("project", "req", "history.md"), path.join(reqDir, "history.md"), replacements),
    ensureIndexRow(id, name)
  ];

  printResultList(label, results);
}

function getDefaultRemote() {
  const res = spawnSync("git", ["remote"], { cwd, encoding: "utf8" });
  if (res.status === 0 && res.stdout) {
    const remotes = res.stdout
      .split("\n")
      .map((r) => r.trim())
      .filter(Boolean);
    if (remotes.includes("origin")) return "origin";
    if (remotes.length > 0) return remotes[0];
  }
  return null;
}

function pushBranchToRemote(remote, branch) {
  if (!remote || !branch) return false;
  console.log(`[Git] 偵測到遠端 (${remote})，正在將分支 ${branch} 推送至 ${remote}/${branch}...`);
  const pushRes = spawnSync("git", ["push", "-u", remote, branch], { cwd, encoding: "utf8" });
  if (pushRes.status === 0) {
    console.log(`[Git] 已成功將分支 ${branch} 推送至 ${remote}/${branch}`);
    return true;
  } else {
    console.warn(`[Git 警告] 推送分支 ${branch} 至 ${remote} 失敗: ${(pushRes.stderr || pushRes.stdout || "").trim()}`);
    return false;
  }
}

function detectMainBranch() {
  const branches = ["main", "master"];
  for (const b of branches) {
    const res = spawnSync("git", ["rev-parse", "--verify", b], { cwd, encoding: "utf8" });
    if (res.status === 0) return b;
  }
  return null;
}

function getCurrentBranch() {
  const res = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd, encoding: "utf8" });
  if (res.status === 0) {
    const b = res.stdout.trim();
    return b === "HEAD" ? null : b;
  }
  return null;
}

function getLatestMaxReqId(projectDir, mainBranch, remoteName = "origin") {
  let maxIdNum = 0;
  // 1. 掃描本地工作目錄既有 REQ-xxx
  if (fs.existsSync(projectDir)) {
    const entries = fs.readdirSync(projectDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith("REQ-")) {
        const m = entry.name.match(/^REQ-(\d+)/i);
        if (m) {
          const num = parseInt(m[1], 10);
          if (num > maxIdNum) maxIdNum = num;
        }
      }
    }
  }

  // 2. 掃描主分支 (若在 Git 環境下)
  if (mainBranch) {
    const gitLs = spawnSync("git", ["ls-tree", `${mainBranch}:project`], { cwd, encoding: "utf8" });
    if (gitLs.status === 0 && gitLs.stdout) {
      for (const line of gitLs.stdout.split("\n")) {
        const parts = line.split("\t");
        if (parts.length > 1) {
          const m = parts[1].trim().match(/^REQ-(\d+)/i);
          if (m) {
            const num = parseInt(m[1], 10);
            if (num > maxIdNum) maxIdNum = num;
          }
        }
      }
    }

    // 3. 掃描遠端主分支 (若有設定 remote)
    const targetRemote = remoteName || "origin";
    const gitRemoteLs = spawnSync("git", ["ls-tree", `${targetRemote}/${mainBranch}:project`], { cwd, encoding: "utf8" });
    if (gitRemoteLs.status === 0 && gitRemoteLs.stdout) {
      for (const line of gitRemoteLs.stdout.split("\n")) {
        const parts = line.split("\t");
        if (parts.length > 1) {
          const m = parts[1].trim().match(/^REQ-(\d+)/i);
          if (m) {
            const num = parseInt(m[1], 10);
            if (num > maxIdNum) maxIdNum = num;
          }
        }
      }
    }
  }

  return maxIdNum;
}

function finalizeReq(args) {
  const rawName = getOption(args, "--name") || getOption(args, "--draft") || args[0];
  if (!rawName) {
    fail("Usage: sa-spec finalize --name <name-or-slug> [--no-merge]");
    return;
  }

  const slug = slugify(rawName);
  const projectDir = path.join(cwd, "project");
  let draftRelDir = null;
  let draftAbsDir = null;
  let cleanSlug = slug;
  let oldId = null;

  // 1. 優先尋找草稿目錄 (project/<slug> 或 project/draft-<slug>)
  if (fs.existsSync(path.join(cwd, "project", slug))) {
    draftRelDir = path.join("project", slug);
    draftAbsDir = path.join(cwd, draftRelDir);
  } else if (fs.existsSync(path.join(cwd, "project", `draft-${slug}`))) {
    draftRelDir = path.join("project", `draft-${slug}`);
    draftAbsDir = path.join(cwd, draftRelDir);
  } else if (fs.existsSync(projectDir)) {
    // 2. 尋找既有 REQ-xxx 目錄 (支援序號衝突時的重新定號修復)
    const entries = fs.readdirSync(projectDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const m = entry.name.match(/^(REQ-\d+)-(.*)$/i);
        if (m) {
          const entrySlug = slugify(m[2]);
          if (entrySlug === slug || slugify(entry.name) === slug) {
            oldId = m[1].toUpperCase();
            cleanSlug = entrySlug;
            draftRelDir = path.join("project", entry.name);
            draftAbsDir = path.join(cwd, draftRelDir);
            break;
          }
        }
      }
    }
  }

  if (!draftAbsDir || !fs.existsSync(draftAbsDir)) {
    fail(`找不到草稿或既有需求目錄: project/${slug}`);
    return;
  }

  // 1. 先檢查是否有 remote，若有則先將目前分支推上 remote 並同步遠端狀態，接著才查詢主分支最新 REQ 序號
  const remote = getDefaultRemote();
  const mainBranch = detectMainBranch();
  const currentBranch = getCurrentBranch();

  if (remote && currentBranch) {
    pushBranchToRemote(remote, currentBranch);
    spawnSync("git", ["fetch", remote], { cwd, encoding: "utf8" });
  }

  const maxIdNum = getLatestMaxReqId(projectDir, mainBranch, remote);

  const nextIdNum = maxIdNum + 1;
  const nextId = `REQ-${String(nextIdNum).padStart(3, "0")}`;
  const finalDirName = `${nextId}-${cleanSlug}`;
  const finalRelDir = path.join("project", finalDirName);
  const finalAbsDir = path.join(cwd, finalRelDir);

  if (fs.existsSync(finalAbsDir) && finalAbsDir !== draftAbsDir) {
    fail(`目標目錄 ${finalRelDir} 已存在，請確認序號或目錄名稱。`);
    return;
  }

  // 2. 重命名目錄 (優先嘗試 git mv)
  if (draftAbsDir !== finalAbsDir) {
    const gitMv = spawnSync("git", ["mv", draftRelDir, finalRelDir], { cwd, encoding: "utf8" });
    if (gitMv.status === 0) {
      console.log(`[Git] 已將目錄重命名為: ${finalRelDir}`);
    } else {
      fs.renameSync(draftAbsDir, finalAbsDir);
      console.log(`已將目錄重命名為: ${finalRelDir}`);
    }
  }

  // 3. 替換目錄內檔案的 {{REQ_ID}} 佔位符及舊序號
  const files = listFilesRecursive(finalAbsDir);
  for (const filePath of files) {
    try {
      let content = fs.readFileSync(filePath, "utf8");
      let changed = false;
      if (content.includes("{{REQ_ID}}")) {
        content = content.split("{{REQ_ID}}").join(nextId);
        changed = true;
      }
      if (oldId && content.includes(oldId)) {
        content = content.split(oldId).join(nextId);
        changed = true;
      }
      if (changed) {
        fs.writeFileSync(filePath, content, "utf8");
      }
    } catch (_) {
      // 略過無法以文字讀取之檔案
    }
  }

  // 4. 自動重新整理 index.md
  reindexProject();

  console.log(`\n 需求已成功定號歸檔為: ${nextId} (${finalDirName})`);

  // 5. 自動提交、自動合併回主分支與自動推送至 remote (Git-Flow 閉環)
  const shouldAutoMerge = !args.includes("--no-merge");
  if (currentBranch && mainBranch && currentBranch !== mainBranch) {
    console.log(`[Git] 正在為分支 ${currentBranch} 建立歸檔 commit...`);
    spawnSync("git", ["add", "project/"], { cwd, encoding: "utf8" });
    const commitRes = spawnSync("git", ["commit", "-m", `docs(${nextId}): ${rawName} - 規格確認歸檔`], { cwd, encoding: "utf8" });
    if (commitRes.status === 0) {
      console.log(`[Git] 分支 ${currentBranch} 提交完成: docs(${nextId}): ${rawName} - 規格確認歸檔`);
    }
    if (remote) {
      pushBranchToRemote(remote, currentBranch);
    }

    if (shouldAutoMerge) {
      console.log(`[Git] 自動切換至主分支 ${mainBranch} 並合併 ${currentBranch}...`);
      const checkoutRes = spawnSync("git", ["checkout", mainBranch], { cwd, encoding: "utf8" });
      if (checkoutRes.status !== 0) {
        console.error(`[Git 警告] 切換至主分支 ${mainBranch} 失敗: ${(checkoutRes.stderr || "").trim()}`);
        return;
      }

      const mergeRes = spawnSync("git", ["merge", currentBranch, "--no-edit"], { cwd, encoding: "utf8" });
      if (mergeRes.status === 0) {
        console.log(`[Git] 已成功將 ${currentBranch} 合併至 ${mainBranch}！`);
        // 主分支重新整理索引確保排序與衝突檢查無誤
        reindexProject();
        const statusRes = spawnSync("git", ["status", "--porcelain", "project/index.md"], { cwd, encoding: "utf8" });
        if (statusRes.stdout && statusRes.stdout.trim()) {
          spawnSync("git", ["add", "project/index.md"], { cwd, encoding: "utf8" });
          spawnSync("git", ["commit", "-m", `chore: update project/index.md for ${nextId}`], { cwd, encoding: "utf8" });
        }
        if (remote) {
          pushBranchToRemote(remote, mainBranch);
        }
        console.log(` 全部歸檔流程完成！已自動領取新號 ${nextId} 並自動合併回主分支 ${mainBranch}${remote ? ` 且推送至 ${remote}` : ""}。`);
      } else {
        console.error(`[Git 警告] 合併至 ${mainBranch} 發生衝突，請手動確認衝突狀況：\n${(mergeRes.stderr || mergeRes.stdout || "").trim()}`);
      }
    } else {
      console.log(`提示：已跳過自動合併 (--no-merge)。請在完成後手動執行：`);
      console.log(`  git checkout ${mainBranch} && git merge ${currentBranch}`);
    }
  } else if (currentBranch && currentBranch === mainBranch) {
    spawnSync("git", ["add", "project/"], { cwd, encoding: "utf8" });
    spawnSync("git", ["commit", "-m", `docs(${nextId}): ${rawName} - 規格確認歸檔`], { cwd, encoding: "utf8" });
    console.log(`[Git] 已直接於主分支 ${mainBranch} 建立提交完成。`);
    if (remote) {
      pushBranchToRemote(remote, mainBranch);
    }
  } else {
    console.log(`建議接下來執行：`);
    console.log(`  git add project/`);
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

  // 讀取現有索引
  const existingMap = new Map();
  if (fs.existsSync(indexPath)) {
    const existingRows = parseIndexRows(fs.readFileSync(indexPath, "utf8"));
    for (const row of existingRows) {
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
    let description = "待補充";
    let status = "待確認";
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
      const titleMatch = srsContent.match(/^# 需求規格[：:]\s*(?:REQ-\d+\s*)?(.*)$/m);
      if (titleMatch && titleMatch[1].trim()) {
        title = titleMatch[1].trim();
      }
      const statusMatch = srsContent.match(/^-\s*狀態[：:]\s*(.+)$/m);
      if (statusMatch && statusMatch[1].trim()) {
        status = statusMatch[1].trim();
      }
    }

    const numMatch = id.match(/\d+/);
    const num = numMatch ? parseInt(numMatch[0], 10) : 0;

    rows.push({ num, id, title, description, status, createdAt, updatedAt });
  }

  // 依數字循序排序
  rows.sort((a, b) => a.num - b.num);

  // 檢查是否有重複編號衝突
  const idCountMap = new Map();
  for (const r of rows) {
    idCountMap.set(r.id, (idCountMap.get(r.id) || 0) + 1);
  }
  const duplicateIds = Array.from(idCountMap.entries()).filter(([_, count]) => count > 1);
  if (duplicateIds.length > 0) {
    console.warn("\n[警告] 發現重複需求編號衝突：");
    for (const [dupId, count] of duplicateIds) {
      console.warn(`  - ${dupId}: 共有 ${count} 個需求目錄共用此編號！`);
    }
    console.warn("  修復建議：請將衝突目錄之一改回草稿名稱後，重新執行 sa-spec finalize 或 scc 重新領號。\n");
  }

  const header = `# 需求索引\n\n| 編號 | 標題 | 敘述 | 狀態 | 建立時間 | 更新時間 |\n|---|---|---|---|---|---|\n`;
  const tableRows = rows
    .map((r) => `| ${r.id} | ${r.title} | ${r.description} | ${r.status} | ${r.createdAt} | ${r.updatedAt} |`)
    .join("\n");
  const nextContent = rows.length > 0 ? `${header}${tableRows}\n` : `${header}\n`;

  fs.writeFileSync(indexPath, nextContent, "utf8");
  console.log(`sa-spec reindex: 已重新索引 ${rows.length} 個需求至 project/index.md`);
}

function ensureIndexRow(id, name) {
  const indexPath = path.join(cwd, "project", "index.md");
  if (!fs.existsSync(indexPath)) {
    return { action: "skip", target: path.join("project", "index.md") };
  }

  const content = fs.readFileSync(indexPath, "utf8");
  if (content.includes(`| ${id} |`)) {
    return { action: "skip", target: path.join("project", "index.md") };
  }

  const now = formatLocalDateTime(new Date());
  const row = `| ${id} | ${name} | 待補充 | 待確認 | ${now} | ${now} |`;
  const nextContent = content.endsWith("\n") ? `${content}${row}\n` : `${content}\n${row}\n`;
  fs.writeFileSync(indexPath, nextContent, "utf8");
  return { action: "update", target: path.join("project", "index.md") };
}

function formatLocalDateTime(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-") + " " + [
    pad(date.getHours()),
    pad(date.getMinutes())
  ].join(":");
}

function ensureDir(relativeDir) {
  const absoluteDir = path.join(cwd, relativeDir);
  if (fs.existsSync(absoluteDir)) {
    return { action: "skip", target: relativeDir };
  }

  fs.mkdirSync(absoluteDir, { recursive: true });
  return { action: "create", target: relativeDir };
}

function ensureFileFromTemplate(templateRelativePath, targetRelativePath, replacements = {}) {
  const targetAbsolutePath = path.join(cwd, targetRelativePath);
  if (fs.existsSync(targetAbsolutePath)) {
    return { action: "skip", target: targetRelativePath };
  }

  const content = applyReplacements(readTemplate(templateRelativePath), replacements);
  writeFileIfMissing(targetAbsolutePath, content);
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
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
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

function parseIndexRows(content) {
  return content
    .split("\n")
    .filter((line) => line.startsWith("|") && !line.includes("---") && !line.includes("編號"))
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

function getOption(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] || null : null;
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function detectProjectLanguage() {
  const systemSpecPath = path.join(cwd, "project", "system-spec.md");
  if (fs.existsSync(systemSpecPath)) {
    const content = fs.readFileSync(systemSpecPath, "utf8");
    const match = content.match(/^-\s*(?:主要語言|語言|Language)[：:]\s*(.+)$/im);
    if (match) {
      const val = match[1].trim();
      for (const key of Object.keys(SUPPORTED_LANGS)) {
        if (
          val.toLowerCase().includes(key) ||
          val.includes(SUPPORTED_LANGS[key].label) ||
          val.includes(SUPPORTED_LANGS[key].name) ||
          val.includes(SUPPORTED_LANGS[key].code)
        ) {
          return SUPPORTED_LANGS[key];
        }
      }
      return { code: "custom", label: val };
    }
  }
  return SUPPORTED_LANGS["zh-tw"];
}

function upgradeProject(args = []) {
  const dryRun = args.includes("--dry-run");
  const keepLegacy = args.includes("--keep-legacy");
  const langConfig = detectProjectLanguage();
  console.log(`專案目前語言: ${langConfig.label}（依現有語言升級，不變更設定）`);
  const results = [];

  if (isSourceRepo()) {
    results.push({
      action: "skip",
      target: "AGENTS.md & skills/ & rules/",
      message: "套件開發主目錄，保留原始開發設定與範本"
    });
  } else {
    results.push(updateFileFromTemplate("AGENTS.md", "AGENTS.md", dryRun));
    results.push(...removeLegacyManagedAssets(dryRun, keepLegacy));
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
          if (!content.includes("## UI") && !content.includes("畫面規格")) {
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

        // 檢查既有需求是否需要 wireframe
        const wireframeRelPath = path.join(newUmlRelDir, "wireframe.puml");
        const wireframeAbsPath = path.join(cwd, wireframeRelPath);
        const srsRelPath = path.join(reqRelDir, "srs.md");
        const srsAbsPath = path.join(cwd, srsRelPath);

        let explicitNoUi = false;
        let likelyHasUi = false;

        const inspectUiText = (text) => {
          if (/無\s*UI/i.test(text) || /純後端/i.test(text) || /無介面/i.test(text)) {
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

  const inProjectAbs = path.join(projectDir, target);
  if (fs.existsSync(inProjectAbs) && fs.statSync(inProjectAbs).isDirectory()) {
    return inProjectAbs;
  }

  const norm = target.toLowerCase().trim();
  const entries = fs.readdirSync(projectDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const nameLower = entry.name.toLowerCase();
    if (
      nameLower === norm ||
      nameLower.startsWith(`${norm}-`) ||
      nameLower.endsWith(`-${slugify(target)}`)
    ) {
      return path.join(projectDir, entry.name);
    }
  }
  return null;
}

function exportReqDirToPdf(reqAbsDir, options = {}) {
  const { split = false, output = null, browser = null } = options;
  const relDir = path.relative(cwd, reqAbsDir) || path.basename(reqAbsDir);
  const results = [];

  if (split) {
    const entries = fs.readdirSync(reqAbsDir, { withFileTypes: true });
    const mdFiles = entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".md"))
      .map((e) => path.join(reqAbsDir, e.name));

    for (const mdFile of mdFiles) {
      const res = convertMarkdownFileToPdf(mdFile, null, browser);
      const relPdf = path.relative(cwd, mdFile.replace(/\.md$/i, ".pdf"));
      if (res.ok) {
        results.push({ action: "create", target: relPdf, message: `由 ${path.relative(cwd, mdFile)} 轉換 (${res.engine})` });
      } else {
        results.push({ action: "warn", target: relPdf, message: res.error });
      }
    }
    return results;
  }

  const merged = buildMergedRequirementMarkdown(reqAbsDir);
  if (!merged.markdown.trim()) {
    results.push({ action: "warn", target: relDir, message: "目錄內無可匯出的規格文件內容" });
    return results;
  }

  const defaultPdfPath = path.join(reqAbsDir, `${path.basename(reqAbsDir)}.pdf`);
  const targetPdfPath = output ? path.resolve(cwd, output) : defaultPdfPath;
  const html = buildHtmlDocument(merged.title, merged.markdown);
  const res = renderHtmlToPdf(html, targetPdfPath, browser);
  const relPdf = path.relative(cwd, targetPdfPath);

  if (res.ok) {
    results.push({
      action: "create",
      target: relPdf,
      message: `已整包合併匯出完整需求規格書 PDF (${res.engine})`
    });
  } else {
    results.push({ action: "warn", target: relPdf, message: res.error });
  }
  return results;
}

function runPdf(args = []) {
  const split = args.includes("--split");
  const all = args.includes("--all");
  const output = getOption(args, "--output") || getOption(args, "-o");
  const browser = getOption(args, "--browser");

  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--output" || a === "-o" || a === "--browser" || a === "--name" || a === "--target") {
      i++;
      continue;
    }
    if (a.startsWith("-")) continue;
    positional.push(a);
  }

  const target = getOption(args, "--name") || getOption(args, "--target") || positional[0];

  if (!target && !all) {
    fail(
      "Usage:\n  sa-spec pdf <file.md> [--output out.pdf]\n  sa-spec pdf <REQ-001|name|dir> [--split] [--output out.pdf]\n  sa-spec pdf --all [--split]"
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
    for (const rootMd of ["system-spec.md", "index.md"]) {
      const mdPath = path.join(projectDir, rootMd);
      if (fs.existsSync(mdPath)) {
        const res = convertMarkdownFileToPdf(mdPath, null, browser);
        const relPdf = path.relative(cwd, mdPath.replace(/\.md$/i, ".pdf"));
        results.push(
          res.ok
            ? { action: "create", target: relPdf, message: `已轉換 (${res.engine})` }
            : { action: "warn", target: relPdf, message: res.error }
        );
      }
    }
    const entries = fs.readdirSync(projectDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const reqDir = path.join(projectDir, entry.name);
        results.push(...exportReqDirToPdf(reqDir, { split, browser }));
      }
    }
    printResultList("pdf", results);
    return;
  }

  // 1. Check if target is a single .md file
  const directFileAbs = path.resolve(cwd, target);
  if (fs.existsSync(directFileAbs) && fs.statSync(directFileAbs).isFile()) {
    const res = convertMarkdownFileToPdf(directFileAbs, output, browser);
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

  // 2. Check if target resolves to a requirement directory
  const reqDirAbs = resolveReqTargetDir(target);
  if (reqDirAbs) {
    results.push(...exportReqDirToPdf(reqDirAbs, { split, output, browser }));
    if (results.some((r) => r.action === "warn")) {
      process.exitCode = 1;
    }
    printResultList("pdf", results);
    return;
  }

  fail(`找不到指定的 Markdown 檔案或需求目錄: ${target}`);
}

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
    ]
  },
  propose: {
    stage: "propose",
    command: "spec:propose (scp)",
    summary: "建立需求 feature 分支並產出延遲定號（{{REQ_ID}}）草稿目錄。",
    recommendedRules: ["spec", "file-style"],
    recommendedTemplates: ["srs", "handoff", "history", "openapi", "db-schema"],
    steps: [
      "依需求英文短名建立並切換至專屬 feature 分支（feat/<name>）；若已在 feature branch 則沿用。",
      "鐵律：若有設定 Git remote，立即執行 git push -u <remote> feat/<name>；推送失敗僅回報認證或網路問題。",
      "執行 sa-spec new --name <name> 建立 project/<name>/ 草稿目錄（內部使用 {{REQ_ID}} 佔位）。",
      "整理需求摘要、目標、初步流程與最多 3 個高影響待確認事項；不正式定號、不歸檔、不修改既有需求。"
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
    recommendedTemplates: ["srs", "openapi", "db-schema", "handoff", "history", "uml-main", "uml-wireframe"],
    steps: [
      "先確認已同步主分支最新規格（如有 remote 先執行 git fetch），避免多人平行開發漏檢衝突。",
      "讀取 project/index.md、project/system-spec.md 與所有 project/REQ-*/{srs.md,openapi.yaml,db-schema.md,handoff.md,uml/*.puml}，檢查目標流程、角色權限、API、DB 與驗收條件衝突。",
      "若發現衝突：列出衝突需求編號與檔案、原因、影響範圍及最多 3 個待釐清問題，立即停止產出設計文件且不修改既有需求。",
      "若無衝突：以鎖定語言產出 SRS、uml/*.puml（每檔單一 @start...@end；涉及 UI 必產出 PlantUML Salt uml/wireframe.puml；純後端在 handoff.md 標註「無 UI 介面需求」）、OpenAPI YAML、DB Schema、Handoff 草稿、system-spec 更新建議與未修改其他需求聲明；此階段不可直接寫入 project/system-spec.md。"
    ]
  },
  commit: {
    stage: "commit",
    command: "spec:commit (scc)",
    summary: "僅對使用者明確確認的無衝突版本定號歸檔、更新索引與系統規格，並自動合併與推送至 remote。",
    recommendedRules: ["history", "system-spec", "review", "estimation", "file-style"],
    recommendedTemplates: ["history", "index", "system-spec"],
    steps: [
      "若有設定 Git remote，先執行 git push -u <remote> <branch> 與 git fetch <remote> 同步遠端狀態。",
      "查詢主分支（main/master 與遠端主分支）最新可用序號定號 REQ-xxx，執行 sa-spec finalize --name <name>（或依規範替換 {{REQ_ID}} 並更新索引）。",
      "依使用者確認內容更新 project/system-spec.md，補齊 handoff.md 十大必要章節與 history.md（未經確認不可標示「已審核」）。",
      "只 stage 本次歸檔相關檔案並 commit（格式：docs(REQ-xxx): 需求名稱 - 簡短需求說明）；推上 feature branch 後切換回主分支合併、更新 project/index.md 並自動 push 主分支至 remote。"
    ]
  },
  pdf: {
    stage: "pdf",
    command: "spec:pdf (spd)",
    summary: "將單一 Markdown 或整個需求資料夾匯出為 PDF（支援合併與 PlantUML 圖表呈現）。",
    recommendedRules: ["file-style"],
    recommendedTemplates: [],
    steps: [
      "轉換單檔 Markdown：執行 sa-spec pdf <file.md> [--output <path.pdf>]。",
      "整包合併匯出單一需求：執行 sa-spec pdf REQ-001（或需求目錄 slug）。",
      "拆分為多份獨立 PDF：加上 --split；批次匯出全部需求：執行 sa-spec pdf --all [--split]。"
    ]
  }
};

const TEMPLATE_DEFINITIONS = [
  { name: "AGENTS", path: "AGENTS.md", description: "專案根目錄 AI 入口規範" },
  { name: "readme", path: "readme.md", description: "專案架構與使用說明" },
  { name: "index", path: path.join("project", "index.md"), description: "需求清單總索引" },
  { name: "system-spec", path: path.join("project", "system-spec.md"), description: "系統總體規格書範本" },
  { name: "srs", path: path.join("project", "req", "srs.md"), description: "需求規格書 (SRS) 範本" },
  { name: "openapi", path: path.join("project", "req", "openapi.yaml"), description: "OpenAPI 3.x 契約範本" },
  { name: "db-schema", path: path.join("project", "req", "db-schema.md"), description: "DB Schema 範本" },
  { name: "handoff", path: path.join("project", "req", "handoff.md"), description: "AI 開發交接摘要範本" },
  { name: "history", path: path.join("project", "req", "history.md"), description: "需求版本歷程範本" },
  { name: "uml-main", path: path.join("project", "req", "uml", "main.puml"), description: "PlantUML 主流程圖範本" },
  { name: "uml-wireframe", path: path.join("project", "req", "uml", "wireframe.puml"), description: "PlantUML Salt UI 線框圖範本" }
];

function getManagedLegacyRelativePaths() {
  const dirs = ["skills", "rules"];
  const files = [];
  for (const dirName of dirs) {
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
      const childRemoved = pruneEmptyLegacyDirs(childRel, dryRun, managedSet, results);
      if (!childRemoved) {
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

function stripFrontmatter(content) {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n*/, "").trim();
}

function listRuleEntries() {
  const rulesDir = path.join(templatesDir, "rules");
  if (!fs.existsSync(rulesDir)) return [];
  return fs
    .readdirSync(rulesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => {
      const name = entry.name.replace(/\.md$/i, "");
      const relPath = path.join("rules", entry.name);
      const content = readTemplate(relPath);
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

function listTemplateEntries() {
  return TEMPLATE_DEFINITIONS.filter((def) => fs.existsSync(path.join(templatesDir, def.path))).map((def) => ({
    name: def.name,
    path: def.path.replace(/\\/g, "/"),
    description: def.description
  }));
}

function isGitWorkingTree() {
  const res = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd, encoding: "utf8" });
  return res.status === 0 && res.stdout.trim() === "true";
}

function collectWorkspaceContext() {
  const systemSpecPath = path.join(cwd, "project", "system-spec.md");
  const indexPath = path.join(cwd, "project", "index.md");
  const agentsPath = path.join(cwd, "AGENTS.md");
  const projectDir = path.join(cwd, "project");

  let systemSpecStatus = null;
  if (fs.existsSync(systemSpecPath)) {
    const content = fs.readFileSync(systemSpecPath, "utf8");
    const match = content.match(/^-\s*(?:狀態|Status)[：:]\s*(.+)$/im);
    systemSpecStatus = match ? match[1].trim() : "未標示";
  }

  const requirements = fs.existsSync(indexPath)
    ? parseIndexRows(fs.readFileSync(indexPath, "utf8"))
    : [];

  const drafts = [];
  if (fs.existsSync(projectDir)) {
    for (const entry of fs.readdirSync(projectDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith("REQ-") || entry.name === "req") continue;
      const dirAbs = path.join(projectDir, entry.name);
      const hasDraftArtifact = ["srs.md", "handoff.md", "openapi.yaml", "db-schema.md"].some((file) =>
        fs.existsSync(path.join(dirAbs, file))
      );
      if (hasDraftArtifact) {
        drafts.push(entry.name);
      }
    }
  }

  const gitInside = isGitWorkingTree();
  const hasSkills = !isSourceRepo() && fs.existsSync(path.join(cwd, "skills"));
  const hasRules = !isSourceRepo() && fs.existsSync(path.join(cwd, "rules"));

  return {
    cwd,
    isSourceRepo: isSourceRepo(),
    initialized: fs.existsSync(agentsPath) && fs.existsSync(indexPath) && fs.existsSync(systemSpecPath),
    language: detectProjectLanguage(),
    git: {
      isGitRepo: gitInside,
      branch: gitInside ? getCurrentBranch() : null,
      mainBranch: gitInside ? detectMainBranch() : null,
      remote: gitInside ? getDefaultRemote() : null
    },
    systemSpec: {
      exists: fs.existsSync(systemSpecPath),
      status: systemSpecStatus
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
  return lines;
}

function runInstructions(args = []) {
  const asJson = args.includes("--json");
  const withRules = args.includes("--with-rules") || args.includes("--full");
  const positional = getPositionalArgs(args, ["--name", "--id"]);
  const rawStage = positional[0];
  const reqName = getOption(args, "--name");
  const reqId = getOption(args, "--id");
  const context = collectWorkspaceContext();

  if (!rawStage) {
    const stages = Object.values(STAGE_CONFIG);
    const availableRules = listRuleEntries();
    const availableTemplates = listTemplateEntries();
    if (asJson) {
      console.log(
        JSON.stringify(
          {
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
      "## 目前工作區狀態",
      ...formatContextLines(context),
      "",
      "## 可用階段指令",
      ...stages.map((s) => `- \`${s.stage}\` (${s.command}): ${s.summary}`),
      "",
      "## 常用規範與範本查詢",
      `- \`sa-spec instructions <init|propose|analyze|commit|pdf> [--with-rules] [--json]\``,
      `- \`sa-spec rules [${availableRules.map((r) => r.name).join("|")}|all]\``,
      `- \`sa-spec templates [${availableTemplates.map((t) => t.name).join("|")}]\``
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
  const skillRaw = readTemplate(path.join("skills", "system-analysis", "SKILL.md"));
  const skillContent = stripFrontmatter(skillRaw);
  const includedRules = withRules
    ? stage.recommendedRules.map((ruleName) => ({
        name: ruleName,
        content: readTemplate(path.join("rules", `${ruleName}.md`)).trim()
      }))
    : [];

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
      steps: stage.steps,
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
    "## 目前工作區狀態",
    ...formatContextLines(context),
    "",
    `## 階段重點步驟 (${stage.stage})`,
    ...stage.steps.map((step, index) => `${index + 1}. ${step}`),
    "",
    "## 相關規範與範本",
    `- 建議規範: ${stage.recommendedRules.map((r) => `\`sa-spec rules ${r}\``).join("、") || "無"}`,
    `- 建議範本: ${stage.recommendedTemplates.map((t) => `\`sa-spec templates ${t}\``).join("、") || "無"}`,
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

function runRules(args = []) {
  const asJson = args.includes("--json");
  const listOnly = args.includes("--list");
  const showAll = args.includes("--all");
  const positional = getPositionalArgs(args);
  const target = positional[0];
  const entries = listRuleEntries();

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
      content: readTemplate(entry.path).trim()
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

  const content = readTemplate(matched.path).trim();
  if (asJson) {
    console.log(JSON.stringify({ ...matched, content }, null, 2));
    return;
  }
  console.log(content);
}

function runTemplatesList(args = []) {
  const asJson = args.includes("--json");
  const listOnly = args.includes("--list");
  const positional = getPositionalArgs(args);
  const target = positional[0];
  const entries = listTemplateEntries();

  if (listOnly || !target) {
    if (asJson) {
      console.log(JSON.stringify({ templates: entries }, null, 2));
      return;
    }
    const lines = [
      "# sa-spec templates",
      "",
      ...entries.map((entry) => `- \`${entry.name}\` (${entry.path}): ${entry.description}`),
      "",
      "使用方式: `sa-spec templates <name>` 或 `sa-spec templates <name> --json`"
    ];
    console.log(lines.join("\n"));
    return;
  }

  const normalized = target.replace(/\\/g, "/").toLowerCase();
  const matched = entries.find(
    (entry) => entry.name.toLowerCase() === normalized || entry.path.toLowerCase() === normalized
  );
  if (!matched) {
    fail(`找不到範本 "${target}"。可用範本: ${entries.map((e) => e.name).join(", ")}`);
    return;
  }

  const content = readTemplate(matched.path).trim();
  if (asJson) {
    console.log(JSON.stringify({ ...matched, content }, null, 2));
    return;
  }
  console.log(content);
}

function showHelp() {
  console.log(`sa-spec

Usage:
  sa-spec init [--full] [--lang zh-TW|en|zh-CN|ja|ko]
  sa-spec new [--id REQ-001] --name login [--branch]
  sa-spec finalize --name login [--no-merge]
  sa-spec instructions [init|propose|analyze|commit|pdf] [--with-rules] [--json]
  sa-spec rules [name|all] [--list] [--json]
  sa-spec templates [name] [--list] [--json]
  sa-spec template <system-spec|req> [options]
  sa-spec pdf <file.md|REQ-001|name> [--split] [--output out.pdf]
  sa-spec pdf --all [--split]
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
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
  console.log(pkg.version);
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

main();
