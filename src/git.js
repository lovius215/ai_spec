const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function isGitWorkingTree(cwd) {
  const res = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd, encoding: "utf8" });
  return res.status === 0 && res.stdout.trim() === "true";
}

function ensureGitRepository(cwd) {
  const version = spawnSync("git", ["--version"], { cwd, encoding: "utf8" });
  if (version.status !== 0) {
    return {
      action: "warn",
      target: "git",
      message: "未安裝 Git，系統將繼續初始化，但後續歸檔與版本管理會受到影響。"
    };
  }

  const inside = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd, encoding: "utf8" });
  if (inside.status === 0 && inside.stdout.trim() === "true") {
    return { action: "skip", target: ".git", message: "已是 Git repository" };
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

function getDefaultRemote(cwd) {
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

function fetchRemote(cwd, remote) {
  if (!remote) return false;
  const res = spawnSync("git", ["fetch", remote], { cwd, encoding: "utf8" });
  return res.status === 0;
}

function hasHeadCommit(cwd) {
  const res = spawnSync("git", ["rev-parse", "--verify", "--quiet", "HEAD"], { cwd, encoding: "utf8" });
  return res.status === 0;
}

function pushBranchToRemote(cwd, remote, branch) {
  if (!remote || !branch) return false;
  if (!hasHeadCommit(cwd)) {
    console.log(`[Git] 目前尚無任何 commit，暫時略過推送分支 ${branch} 至 ${remote}（建立首次 commit 後即可推送）。`);
    return false;
  }
  console.log(`[Git] 偵測到遠端 (${remote})，正在將分支 ${branch} 推送至 ${remote}/${branch}...`);
  const pushRes = spawnSync("git", ["push", "-u", remote, branch], { cwd, encoding: "utf8" });
  if (pushRes.status === 0) {
    console.log(`[Git] 已成功將分支 ${branch} 推送至 ${remote}/${branch}`);
    return true;
  }
  console.warn(`[Git 警告] 推送分支 ${branch} 至 ${remote} 失敗: ${(pushRes.stderr || pushRes.stdout || "").trim()}`);
  return false;
}

function detectMainBranch(cwd) {
  for (const b of ["main", "master"]) {
    const res = spawnSync("git", ["rev-parse", "--verify", b], { cwd, encoding: "utf8" });
    if (res.status === 0) return b;
  }
  return null;
}

function getCurrentBranch(cwd) {
  const res = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd, encoding: "utf8" });
  if (res.status === 0) {
    const b = res.stdout.trim();
    return b === "HEAD" ? null : b;
  }
  return null;
}

function scanTreeDirsForMaxReqId(cwd, ref, currentMax, excludeDirName = null) {
  let maxIdNum = currentMax;
  const lsRes = spawnSync("git", ["ls-tree", "-d", "--name-only", ref, "project/"], { cwd, encoding: "utf8" });
  if (lsRes.status === 0 && lsRes.stdout) {
    for (const line of lsRes.stdout.split("\n")) {
      const base = path.basename(line.trim());
      if (excludeDirName && base === excludeDirName) continue;
      const m = base.match(/^REQ-(\d+)(?:-|$)/i);
      if (m) {
        const num = parseInt(m[1], 10);
        if (num > maxIdNum) maxIdNum = num;
      }
    }
  }
  return maxIdNum;
}

function getLatestMaxReqId(cwd, projectDir, mainBranch, remoteName = "origin", excludeDirName = null) {
  let maxIdNum = 0;

  if (fs.existsSync(projectDir) && fs.statSync(projectDir).isDirectory()) {
    for (const entry of fs.readdirSync(projectDir, { withFileTypes: true })) {
      if (excludeDirName && entry.name === excludeDirName) continue;
      if (entry.isDirectory()) {
        const m = entry.name.match(/^REQ-(\d+)(?:-|$)/i);
        if (m) {
          const num = parseInt(m[1], 10);
          if (num > maxIdNum) maxIdNum = num;
        }
      }
    }
  }

  if (mainBranch) {
    maxIdNum = scanTreeDirsForMaxReqId(cwd, mainBranch, maxIdNum, excludeDirName);
    if (remoteName) {
      maxIdNum = scanTreeDirsForMaxReqId(cwd, `${remoteName}/${mainBranch}`, maxIdNum, excludeDirName);
    }
  }

  const refScopes = ["refs/heads", ...(remoteName ? [`refs/remotes/${remoteName}`] : [])];
  const refsRes = spawnSync("git", ["for-each-ref", "--format=%(refname:short)", ...refScopes], {
    cwd,
    encoding: "utf8"
  });
  if (refsRes.status === 0 && refsRes.stdout) {
    for (const rawRef of refsRes.stdout.split("\n")) {
      const ref = rawRef.trim();
      if (!ref || (remoteName && ref === `${remoteName}/HEAD`)) continue;
      maxIdNum = scanTreeDirsForMaxReqId(cwd, ref, maxIdNum, excludeDirName);
    }
  }

  return maxIdNum;
}

