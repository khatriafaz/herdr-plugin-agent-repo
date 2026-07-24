"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");

const {
  deriveRepoMetadata,
  eventTarget,
  formatTitle,
  syncPane,
} = require("../index.js");

function git(cwd, ...args) {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test("formats the requested agent - repo - branch title", () => {
  assert.equal(
    formatTitle("pi", { repo: "herdr", branch: "feature/header" }),
    "pi - herdr - feature/header",
  );
});

test("derives the original repository name for a linked worktree", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-repo-header-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const repo = path.join(root, "my-repo");
  const worktree = path.join(root, "random-worktree-folder");
  fs.mkdirSync(repo);
  git(repo, "init", "-b", "main");
  git(repo, "config", "user.email", "test@example.com");
  git(repo, "config", "user.name", "Test");
  fs.writeFileSync(path.join(repo, "README.md"), "test\n");
  git(repo, "add", "README.md");
  git(repo, "commit", "-m", "initial");
  git(repo, "worktree", "add", "-b", "feature/header", worktree);

  assert.deepEqual(deriveRepoMetadata(worktree), {
    repo: "my-repo",
    branch: "feature/header",
  });
});

test("falls back to the cwd name outside Git", () => {
  assert.deepEqual(deriveRepoMetadata("/tmp/plain-shell"), {
    repo: "plain-shell",
    branch: null,
  });
});

test("extracts pane and workspace event targets", () => {
  assert.deepEqual(
    eventTarget(
      JSON.stringify({
        event: "pane.agent_detected",
        data: { pane_id: "w2:p3", workspace_id: "w2" },
      }),
    ),
    { paneId: "w2:p3", workspaceId: "w2" },
  );
});

test("reports title and sidebar tokens for an agent pane", () => {
  const calls = [];
  const run = (command, args) => {
    calls.push([command, args]);
    if (args[0] === "pane" && args[1] === "get") {
      return JSON.stringify({
        result: {
          pane: {
            pane_id: "w1:p1",
            agent: "pi",
            cwd: "/repo",
            foreground_cwd: "/repo",
          },
        },
      });
    }
    if (command === "git" && args.includes("--show-toplevel")) return "/repo";
    if (command === "git" && args.includes("--git-common-dir")) return "/repo/.git";
    if (command === "git" && args.includes("symbolic-ref")) return "main";
    if (args[0] === "pane" && args[1] === "report-metadata") return "";
    throw new Error(`unexpected call: ${command} ${args.join(" ")}`);
  };

  assert.equal(
    syncPane("w1:p1", { execute: run, env: { HERDR_BIN_PATH: "herdr-test" } }),
    "pi - repo - main",
  );

  const report = calls.find(([, args]) => args[1] === "report-metadata");
  assert.ok(report);
  assert.deepEqual(report[0], "herdr-test");
  assert.ok(report[1].includes("pi - repo - main"));
  assert.ok(report[1].includes("repo=repo"));
  assert.ok(report[1].includes("branch=main"));
  assert.ok(report[1].includes("header=pi - repo - main"));
});
