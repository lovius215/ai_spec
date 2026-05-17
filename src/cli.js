const fs = require("fs");
const os = require("os");
const path = require("path");

const cwd = process.cwd();
const rootDir = path.resolve(__dirname, "..");
const templatesDir = path.join(rootDir, "templates");

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case "install":
      installPrompts();
      return;
    case "init":
      initProject();
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
    case "install-prompts":
      installPrompts();
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

function initProject() {
  const createResults = [];

  createResults.push(ensureDir(path.join(cwd, "project")));
  createResults.push(ensureDir(path.join(cwd, "rules")));
  createResults.push(ensureFileFromTemplate("project/index.md", "project/index.md"));
  createResults.push(ensureFileFromTemplate("project/system-spec.md", "project/system-spec.md"));
  createResults.push(ensureFileFromTemplate("rules/system-spec.md", "rules/system-spec.md"));
  createResults.push(ensureFileFromTemplate("rules/estimation.md", "rules/estimation.md"));

  printResultList("init", createResults);
}

function runDoctor() {
  const requiredPaths = [
    "project/index.md",
    "project/system-spec.md",
    "rules/spec.md",
    "rules/system-spec.md",
    "rules/estimation.md",
    "rules/risk.md",
    "rules/history.md",
    "rules/review.md"
  ];

  let hasMissing = false;
  console.log("sa-spec doctor");

  for (const relativePath of requiredPaths) {
    const absolutePath = path.join(cwd, relativePath);
    const exists = fs.existsSync(absolutePath);
    const status = exists ? "OK" : "MISSING";
    console.log(`${status.padEnd(8)} ${relativePath}`);
    if (!exists) {
      hasMissing = true;
    }
  }

  if (hasMissing) {
    process.exitCode = 1;
  }
}

function showStatus() {
  const systemSpecPath = path.join(cwd, "project/system-spec.md");
  const indexPath = path.join(cwd, "project/index.md");

  console.log("sa-spec status");

  if (fs.existsSync(systemSpecPath)) {
    const content = fs.readFileSync(systemSpecPath, "utf8");
    const match = content.match(/^- 狀態：\s*(.+)$/m);
    console.log(`系統規格書狀態: ${match ? match[1].trim() : "未標示"}`);
  } else {
    console.log("系統規格書狀態: 缺少 project/system-spec.md");
  }

  if (!fs.existsSync(indexPath)) {
    console.log("需求索引: 缺少 project/index.md");
    process.exitCode = 1;
    return;
  }

  const indexContent = fs.readFileSync(indexPath, "utf8");
  const rows = parseIndexRows(indexContent);
  const counts = rows.reduce((acc, row) => {
    const status = row.status || "未標示";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  console.log(`需求總數: ${rows.length}`);

  if (rows.length === 0) {
    console.log("目前尚無需求。");
    return;
  }

  for (const [status, count] of Object.entries(counts)) {
    console.log(`- ${status}: ${count}`);
  }

  const recentRows = rows.slice(-5);
  console.log("最近需求:");
  for (const row of recentRows) {
    console.log(`- ${row.id} ${row.title} [${row.status}]`);
  }
}

function runTemplate(args) {
  const type = args[0];
  if (type === "system-spec") {
    outputTemplate("project/system-spec.md", args.slice(1));
    return;
  }

  if (type === "req") {
    createReqTemplate(args.slice(1));
    return;
  }

  fail("Usage: sa-spec template <system-spec|req> [options]");
}

function outputTemplate(templatePath, args) {
  const stdout = args.includes("--stdout");
  const outputIndex = args.indexOf("--output");
  const output = outputIndex >= 0 ? args[outputIndex + 1] : null;
  const content = readTemplate(templatePath);

  if (stdout || !output) {
    process.stdout.write(content);
    if (!content.endsWith("\n")) {
      process.stdout.write("\n");
    }
    return;
  }

  const absoluteOutput = path.resolve(cwd, output);
  fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true });
  fs.writeFileSync(absoluteOutput, content, "utf8");
  console.log(`Created ${path.relative(cwd, absoluteOutput)}`);
}

function createReqTemplate(args) {
  const id = getOption(args, "--id");
  const name = getOption(args, "--name");

  if (!id || !name) {
    fail("Usage: sa-spec template req --id REQ-001 --name login");
  }

  const slug = slugify(name);
  const reqDir = path.join(cwd, "project", `${id}-${slug}`);

  const replacements = {
    REQ_ID: id,
    REQ_NAME: name
  };

  const results = [
    ensureDir(reqDir),
    ensureFileFromTemplate("project/req/spec.md", path.join("project", `${id}-${slug}`, "spec.md"), replacements),
    ensureFileFromTemplate("project/req/risk.md", path.join("project", `${id}-${slug}`, "risk.md"), replacements),
    ensureFileFromTemplate("project/req/history.md", path.join("project", `${id}-${slug}`, "history.md"), replacements)
  ];

  printResultList("template req", results);
}

