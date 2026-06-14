function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function comment(os, text = "") {
  if (!text) return "";
  return os === "windows" ? `REM ${text}` : `# ${text}`;
}

function normalizeCommand(command) {
  return String(command || "").trim();
}

function envCopyParts(command) {
  const match = normalizeCommand(command).match(/^(copy|cp)\s+(.+?)\s+(.+)$/i);

  if (!match) return null;

  const [, , source, target] = match;
  if (!/\.env\.(example|template)$/i.test(source)) return null;

  return { source, target };
}

function translateCommand(command, os) {
  const normalized = cleanCommand(command);
  const envCopy = envCopyParts(normalized);

  if (envCopy) {
    return os === "windows"
      ? `copy ${envCopy.source} ${envCopy.target}`
      : `cp ${envCopy.source} ${envCopy.target}`;
  }

  if (/^(?:\.?venv|venv)\\Scripts\\activate$/i.test(normalized)) {
    const envName = normalized.split("\\")[0];
    return os === "windows" ? `${envName}\\Scripts\\activate` : `source ${envName}/bin/activate`;
  }

  if (/^source\s+(\.?venv|venv)\/bin\/activate$/i.test(normalized)) {
    const [, envName] = normalized.match(/^source\s+(\.?venv|venv)\/bin\/activate$/i);
    return os === "windows" ? `${envName}\\Scripts\\activate` : `source ${envName}/bin/activate`;
  }

  return normalized.replace(/^copy\s+/i, os === "windows" ? "copy " : "cp ");
}

function commandLike(value) {
  return /^(?:python|py|pip|uv|poetry|pipenv|conda|npm|pnpm|yarn|bun|docker|make|cargo|flutter|ollama|uvicorn|pytest|copy|cp|source|\.?venv\\Scripts\\activate|sh|bash)\b/i.test(
    normalizeCommand(value)
  );
}

