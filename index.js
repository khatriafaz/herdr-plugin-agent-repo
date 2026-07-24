#!/usr/bin/env node

"use strict";

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SOURCE = "plugin:afaz.agent-repo-header";

function execute(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "command failed").trim();
    throw new Error(`${command} ${args.join(" ")}: ${detail}`);
  }

  return result.stdout.trim();
}

function tryExecute(command, args, options = {}) {
  try {
    return execute(command, args, options);
  } catch {
    return null;
  }
}

function parseJson(raw, label) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`invalid ${label} JSON: ${error.message}`);
  }
}

function deriveRepoMetadata(cwd, command = execute) {
  const fallbackRepo = path.basename(path.resolve(cwd)) || "shell";
  const git = (args) => command("git", ["-C", cwd, ...args]);

  let topLevel;
  try {
    topLevel = git(["rev-parse", "--show-toplevel"]);
  } catch {
    return { repo: fallbackRepo, branch: null };
  }

  let repo = path.basename(topLevel);
  try {
    const commonDir = git(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
    const absoluteCommonDir = path.isAbsolute(commonDir)
      ? commonDir
      : path.resolve(cwd, commonDir);
    if (path.basename(absoluteCommonDir) === ".git") {
      repo = path.basename(path.dirname(absoluteCommonDir));
    }
  } catch {
    // Older Git versions may not support --path-format. The top-level name is safe.
  }

  let branch;
  try {
    branch = git(["symbolic-ref", "--quiet", "--short", "HEAD"]);
  } catch {
    const sha = (() => {
      try {
        return git(["rev-parse", "--short", "HEAD"]);
      } catch {
        return null;
      }
    })();
    branch = sha ? `detached@${sha}` : null;
  }

  return { repo, branch };
}

function formatTitle(agent, metadata) {
  return [agent, metadata.repo, metadata.branch].filter(Boolean).join(" - ");
}

function herdrBinary(env = process.env) {
  return env.HERDR_BIN_PATH || "herdr";
}

function listAgents(run = execute, env = process.env) {
  const response = parseJson(run(herdrBinary(env), ["agent", "list"]), "agent list");
  return response.result?.agents || [];
}

function getPane(paneId, run = execute, env = process.env) {
  const response = parseJson(
    run(herdrBinary(env), ["pane", "get", paneId]),
    `pane ${paneId}`,
  );
  return response.result?.pane || null;
}

function reportTitle(pane, metadata, run = execute, env = process.env) {
  const title = formatTitle(pane.agent, metadata);
  const args = [
    "pane",
    "report-metadata",
    pane.pane_id,
    "--source",
    SOURCE,
    "--agent",
    pane.agent,
    "--title",
    title,
    "--token",
    `repo=${metadata.repo}`,
    "--token",
    `header=${title}`,
  ];

  if (metadata.branch) {
    args.push("--token", `branch=${metadata.branch}`);
  } else {
    args.push("--clear-token", "branch");
  }

  run(herdrBinary(env), args);
  return title;
}

function syncPane(paneId, dependencies = {}) {
  const run = dependencies.execute || execute;
  const env = dependencies.env || process.env;
  const pane = getPane(paneId, run, env);
  if (!pane?.agent) return null;

  const cwd = pane.foreground_cwd || pane.cwd;
  if (!cwd) return null;

  const metadata = deriveRepoMetadata(cwd, run);
  return reportTitle(pane, metadata, run, env);
}

function syncAgents(workspaceId, dependencies = {}) {
  const run = dependencies.execute || execute;
  const env = dependencies.env || process.env;
  const agents = listAgents(run, env).filter(
    (agent) => !workspaceId || agent.workspace_id === workspaceId,
  );

  const titles = [];
  for (const agent of agents) {
    try {
      const title = syncPane(agent.pane_id, { execute: run, env });
      if (title) titles.push(title);
    } catch (error) {
      process.stderr.write(`agent-repo-header: ${error.message}\n`);
    }
  }
  return titles;
}

function eventTarget(rawEvent) {
  const envelope = parseJson(rawEvent || "{}", "plugin event");
  return {
    paneId: envelope.data?.pane_id || envelope.data?.pane?.pane_id || null,
    workspaceId:
      envelope.data?.workspace_id ||
      envelope.data?.workspace?.workspace_id ||
      null,
  };
}

function contextWorkspace(rawContext) {
  const context = parseJson(rawContext || "{}", "plugin context");
  return context.workspace_id || context.workspace?.workspace_id || null;
}

function main(argv = process.argv.slice(2), env = process.env) {
  const mode = argv[0] || "all";

  if (mode === "event") {
    const target = eventTarget(env.HERDR_PLUGIN_EVENT_JSON);
    if (target.paneId) {
      syncPane(target.paneId, { env });
    } else {
      syncAgents(target.workspaceId, { env });
    }
    return;
  }

  if (mode === "context") {
    syncAgents(contextWorkspace(env.HERDR_PLUGIN_CONTEXT_JSON), { env });
    return;
  }

  syncAgents(null, { env });
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`agent-repo-header: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  SOURCE,
  contextWorkspace,
  deriveRepoMetadata,
  eventTarget,
  formatTitle,
  main,
  reportTitle,
  syncAgents,
  syncPane,
};