function remoteBranchHasReqId(cwd, remote, mainBranch, reqId) {
  if (!remote || !mainBranch || !reqId) return false;
  fetchRemote(cwd, remote);
  const lsRes = spawnSync("git", ["ls-tree", "-d", "--name-only", `${remote}/${mainBranch}`, "project/"], {
    cwd,
    encoding: "utf8"
  });
  if (lsRes.status !== 0 || !lsRes.stdout) return false;
  const targetMatch = String(reqId).trim().match(/^REQ-(\d+)$/i);
  const targetNum = targetMatch ? parseInt(targetMatch[1], 10) : null;
  const prefix = `${reqId.toUpperCase()}-`;
  return lsRes.stdout.split("\n").some((line) => {
    const base = path.basename(line.trim());
    const upperBase = base.toUpperCase();
    if (upperBase === reqId.toUpperCase() || upperBase.startsWith(prefix)) return true;
    if (targetNum !== null) {
      const baseMatch = base.match(/^REQ-(\d+)(?:-|$)/i);
      return Boolean(baseMatch && parseInt(baseMatch[1], 10) === targetNum);
    }
    return false;
  });
}

function branchHasExactReqDir(cwd, ref, dirName) {
  if (!ref || !dirName) return false;
  const lsRes = spawnSync("git", ["ls-tree", "-d", "--name-only", ref, "project/"], {
    cwd,
    encoding: "utf8"
  });
  if (lsRes.status !== 0 || !lsRes.stdout) return false;
  const targetLower = String(dirName).trim().toLowerCase();
  return lsRes.stdout.split("\n").some((line) => path.basename(line.trim()).toLowerCase() === targetLower);
}

function mainBranchHasSameReqDir(cwd, mainBranch, remoteName, dirName) {
  if (!mainBranch || !dirName) return false;
  if (remoteName) {
    fetchRemote(cwd, remoteName);
    if (branchHasExactReqDir(cwd, `${remoteName}/${mainBranch}`, dirName)) {
      return true;
    }
  }
  return branchHasExactReqDir(cwd, mainBranch, dirName);
}