function cleanCommand(value) {
  return normalizeCommand(value)
    .replace(/^["'`]|["'`]$/g, "")
    .replace(/\s+\((?:windows|mac\/linux|macos\/linux|linux|mac)\)$/i, "")
    .replace(/\s+#.*$/g, "")
    .replace(/[.;]\s*$/g, "");
}

function noteForSkippedCommand(command) {
  const normalized = normalizeCommand(command);

  if (/^git clone\b/i.test(normalized) || /clone the repository/i.test(normalized)) {
    return "Clone the repository locally before running this script.";
  }

  if (/^cd\b/i.test(normalized) || /navigate to .*director/i.test(normalized)) {
    return "Run this script from the repository root.";
  }

  return normalized;
}

function normalizeActionCommand(command, os) {
  const cleaned = cleanCommand(command);

  if (!cleaned) return null;
  if (/^(?:git clone\b|cd\b)/i.test(cleaned) || /<repository-url>|<repo/i.test(cleaned)) {
    return { note: noteForSkippedCommand(cleaned) };
  }

  if (/^ollama serve\b/i.test(cleaned)) {
    return { note: "Start Ollama in a separate terminal before running the app: ollama serve" };
  }

  if (/^(?:\.?venv|venv)\\Scripts\\activate$/i.test(cleaned) || /^source\s+(\.?venv|venv)\/bin\/activate$/i.test(cleaned)) {
    return { command: translateCommand(cleaned, os), phase: "setup" };
  }

  const translated = translateCommand(cleaned, os);
  const phase = /^(?:uvicorn|npm run dev|npm start|pnpm run dev|yarn dev|bun run dev|python main\.py|python app\.py)\b/i.test(cleaned)
    ? "run"
    : "setup";

  return { command: translated, phase };
}

function extractCommandFromStep(step, os) {
  const normalized = normalizeCommand(step);
  const lower = normalized.toLowerCase();

  if (!normalized) return null;
  if (/clone the repository|git clone|navigate to .*director|cd\s+<|cd\s+ai[_-]?innovation/i.test(normalized)) {
    return { note: noteForSkippedCommand(normalized) };
  }

  if (/activate .*virtual environment|activate .*venv/i.test(normalized)) {
    const envName = /\.venv/i.test(normalized) ? ".venv" : "venv";
    return { command: os === "windows" ? `${envName}\\Scripts\\activate` : `source ${envName}/bin/activate` };
  }

  if (/ollama serve/i.test(normalized) || (/start/i.test(lower) && /ollama/i.test(lower))) {
    return { note: "Start Ollama in a separate terminal before running the app: ollama serve" };
  }

  if (/download|install/.test(lower) && /ollama/.test(lower) && !/ollama pull/i.test(normalized)) {
    return { note: normalized };
  }

  const backtick = normalized.match(/`([^`]+)`/);
  if (backtick && commandLike(backtick[1])) {
    return normalizeActionCommand(backtick[1], os);
  }

  const colonCommand = normalized.includes(":") ? normalized.split(":").slice(1).join(":").trim() : "";
  if (colonCommand && commandLike(colonCommand)) {
    return normalizeActionCommand(colonCommand, os);
  }

  if (commandLike(normalized)) {
    return normalizeActionCommand(normalized, os);
  }

  return { note: normalized };
}

function commandRank(command) {
  if (/^copy\s+|^cp\s+/i.test(command)) return 5;
  if (/^python\s+-m\s+venv|^py\s+-m\s+venv/i.test(command)) return 10;
  if (/^(?:\.?venv|venv)\\Scripts\\activate$|^source\s+(\.?venv|venv)\/bin\/activate$/i.test(command)) return 20;
  if (/^(?:pip|uv|poetry|pipenv|conda)\b/i.test(command)) return 30;
  if (/^(?:npm|pnpm|yarn|bun)\s+(?:install|i)\b/i.test(command)) return 35;
  if (/^ollama pull\b/i.test(command)) return 40;
  if (/^docker compose\b/i.test(command)) return 45;
  return 50;
}

function dedupeCommands(commands) {
  return unique(commands.map(cleanCommand)).sort((a, b) => commandRank(a) - commandRank(b));
}

function filterManualNotes(notes, setupCommands, runCommands) {
  const hasVenv = setupCommands.some((command) => /^python\s+-m\s+venv|^py\s+-m\s+venv/i.test(command));
  const hasInstall = setupCommands.some((command) => /^(?:pip|uv|poetry|pipenv|conda)\b|^(?:npm|pnpm|yarn|bun)\s+(?:install|i)\b/i.test(command));
  const hasOllamaPull = setupCommands.some((command) => /^ollama pull\b/i.test(command));
  const hasRunCommand = runCommands.length > 0;

  return unique(notes).filter((note) => {
    if (hasVenv && /create .*virtual environment/i.test(note)) return false;
    if (hasInstall && /install dependencies|requirements\.txt/i.test(note)) return false;
    if (hasOllamaPull && /pull .*qwen|ollama.*pull/i.test(note)) return false;
    if (hasRunCommand && /run .*backend|run .*app|using uvicorn/i.test(note)) return false;
    return true;
  });
}

function commandWarnings(command, blueprint, os) {
  const warnings = [];
  const normalized = normalizeCommand(command).toLowerCase();

  if (normalized.includes("docker compose")) {
    warnings.push("Warning: Docker must be installed and running before this command.");
  }

  if (/(migrate|prisma|sequelize|knex|typeorm)/i.test(command)) {
    warnings.push("Warning: migration commands can change database state. Review env values first.");
  }

  if (blueprint.databases?.length && normalized.includes("docker compose")) {
    warnings.push(`Database services detected: ${blueprint.databases.join(", ")}. Check ports, volumes, and migrations after startup.`);
  }

  return warnings.map((warning) => comment(os, warning));
}

function topWarnings(blueprint) {
  const warnings = [];
  const usesOllama =
    [...(blueprint.services || []), ...(blueprint.infrastructure || []), ...(blueprint.dependencies || [])].some((item) =>
      /ollama/i.test(item)
    );

  if (blueprint.missingSecrets?.length) {
    warnings.push(`Fill required secret values before starting: ${blueprint.missingSecrets.join(", ")}.`);
  }

  if (blueprint.databases?.length) {
    warnings.push(`Database detected: ${blueprint.databases.join(", ")}. Confirm migrations/seed steps in project docs.`);
  }

  if (blueprint.services?.length) {
    warnings.push(`External/local services detected: ${blueprint.services.join(", ")}.`);
  }

  if (usesOllama) {
    warnings.push("Ollama must be installed, the required model must be pulled, and the Ollama server should be running before app startup.");
  }

  if (blueprint.complexity === "High") {
    warnings.push("High-complexity onboarding: review the README/contributor docs before running every command.");
  }

  return unique(warnings);
}

function scriptHeader(blueprint, os) {
  const lines = [];

  if (os === "windows") {
    lines.push("@echo off");
    lines.push("REM RepoPilot generated setup script");
  } else {
    lines.push("#!/usr/bin/env bash");
    lines.push("set -euo pipefail");
    lines.push("");
    lines.push("# RepoPilot generated setup script");
  }

  if (blueprint.repository?.webUrl) {
    lines.push(comment(os, `Repository: ${blueprint.repository.webUrl}`));
  }

  if (blueprint.repositoryInsights?.kindLabel) {
    lines.push(comment(os, `Repository type: ${blueprint.repositoryInsights.kindLabel}`));
  }

  if (blueprint.complexity) {
    lines.push(comment(os, `Onboarding complexity: ${blueprint.complexity}`));
  }

  return lines;
}

function buildScript(blueprint, os) {
  const lines = scriptHeader(blueprint, os);
  const setupActions = (blueprint.setupSteps || []).map((step) => extractCommandFromStep(step, os)).filter(Boolean);
  const rawRunActions = (blueprint.runCommands || [])
    .flatMap((command) => String(command || "").split(/\r?\n/))
    .map((command) => normalizeActionCommand(command, os))
    .filter(Boolean);
  const actions = [...setupActions, ...rawRunActions];
  const setupCommands = dedupeCommands(actions.filter((action) => action.phase !== "run").map((action) => action.command));
  const runCommands = dedupeCommands(actions.filter((action) => action.phase === "run").map((action) => action.command));
  const manualNotes = filterManualNotes(actions.map((action) => action.note), setupCommands, runCommands);
  const allCommands = unique([...setupCommands, ...runCommands]);
  const warnings = topWarnings(blueprint);

  if (warnings.length) {
    lines.push("");
    lines.push(comment(os, "Pre-flight warnings"));
    warnings.forEach((warning) => lines.push(comment(os, warning)));
  }

  if (blueprint.missingSecrets?.length) {
    lines.push("");
    lines.push(comment(os, "Required values to fill in your local env file"));
    blueprint.missingSecrets.forEach((secret) => lines.push(comment(os, `- ${secret}`)));
  }

  lines.push("");

  if (!allCommands.length) {
    lines.push(comment(os, "RepoPilot could not identify deterministic setup commands."));
    lines.push(comment(os, "Check the README and package scripts before running manually."));
    return lines.join("\n");
  }

  if (manualNotes.length) {
    lines.push(comment(os, "Manual setup notes"));
    manualNotes.slice(0, 6).forEach((note) => lines.push(comment(os, `- ${note}`)));
    lines.push("");
  }

  if (setupCommands.length) {
    lines.push(comment(os, "Setup"));
  }

  setupCommands.forEach((command) => {
    const inlineWarnings = commandWarnings(command, blueprint, os);
    if (inlineWarnings.length) {
      lines.push("");
      lines.push(...inlineWarnings);
    }
    lines.push(translateCommand(command, os));
  });

  if (runCommands.length) {
    if (setupCommands.length) lines.push("");
    lines.push(comment(os, "Run"));
  }

  runCommands.forEach((command) => {
    if (setupCommands.includes(command)) return;

    const inlineWarnings = commandWarnings(command, blueprint, os);
    if (inlineWarnings.length) {
      lines.push("");
      lines.push(...inlineWarnings);
    }
    lines.push(translateCommand(command, os));
  });

  return lines.join("\n");
}

export function generateSetupScripts(blueprint) {
  const warnings = topWarnings(blueprint);
  const scripts = {
    windows: {
      label: "Windows",
      fileName: "setup.bat",
      content: buildScript(blueprint, "windows")
    },
    unix: {
      label: "macOS / Linux",
      fileName: "setup.sh",
      content: buildScript(blueprint, "unix")
    }
  };

  return {
    scripts,
    warnings,
    script: scripts.unix.content
  };
}

export function generateSetupScript(blueprint) {
  return generateSetupScripts(blueprint).script;
}