function installPrompts() {
  const homeDir = os.homedir();
  const results = [];

  results.push(...copyTemplateTree("prompts/codex", path.join(homeDir, ".codex", "prompts")));
  results.push(...copyTemplateTree("prompts/claude", path.join(homeDir, ".claude", "commands")));
  results.push(...copyTemplateTree("prompts/gemini/commands", path.join(homeDir, ".gemini", "commands")));
  results.push(...copyTemplateTree("prompts/gemini/skills", path.join(homeDir, ".gemini", "skills")));
  results.push(...installGeminiCodeAssistCommands());

  printResultList("install-prompts", results);
  console.log("");
  console.log("No VS Code extension was installed.");
  console.log("Reload native AI sidebars after install:");
  console.log("- Codex: Developer: Reload Window");
  console.log("- Claude: restart Claude sidebar or start a new session");
  console.log("- Gemini CLI: run /commands reload and /skills reload");
  console.log("- Gemini Code Assist: run Developer: Reload Window, then open Quick Pick with Cmd+I/Ctrl+I");
}

function installGeminiCodeAssistCommands() {
  const settingsPath = getVsCodeUserSettingsPath();
  const settings = readJsonFile(settingsPath);
  if (!settings) {
    return [];
  }

  const existingCommands = settings.geminicodeassist?.customCommands || settings["geminicodeassist.customCommands"] || {};
  const customCommands = {
    ...existingCommands,
    ...buildGeminiCodeAssistCommands()
  };

  settings["geminicodeassist.customCommands"] = customCommands;
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 4)}\n`, "utf8");

  return [{
    action: "create",
    target: path.relative(homeDirForDisplay(), settingsPath)
  }];
}

function getVsCodeUserSettingsPath() {
  const homeDir = os.homedir();

  if (process.env.SA_SPEC_VSCODE_SETTINGS) {
    return path.resolve(process.env.SA_SPEC_VSCODE_SETTINGS);
  }

  if (process.platform === "darwin") {
    return path.join(homeDir, "Library", "Application Support", "Code", "User", "settings.json");
  }

  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(homeDir, "AppData", "Roaming");
    return path.join(appData, "Code", "User", "settings.json");
  }

  const configHome = process.env.XDG_CONFIG_HOME || path.join(homeDir, ".config");
  return path.join(configHome, "Code", "User", "settings.json");
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, "utf8").trim();
  if (!content) {
    return {};
  }

  try {
    return JSON.parse(content);
  } catch {
    fail(`Cannot update ${filePath}; please remove comments/trailing commas or set SA_SPEC_VSCODE_SETTINGS to a JSON settings file.`);
    return null;
  }
}

function buildGeminiCodeAssistCommands() {
  const commandDir = path.join(templatesDir, "prompts", "gemini", "commands", "spec");
  const commands = {};

  for (const commandName of ["init", "propose", "apply", "review", "status"]) {
    const templatePath = path.join(commandDir, `${commandName}.toml`);
    const prompt = extractGeminiTomlPrompt(readFileIfExists(templatePath));
    if (prompt) {
      commands[`spec-${commandName}`] = prompt.replaceAll("{{args}}", "");
    }
  }

  return commands;
}

function extractGeminiTomlPrompt(content) {
  const match = content.match(/prompt\s*=\s*"""([\s\S]*?)"""/);
  return match ? match[1].trim() : "";
}

function copyTemplateTree(templateRelativeDir, targetAbsoluteDir) {
  const sourceDir = path.join(templatesDir, templateRelativeDir);
  const results = [];

  if (!fs.existsSync(sourceDir)) {
    return results;
  }

  for (const sourceFile of listFilesRecursive(sourceDir)) {
    const relativePath = path.relative(sourceDir, sourceFile);
    const targetFile = path.join(targetAbsoluteDir, relativePath);
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.copyFileSync(sourceFile, targetFile);
    results.push({
      action: "create",
      target: path.relative(homeDirForDisplay(), targetFile)
    });
  }

  return results;
}

function listFilesRecursive(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const absolutePath = path.join(dir, entry.name);
      return entry.isDirectory() ? listFilesRecursive(absolutePath) : [absolutePath];
    });
}

function homeDirForDisplay() {
  return os.homedir();
}

function ensureDir(absoluteDir) {
  if (fs.existsSync(absoluteDir)) {
    return { action: "skip", target: path.relative(cwd, absoluteDir) || "." };
  }

  fs.mkdirSync(absoluteDir, { recursive: true });
  return { action: "create", target: path.relative(cwd, absoluteDir) || "." };
}

function ensureFileFromTemplate(templateRelativePath, targetRelativePath, replacements = {}) {
  const targetAbsolutePath = path.join(cwd, targetRelativePath);
  if (fs.existsSync(targetAbsolutePath)) {
    return { action: "skip", target: targetRelativePath };
  }

  fs.mkdirSync(path.dirname(targetAbsolutePath), { recursive: true });
  const content = applyReplacements(readTemplate(templateRelativePath), replacements);
  fs.writeFileSync(targetAbsolutePath, content, "utf8");
  return { action: "create", target: targetRelativePath };
}

function readTemplate(relativePath) {
  const templatePath = path.join(templatesDir, relativePath);
  return fs.readFileSync(templatePath, "utf8");
}

function readFileIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return "";
  }

  return fs.readFileSync(filePath, "utf8");
}

function applyReplacements(content, replacements) {
  let result = content;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.split(`{{${key}}}`).join(value);
  }
  return result;
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
  if (index < 0) {
    return null;
  }
  return args[index + 1] || null;
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
    console.log(`${result.action === "create" ? "CREATED" : "SKIPPED"} ${result.target}`);
  }
}

function showHelp() {
  console.log(`sa-spec

Usage:
  sa-spec install
  sa-spec init
  sa-spec doctor
  sa-spec status
  sa-spec install-prompts
  sa-spec template system-spec [--stdout|--output <path>]
  sa-spec template req --id REQ-001 --name login
`);
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

main();
