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
    case "check":
      runCheck();
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

function initProject(args = []) {
  const includeRules = args.includes("--full");
  const results = [
    ensureGitRepository(),
    ensureDir("skills"),
    ensureDir(path.join("skills", "system-analysis")),
    ensureDir("project"),
    ensureFileFromTemplate("AGENTS.md", "AGENTS.md"),
    ensureFileFromTemplate("readme.md", "readme.md"),
    ensureFileFromTemplate(path.join("skills", "system-analysis", "SKILL.md"), path.join("skills", "system-analysis", "SKILL.md")),
    ensureFileFromTemplate(path.join("project", "index.md"), path.join("project", "index.md")),
    ensureFileFromTemplate(path.join("project", "system-spec.md"), path.join("project", "system-spec.md"))
  ];

  if (includeRules) {
    results.push(ensureDir("rules"));
    for (const file of listFilesRecursive(path.join(templatesDir, "rules"))) {
      const relativePath = path.relative(templatesDir, file);
      results.push(ensureFileFromTemplate(relativePath, relativePath));
    }
  }

  printResultList("init", results);
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

  if (!id || !name) {
    fail("Usage: sa-spec template req --id REQ-001 --name login");
    return;
  }

  const slug = slugify(name);
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
      status: parts[4]
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

function printResultList(label, results) {
  console.log(`sa-spec ${label}`);
  for (const result of results) {
    const action = result.action === "create" ? "CREATED" : result.action === "update" ? "UPDATED" : result.action === "warn" ? "WARNING" : "SKIPPED";
    console.log(`${action} ${result.target}${result.message ? ` - ${result.message}` : ""}`);
  }
}

function showHelp() {
  console.log(`sa-spec

Usage:
  sa-spec init [--full]
  sa-spec new --id REQ-001 --name login
  sa-spec check
`);
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

main();
