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

function pushBranchToRemote(cwd, remote, branch) {
  if (!remote || !branch) return false;
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

function scanTreeDirsForMaxReqId(cwd, ref, currentMax) {
  let maxIdNum = currentMax;
  const lsRes = spawnSync("git", ["ls-tree", "-d", "--name-only", ref, "project/"], { cwd, encoding: "utf8" });
  if (lsRes.status === 0 && lsRes.stdout) {
    for (const line of lsRes.stdout.split("\n")) {
      const base = path.basename(line.trim());
      if (base.startsWith("REQ-")) {
        const m = base.match(/^REQ-(\d+)/i);
        if (m) {
          const num = parseInt(m[1], 10);
          if (num > maxIdNum) maxIdNum = num;
        }
      }
    }
  }
  return maxIdNum;
}

function getLatestMaxReqId(cwd, projectDir, mainBranch, remoteName = "origin") {
  let maxIdNum = 0;

  if (fs.existsSync(projectDir)) {
    for (const entry of fs.readdirSync(projectDir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith("REQ-")) {
        const m = entry.name.match(/^REQ-(\d+)/i);
        if (m) {
          const num = parseInt(m[1], 10);
          if (num > maxIdNum) maxIdNum = num;
        }
      }
    }
  }

  if (mainBranch) {
    maxIdNum = scanTreeDirsForMaxReqId(cwd, mainBranch, maxIdNum);
    if (remoteName) {
      maxIdNum = scanTreeDirsForMaxReqId(cwd, `${remoteName}/${mainBranch}`, maxIdNum);
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
  const prefix = `${reqId.toUpperCase()}-`;
  return lsRes.stdout.split("\n").some((line) => {
    const base = path.basename(line.trim()).toUpperCase();
    return base === reqId.toUpperCase() || base.startsWith(prefix);
  });
}

module.exports = {
  isGitWorkingTree,
  ensureGitRepository,
  getDefaultRemote,
  fetchRemote,
  pushBranchToRemote,
  detectMainBranch,
  getCurrentBranch,
  getLatestMaxReqId,
  remoteBranchHasReqId
};