function deleteFeatureBranch(cwd, branch, remote = null) {
  if (!branch) return { localDeleted: false, remoteDeleted: false };
  let localDeleted = false;
  let remoteDeleted = false;

  const localRes = spawnSync("git", ["branch", "-d", branch], { cwd, encoding: "utf8" });
  if (localRes.status === 0) {
    localDeleted = true;
    console.log(`[Git] 已自動刪除已合併的本機分支: ${branch}`);
  } else {
    console.warn(`[Git 警告] 本機分支 ${branch} 未刪除: ${(localRes.stderr || localRes.stdout || "").trim()}`);
  }

  if (remote) {
    const remoteRef = spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/remotes/${remote}/${branch}`], {
      cwd,
      encoding: "utf8"
    });
    if (remoteRef.status === 0) {
      const delRemote = spawnSync("git", ["push", remote, "--delete", branch], { cwd, encoding: "utf8" });
      if (delRemote.status === 0) {
        remoteDeleted = true;
        console.log(`[Git] 已自動刪除遠端已合併分支: ${remote}/${branch}`);
      } else {
        console.warn(
          `[Git 警告] 遠端分支 ${remote}/${branch} 刪除略過: ${(delRemote.stderr || delRemote.stdout || "").trim()}`
        );
      }
    }
  }

  return { localDeleted, remoteDeleted };
}

const PRE_COMMIT_HOOK_MARKER = "# sa-spec managed pre-commit hook";

function resolvePreCommitHookPath(cwd) {
  const gitPathRes = spawnSync("git", ["rev-parse", "--git-path", "hooks/pre-commit"], {
    cwd,
    encoding: "utf8"
  });
  if (gitPathRes.status === 0 && gitPathRes.stdout && gitPathRes.stdout.trim()) {
    return path.resolve(cwd, gitPathRes.stdout.trim());
  }
  return path.join(cwd, ".git", "hooks", "pre-commit");
}

function getPreCommitHookStatus(cwd) {
  if (!isGitWorkingTree(cwd)) {
    return { status: "not_git", hookPath: null };
  }
  const hookPath = resolvePreCommitHookPath(cwd);
  if (!fs.existsSync(hookPath)) {
    return { status: "missing", hookPath };
  }
  if (!fs.statSync(hookPath).isFile()) {
    return { status: "conflict", hookPath };
  }
  const content = fs.readFileSync(hookPath, "utf8");
  if (content.includes(PRE_COMMIT_HOOK_MARKER)) {
    return { status: "installed", hookPath };
  }
  return { status: "custom", hookPath };
}

function installPreCommitHook(cwd, options = {}) {
  const { force = false } = options;
  if (!isGitWorkingTree(cwd)) {
    return {
      action: "skip",
      target: ".git/hooks/pre-commit",
      message: "尚未初始化 Git repository，略過安裝 pre-commit hook"
    };
  }

  const hookPath = resolvePreCommitHookPath(cwd);
  const relTarget = path.relative(cwd, hookPath) || ".git/hooks/pre-commit";
  const current = getPreCommitHookStatus(cwd);

  if (current.status === "conflict") {
    return {
      action: "warn",
      target: relTarget,
      message: "目標路徑已存在且為目錄，無法安裝 pre-commit hook"
    };
  }
  if (current.status === "custom" && !force) {
    return {
      action: "warn",
      target: relTarget,
      message: "已存在自訂 pre-commit hook，為避免覆蓋已略過（可手動加入 sa-spec check --strict 或加上 --force）"
    };
  }

  const hookScript = [
    "#!/bin/sh",
    PRE_COMMIT_HOOK_MARKER,
    "if command -v sa-spec >/dev/null 2>&1; then",
    "  sa-spec check --strict",
    "elif [ -f \"./bin/sa-spec.js\" ] && command -v node >/dev/null 2>&1; then",
    "  node \"./bin/sa-spec.js\" check --strict",
    "fi",
    ""
  ].join("\n");

  fs.mkdirSync(path.dirname(hookPath), { recursive: true });
  fs.writeFileSync(hookPath, hookScript, { encoding: "utf8", mode: 0o755 });
  try {
    fs.chmodSync(hookPath, 0o755);
  } catch (_) {}

  return {
    action: current.status === "installed" ? "update" : "create",
    target: relTarget,
    message: "已安裝 Git pre-commit hook（commit 前自動執行 sa-spec check --strict）"
  };
}

function removePreCommitHook(cwd) {
  const current = getPreCommitHookStatus(cwd);
  if (current.status === "not_git" || current.status === "missing") {
    return {
      action: "skip",
      target: ".git/hooks/pre-commit",
      message: "未偵測到可移除的 sa-spec pre-commit hook"
    };
  }
  const relTarget = path.relative(cwd, current.hookPath) || ".git/hooks/pre-commit";
  if (current.status !== "installed") {
    return {
      action: "warn",
      target: relTarget,
      message: "現有 pre-commit hook 非 sa-spec 管理，已保留未移除"
    };
  }
  fs.unlinkSync(current.hookPath);
  return {
    action: "remove",
    target: relTarget,
    message: "已移除 sa-spec pre-commit hook"
  };
}

module.exports = {
  isGitWorkingTree,
  ensureGitRepository,
  hasHeadCommit,
  getDefaultRemote,
  fetchRemote,
  pushBranchToRemote,
  detectMainBranch,
  getCurrentBranch,
  getLatestMaxReqId,
  remoteBranchHasReqId,
  mainBranchHasSameReqDir,
  deleteFeatureBranch,
  getPreCommitHookStatus,
  installPreCommitHook,
  removePreCommitHook
};
