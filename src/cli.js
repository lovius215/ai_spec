const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

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
    ensureDir("skills"),
    ensureDir(path.join("skills", "system-analysis")),
    ensureDir("project"),
    ensureFileFromTemplate("AGENTS.md", "AGENTS.md", replacements),
    ensureFileFromTemplate("readme.md", "readme.md", replacements),
    ensureFileFromTemplate(path.join("skills", "system-analysis", "SKILL.md"), path.join("skills", "system-analysis", "SKILL.md"), replacements),
    ensureFileFromTemplate(path.join("project", "index.md"), path.join("project", "index.md"), replacements),
    ensureFileFromTemplate(path.join("project", "system-spec.md"), path.join("project", "system-spec.md"), replacements)
  ];

  if (includeRules) {
    results.push(ensureDir("rules"));
    for (const file of listFilesRecursive(path.join(templatesDir, "rules"))) {
      const relativePath = path.relative(templatesDir, file);
      results.push(ensureFileFromTemplate(relativePath, relativePath, replacements));
    }
  }

  printResultList("init", results);
  console.log(`專案規格主要語言已設定為: ${langConfig.label}`);
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

function runDoctor() {
  return checkRequiredPaths("sa-spec doctor");
}

function checkRequiredPaths(heading) {
  const requiredPaths = [
    "AGENTS.md",
    path.join("skills", "system-analysis", "SKILL.md"),
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
  console.log("");
  showStatus(false);
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
    }

    const reqDir = path.join("project", slug);
    const umlDir = path.join(reqDir, "uml");
    const replacements = { REQ_ID: "{{REQ_ID}}", REQ_NAME: name };
    const results = [
      ensureDir(reqDir),
      ensureDir(umlDir),
      ensureFileFromTemplate(path.join("project", "req", "srs.md"), path.join(reqDir, "srs.md"), replacements),
      ensureFileFromTemplate(path.join("project", "req", "uml", "main.puml"), path.join(umlDir, "main.puml"), replacements),
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
    ensureFileFromTemplate(path.join("project", "req", "openapi.yaml"), path.join(reqDir, "openapi.yaml"), replacements),
    ensureFileFromTemplate(path.join("project", "req", "db-schema.md"), path.join(reqDir, "db-schema.md"), replacements),
    ensureFileFromTemplate(path.join("project", "req", "handoff.md"), path.join(reqDir, "handoff.md"), replacements),
    ensureFileFromTemplate(path.join("project", "req", "history.md"), path.join(reqDir, "history.md"), replacements),
    ensureIndexRow(id, name)
  ];

  printResultList(label, results);
}

function finalizeReq(args) {
  const name = getOption(args, "--name") || getOption(args, "--draft") || args[0];
  if (!name) {
    fail("Usage: sa-spec finalize --name <name-or-slug>");
    return;
  }

  const slug = slugify(name);
  const projectDir = path.join(cwd, "project");
  let draftRelDir = path.join("project", slug);
  let draftAbsDir = path.join(cwd, draftRelDir);

  if (!fs.existsSync(draftAbsDir)) {
    const altRelDir = path.join("project", `draft-${slug}`);
    if (fs.existsSync(path.join(cwd, altRelDir))) {
      draftRelDir = altRelDir;
      draftAbsDir = path.join(cwd, altRelDir);
    } else {
      fail(`找不到草稿需求目錄: ${draftRelDir}`);
      return;
    }
  }

  // 掃描既有最大 REQ 編號
  let maxIdNum = 0;
  if (fs.existsSync(projectDir)) {
    const entries = fs.readdirSync(projectDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith("REQ-")) {
        const m = entry.name.match(/^REQ-(\d+)/i);
        if (m) {
          const num = parseInt(m[1], 10);
          if (num > maxIdNum) {
            maxIdNum = num;
          }
        }
      }
    }
  }

  const nextIdNum = maxIdNum + 1;
  const nextId = `REQ-${String(nextIdNum).padStart(3, "0")}`;
  const finalDirName = `${nextId}-${slug}`;
  const finalRelDir = path.join("project", finalDirName);
  const finalAbsDir = path.join(cwd, finalRelDir);

  if (fs.existsSync(finalAbsDir)) {
    fail(`目標目錄 ${finalRelDir} 已存在，請確認序號或目錄名稱。`);
    return;
  }

  // 重命名目錄 (優先嘗試 git mv)
  const gitMv = spawnSync("git", ["mv", draftRelDir, finalRelDir], { cwd, encoding: "utf8" });
  if (gitMv.status === 0) {
    console.log(`[Git] 已將目錄重命名為: ${finalRelDir}`);
  } else {
    fs.renameSync(draftAbsDir, finalAbsDir);
    console.log(`已將目錄重命名為: ${finalRelDir}`);
  }

  // 替換目錄內檔案的 {{REQ_ID}} 佔位符
  const files = listFilesRecursive(finalAbsDir);
  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      if (content.includes("{{REQ_ID}}")) {
        const updated = content.split("{{REQ_ID}}").join(nextId);
        fs.writeFileSync(filePath, updated, "utf8");
      }
    } catch (_) {
      // 略過無法以文字讀取之檔案
    }
  }

  // 自動重新整理 index.md
  reindexProject();

  console.log(`\n 需求已成功定號歸檔為: ${nextId} (${finalDirName})`);
  console.log(`建議接下來執行：`);
  console.log(`  git add project/`);
  console.log(`  git commit -m "docs(${nextId}): ${name} - 規格確認歸檔"`);
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
  const langConfig = detectProjectLanguage();
  console.log(`專案目前語言: ${langConfig.label}（依現有語言升級，不變更設定）`);
  const results = [];

  results.push(ensureDir("skills"));
  results.push(ensureDir(path.join("skills", "system-analysis")));

  results.push(updateFileFromTemplate("AGENTS.md", "AGENTS.md", dryRun));
  results.push(
    updateFileFromTemplate(
      path.join("skills", "system-analysis", "SKILL.md"),
      path.join("skills", "system-analysis", "SKILL.md"),
      dryRun
    )
  );

  const rulesTargetDir = path.join(cwd, "rules");
  if (fs.existsSync(rulesTargetDir)) {
    const templateRulesDir = path.join(templatesDir, "rules");
    for (const file of listFilesRecursive(templateRulesDir)) {
      const relativePath = path.relative(templatesDir, file);
      results.push(updateFileFromTemplate(relativePath, relativePath, dryRun));
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
          const content = fs.readFileSync(handoffAbsPath, "utf8");
          if (content.includes("uml.puml")) {
            if (!dryRun) {
              fs.writeFileSync(handoffAbsPath, content.replace(/uml\.puml/g, "uml/"), "utf8");
            }
            results.push({
              action: "update",
              target: handoffRelPath,
              message: "更新來源參照 uml.puml -> uml/"
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
        : result.action === "warn"
        ? "WARNING"
        : "SKIPPED";
    console.log(`${action} ${result.target}${result.message ? ` - ${result.message}` : ""}`);
  }
}

function showHelp() {
  console.log(`sa-spec

Usage:
  sa-spec init [--full] [--lang zh-TW|en|zh-CN|ja|ko]
  sa-spec new [--id REQ-001] --name login [--branch]
  sa-spec finalize --name login
  sa-spec reindex
  sa-spec check
  sa-spec upgrade [--dry-run]
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
