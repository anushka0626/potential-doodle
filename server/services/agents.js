import { callJsonAgent } from "./openaiClient.js";
import {
  confidenceFromSignals,
  dependencyNames,
  detectFrameworks,
  detectPackageScripts,
  detectRuntime,
  detectServices,
  extractEnvVariables,
  getFile,
  hasFile,
  packageManagerFromFiles,
  pythonRequirementNames,
  readJsonFile
} from "./heuristics.js";

const dependencySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    stack: { type: "array", items: { type: "string" } },
    runtime: { type: "string" },
    packageManager: { type: "string" },
    dependencies: { type: "array", items: { type: "string" } },
    confidence: { type: "number", minimum: 0, maximum: 100 },
    reasoning: { type: "array", items: { type: "string" } }
  },
  required: ["stack", "runtime", "packageManager", "dependencies", "confidence", "reasoning"]
};

const environmentSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    envVariables: { type: "array", items: { type: "string" } },
    missingSecrets: { type: "array", items: { type: "string" } },
    confidence: { type: "number", minimum: 0, maximum: 100 },
    reasoning: { type: "array", items: { type: "string" } }
  },
  required: ["envVariables", "missingSecrets", "confidence", "reasoning"]
};

const infrastructureSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    services: { type: "array", items: { type: "string" } },
    databases: { type: "array", items: { type: "string" } },
    infrastructure: { type: "array", items: { type: "string" } },
    confidence: { type: "number", minimum: 0, maximum: 100 },
    reasoning: { type: "array", items: { type: "string" } }
  },
  required: ["services", "databases", "infrastructure", "confidence", "reasoning"]
};

const onboardingSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    setupSteps: { type: "array", items: { type: "string" } },
    runCommands: { type: "array", items: { type: "string" } },
    estimatedSetupTime: { type: "string" },
    complexity: { type: "string", enum: ["Low", "Medium", "High"] },
    confidence: { type: "number", minimum: 0, maximum: 100 },
    reasoning: { type: "array", items: { type: "string" } }
  },
  required: ["setupSteps", "runCommands", "estimatedSetupTime", "complexity", "confidence", "reasoning"]
};

const compactFiles = (files) =>
  Object.fromEntries(
    Object.entries(files)
      .filter(([, file]) => file.found)
      .map(([path, file]) => [
        path,
        {
          sourcePath: file.sourcePath || path,
          content: file.content.slice(0, 12000)
        }
      ])
  );

const AGENT_PROMPT_RULES = [
  "You are one specialized RepoPilot analysis agent.",
  "Return only the requested JSON shape.",
  "Use confidence as a whole-number percentage from 0 to 100. Never use 0-1 decimals.",
  "Base every claim on the provided files, filenames, package scripts, root folders, or explicit repository metadata.",
  "If evidence is absent, say so plainly instead of inventing commands or services.",
  "Distinguish library/package repos, deployable applications, monorepos, and native/cross-platform apps; missing package.json, env files, or Docker are not automatically bad for libraries or Flutter/Rust apps.",
  "Write reasoning as judge-facing evidence bullets: clear, specific, and useful in a live demo.",
  "Keep reasoning concise and evidence-based, with 3-7 useful bullets."
].join(" ");

function agentPayload(context) {
  return {
    repository: {
      owner: context.repository?.owner,
      repo: context.repository?.repo,
      defaultBranch: context.repository?.defaultBranch,
      rootFolders: context.repository?.rootFolders || [],
      analysisMode: context.repository?.analysisMode || "live"
    },
    files: compactFiles(context.files),
    foundFiles: context.fileSummary?.filter((file) => file.found).map((file) => file.sourcePath || file.path) || []
  };
}

export function normalizePercent(value, fallback = 50) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  const scaled = numeric > 0 && numeric <= 1 ? numeric * 100 : numeric;
  return Math.max(0, Math.min(100, Math.round(scaled)));
}

function normalizeStringArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function normalizeComplexity(value) {
  const normalized = String(value || "").toLowerCase();

  if (normalized === "low") return "Low";
  if (normalized === "medium") return "Medium";
  if (normalized === "high") return "High";
  return "Medium";
}

function normalizeAgentOutput(result) {
  return {
    ...result,
    confidence: normalizePercent(result?.confidence),
    complexity: result?.complexity ? normalizeComplexity(result.complexity) : undefined,
    reasoning: normalizeStringArray(result?.reasoning)
  };
}

const envTemplatePaths = (files) =>
  Object.keys(files).filter((path) => files[path]?.found && /\.env\.(example|template)$/i.test(path));

const hasAnyFile = (files, paths) => paths.some((path) => hasFile(files, path));

const flutterManifestPaths = (files) =>
  ["pubspec.yaml", "frontend/appflowy_flutter/pubspec.yaml"].filter((path) => hasFile(files, path));

const cargoManifestPaths = (files) =>
  ["Cargo.toml", "frontend/rust-lib/Cargo.toml"].filter((path) => hasFile(files, path));

const docsPaths = (files) =>
  Object.keys(files).filter((path) => files[path]?.found && /(doc|docs|contribut|develop|build|install|setup|readme)/i.test(path));

function readmeCommandMatches(files) {
  const readme = getFile(files, "README.md");
  const commands = [];

  [
    /python\s+-m\s+venv\s+\.?venv/gi,
    /pip\s+install\s+-r\s+requirements\.txt/gi,
    /ollama\s+pull\s+[\w:.-]+/gi,
    /ollama\s+serve/gi,
    /uvicorn\s+[\w.:-]+(?:\s+--reload)?/gi
  ].forEach((regex) => {
    commands.push(...(readme.match(regex) || []));
  });

  return [...new Set(commands.map((command) => command.trim()))];
}

function scriptCommand(packageManager, scriptName) {
  const manager = packageManager || "npm";

  if (manager === "npm") {
    return scriptName === "test" ? "npm test" : `npm run ${scriptName}`;
  }

  return `${manager} ${scriptName}`;
}

async function withAiFallback(config, fallback, options = {}) {
  if (options.useAi === false) {
    return { ...fallback(), mode: "heuristic" };
  }

  try {
    const aiResult = await callJsonAgent(config);
    return aiResult ? { ...normalizeAgentOutput(aiResult), mode: "ai" } : { ...fallback(), mode: "heuristic" };
  } catch (error) {
    const result = fallback();
    result.reasoning = [
      ...result.reasoning,
      `AI analysis unavailable, used local heuristics instead: ${error.message}`
    ];
    result.confidence = Math.max(0, result.confidence - 8);
    result.mode = "heuristic";
    return result;
  }
}

export async function runDependencyAgent(context, options = {}) {
  const { files } = context;

  return withAiFallback(
    {
      name: "dependency_agent_output",
      schema: dependencySchema,
      payload: agentPayload(context),
      system: [
        AGENT_PROMPT_RULES,
        "Role: Dependency Agent.",
        "Detect language, framework, package manager, runtime version, workspace/monorepo tooling, and key dependencies.",
        "Prefer package.json, lockfiles, workspace files, config files, Docker base images, pyproject.toml, requirements.txt, pubspec.yaml, Cargo.toml, rust-toolchain, and nested manifests as evidence.",
        "For dependencies, return the most relevant direct dependencies, not every transitive package."
      ].join(" ")
    },
    () => {
      const packageJson = readJsonFile(files, "package.json");
      const dependencies = [...new Set([...dependencyNames(packageJson), ...pythonRequirementNames(files)])];
      const stack = detectFrameworks(packageJson, files);
      const packageManager = packageManagerFromFiles(files);
      const runtime = detectRuntime(packageJson, files);
      const reasoning = [];

      if (hasFile(files, "package.json")) reasoning.push("Evidence: package.json gives the clearest dependency and script signal.");
      if (hasFile(files, "package-lock.json")) reasoning.push("Package manager signal: package-lock.json points to npm.");
      if (hasFile(files, "yarn.lock")) reasoning.push("Package manager signal: yarn.lock points to Yarn.");
      if (hasFile(files, "pnpm-lock.yaml")) reasoning.push("Package manager signal: pnpm-lock.yaml points to pnpm.");
      if (hasFile(files, "pnpm-workspace.yaml")) reasoning.push("Architecture signal: pnpm-workspace.yaml indicates a workspace or monorepo.");
      if (hasFile(files, "requirements.txt")) reasoning.push("Python signal: requirements.txt lists pip dependencies.");
      if (hasFile(files, "pyproject.toml")) reasoning.push("Python signal: pyproject.toml may define runtime and package metadata.");
      if (flutterManifestPaths(files).length) reasoning.push(`Flutter signal: found ${flutterManifestPaths(files).join(", ")}.`);
      if (cargoManifestPaths(files).length) reasoning.push(`Rust signal: found ${cargoManifestPaths(files).join(", ")}.`);
      if (hasFile(files, "turbo.json") || hasFile(files, "turbo.jsonc")) reasoning.push("Task-runner signal: Turborepo config suggests coordinated workspace commands.");
      if (hasFile(files, "install.sh")) reasoning.push("Setup signal: install.sh is available as a project-specific helper.");
      if (runtime) reasoning.push(`Runtime signal: ${runtime}.`);
      if (stack.length) reasoning.push(`Stack conclusion: ${stack.join(", ")}.`);

      return {
        stack,
        runtime,
        packageManager,
        dependencies: dependencies.slice(0, 40),
        confidence: confidenceFromSignals([
          { value: hasFile(files, "package.json") || hasFile(files, "requirements.txt") ? 18 : -10 },
          { value: packageManager ? 12 : -8 },
          { value: runtime ? 10 : -8 },
          { value: stack.length ? 8 : -6 }
        ]),
        reasoning: reasoning.length ? reasoning : ["No strong dependency files were found."]
      };
    },
    options
  );
}

export async function runEnvironmentAgent(context, options = {}) {
  const { files } = context;

  return withAiFallback(
    {
      name: "environment_agent_output",
      schema: environmentSchema,
      payload: agentPayload(context),
      system: [
        AGENT_PROMPT_RULES,
        "Role: Environment Agent.",
        "Detect environment variables, required secrets, and configuration gaps.",
        "Use .env examples/templates, README setup sections, Docker Compose env blocks, package scripts, and explicit uppercase variable references.",
        "Only mark missingSecrets for values that a contributor likely must provide manually."
      ].join(" ")
    },
    () => {
      const envPaths = envTemplatePaths(files);
      const envExample = envPaths.map((path) => getFile(files, path)).join("\n");
      const readme = getFile(files, "README.md");
      const packageJson = readJsonFile(files, "package.json");
      const envVariables = [...new Set([...extractEnvVariables(envExample), ...extractEnvVariables(readme)])];
      const missingSecrets = envVariables.filter((name) =>
        /(SECRET|TOKEN|KEY|PASSWORD|DATABASE_URL|AUTH|PRIVATE)/i.test(name)
      );
      const reasoning = [];

      if (envPaths.length) reasoning.push(`Configuration evidence: env template file(s) found at ${envPaths.join(", ")}.`);
      if (envVariables.length) reasoning.push(`Configuration signal: detected ${envVariables.length} environment variable reference(s).`);
      if (packageJson?.scripts) reasoning.push("Script review: package scripts were checked for setup/runtime configuration clues.");
      if (!envPaths.length) {
        reasoning.push("No env template was found in scanned paths; this is usually fine for libraries but riskier for deployable apps.");
      }

      return {
        envVariables,
        missingSecrets,
        confidence: confidenceFromSignals([
          { value: envPaths.length ? 22 : -16 },
          { value: envVariables.length ? 10 : -4 },
          { value: hasFile(files, "README.md") ? 6 : -4 }
        ]),
        reasoning
      };
    },
    options
  );
}

export async function runInfrastructureAgent(context, options = {}) {
  const { files } = context;

  return withAiFallback(
    {
      name: "infrastructure_agent_output",
      schema: infrastructureSchema,
      payload: agentPayload(context),
      system: [
        AGENT_PROMPT_RULES,
        "Role: Infrastructure Agent.",
        "Detect databases, caches, queues, Docker, Docker Compose, local services, containers, and external service dependencies.",
        "Do not list a service just because a package name appears once; prefer repeated evidence from compose files, README setup docs, env vars, or direct dependencies.",
        "For library/package repos, report infrastructure only if it is needed for tests or examples."
      ].join(" ")
    },
    () => {
      const packageJson = readJsonFile(files, "package.json");
      const detected = detectServices(files, packageJson);
      const reasoning = [];

      if (hasFile(files, "Dockerfile")) reasoning.push("Container evidence: Dockerfile is available for build/runtime hints.");
      if (hasAnyFile(files, ["docker-compose.yml", "docker-compose.yaml", "docker/docker-compose.yml", "docker/docker-compose.yaml"])) {
        reasoning.push("Service evidence: Docker Compose configuration is available.");
      }
      if (detected.databases.length) reasoning.push(`Database conclusion: ${detected.databases.join(", ")}.`);
      if (detected.services.length) reasoning.push(`Service conclusion: ${detected.services.join(", ")}.`);
      if (!detected.databases.length && !detected.services.length) {
        reasoning.push("No strong evidence of required external services was found in scanned files.");
      }

      return {
        ...detected,
        confidence: confidenceFromSignals([
          { value: hasAnyFile(files, ["docker-compose.yml", "docker-compose.yaml", "docker/docker-compose.yml", "docker/docker-compose.yaml"]) ? 20 : 0 },
          { value: hasFile(files, "Dockerfile") ? 12 : 0 },
          { value: detected.databases.length || detected.services.length ? 12 : -2 }
        ]),
        reasoning
      };
    },
    options
  );
}

export async function runOnboardingAgent(context, options = {}) {
  const { files } = context;

  return withAiFallback(
    {
      name: "onboarding_agent_output",
      schema: onboardingSchema,
      payload: agentPayload(context),
      system: [
        AGENT_PROMPT_RULES,
        "Role: Onboarding Agent.",
        "Generate the shortest credible setup path for a new contributor.",
        "For applications, prioritize install, env copy, service startup, migrations, and dev/start commands.",
        "For libraries/packages, prioritize install, tests, lint/build, examples, and contribution verification.",
        "For monorepos, include workspace install commands and task-runner/Makefile entrypoints; avoid pretending there is one universal dev command unless files show it.",
        "For native/cross-platform apps, include Flutter/Dart and Rust dependency/test/build steps when manifests are present, and point to source-build docs when setup is spread across documentation.",
        "Return complexity as Low, Medium, or High. Low means install plus test/build only; Medium means env/services/workspace choices; High means multiple services, migrations, or unclear monorepo setup.",
        "Commands must be concrete and runnable; if unsure, use an inspection command such as make help only when a Makefile exists."
      ].join(" ")
    },
    () => {
      const packageJson = readJsonFile(files, "package.json");
      const packageManager = packageManagerFromFiles(files);
      const scripts = detectPackageScripts(packageJson);
      const envPaths = envTemplatePaths(files);
      const flutterPaths = flutterManifestPaths(files);
      const cargoPaths = cargoManifestPaths(files);
      const docs = docsPaths(files);
      const readmeCommands = readmeCommandMatches(files);
      const hasCompose = hasAnyFile(files, ["docker-compose.yml", "docker-compose.yaml", "docker/docker-compose.yml", "docker/docker-compose.yaml"]);
      const hasWorkspace = hasFile(files, "pnpm-workspace.yaml") || hasFile(files, "turbo.json") || hasFile(files, "turbo.jsonc");
      const looksLikeLibrary = Boolean(packageJson?.main || packageJson?.exports || packageJson?.files || packageJson?.types);
      const looksLikeNativeApp = flutterPaths.length || cargoPaths.length;
      const setupSteps = [];
      const runCommands = [];
      const reasoning = [];

      if (packageManager === "npm") {
        setupSteps.push("Install Node dependencies with npm.");
        runCommands.push("npm install");
      }

      if (packageManager === "yarn") {
        setupSteps.push("Install Node dependencies with Yarn.");
        runCommands.push("yarn install");
      }

      if (packageManager === "pnpm") {
        setupSteps.push("Install Node dependencies with pnpm.");
        runCommands.push("pnpm install");
      }

      if (packageManager === "pip") {
        setupSteps.push("Create a virtual environment and install Python requirements.");
        runCommands.push("python -m venv .venv", ".venv\\Scripts\\activate", "pip install -r requirements.txt");
      }

      if (/ollama/i.test(getFile(files, "README.md")) && /qwen3:4b/i.test(getFile(files, "README.md")) && !readmeCommands.some((command) => /^ollama pull/i.test(command))) {
        setupSteps.push("Pull the local Ollama model documented by the README.");
        runCommands.push("ollama pull qwen3:4b");
      }

      readmeCommands
        .filter((command) => /^ollama pull/i.test(command))
        .forEach((command) => {
          setupSteps.push("Pull the local Ollama model documented by the README.");
          runCommands.push(command);
        });

      if (readmeCommands.some((command) => /^ollama serve/i.test(command))) {
        setupSteps.push("Start Ollama in a separate terminal before running the app.");
        runCommands.push("ollama serve");
      }

      if (flutterPaths.length) {
        setupSteps.push("Install Flutter/Dart dependencies.");
        runCommands.push(flutterPaths[0] === "pubspec.yaml" ? "flutter pub get" : `cd ${flutterPaths[0].replace(/\/pubspec\.yaml$/, "")} && flutter pub get`);
      }

      if (cargoPaths.length) {
        setupSteps.push("Build or test the Rust workspace/components.");
        runCommands.push(cargoPaths[0] === "Cargo.toml" ? "cargo test" : `cd ${cargoPaths[0].replace(/\/Cargo\.toml$/, "")} && cargo test`);
      }

      if (envPaths.length) {
        setupSteps.push(`Copy ${envPaths[0]} into a local env file and fill required values.`);
        runCommands.push(`copy ${envPaths[0]} .env`);
      }

      if (hasAnyFile(files, ["docker-compose.yml", "docker-compose.yaml"])) {
        setupSteps.push("Start supporting services with Docker Compose.");
        runCommands.push("docker compose up -d");
      } else if (hasAnyFile(files, ["docker/docker-compose.yml", "docker/docker-compose.yaml"])) {
        setupSteps.push("Start supporting services from the docker folder.");
        runCommands.push("docker compose -f docker/docker-compose.yml up -d");
      }

      if (scripts.dev) {
        setupSteps.push("Start the development server.");
        runCommands.push(`${packageManager || "npm"} run dev`);
        reasoning.push("Run path: package.json exposes a dev script.");
      } else if (scripts.start) {
        setupSteps.push("Start the application.");
        runCommands.push(`${packageManager || "npm"} start`);
        reasoning.push("Run path: package.json exposes a start script.");
      } else if (hasFile(files, "Procfile")) {
        setupSteps.push("Use the Procfile command to run the application.");
        reasoning.push("Run path: Procfile exists even though package dev/start scripts were not detected.");
      } else if (hasFile(files, "Makefile")) {
        setupSteps.push("Inspect Makefile targets for local development commands.");
        runCommands.push("make help");
        reasoning.push("Run path: Makefile is a likely command discovery entrypoint.");
      } else if (hasFile(files, "install.sh")) {
        setupSteps.push("Review the repository install script before running it.");
        runCommands.push("sh install.sh");
        reasoning.push("Setup path: install.sh exists as a project-specific helper.");
      } else {
        readmeCommands
          .filter((command) => /^uvicorn\b/i.test(command))
          .forEach((command) => {
            setupSteps.push("Run the FastAPI backend using the README command.");
            runCommands.push(command);
            reasoning.push("Run path: README includes a concrete Uvicorn command.");
          });
      }

      if (scripts.test) {
        setupSteps.push("Run the test suite to verify the local setup.");
        runCommands.push(scriptCommand(packageManager, "test"));
        reasoning.push("Verification path: package.json exposes a test script.");
      }

      if (scripts.lint) {
        setupSteps.push("Run lint checks before contributing changes.");
        runCommands.push(scriptCommand(packageManager, "lint"));
        reasoning.push("Quality path: package.json exposes a lint script.");
      }

      if (hasFile(files, "README.md")) reasoning.push("Documentation evidence: README can guide manual onboarding.");
      if (hasFile(files, "CONTRIBUTING.md")) reasoning.push("Contributor evidence: CONTRIBUTING.md is available.");
      if (hasFile(files, "DEVELOPERS.md")) reasoning.push("Developer evidence: DEVELOPERS.md is available.");
      if (docs.length > 1) reasoning.push(`Documentation evidence: additional setup/development docs found (${docs.slice(0, 4).join(", ")}).`);
      if (!runCommands.length) reasoning.push("Gap: no obvious install, test, dev, start, or task-discovery command was found.");

      const estimatedSetupTime =
        looksLikeNativeApp || runCommands.length >= 4 || hasCompose
          ? "25-45 minutes"
          : "10-20 minutes";
      const complexity =
        hasCompose || hasWorkspace || (flutterPaths.length && cargoPaths.length)
          ? "High"
          : looksLikeLibrary && !envPaths.length
            ? "Low"
            : envPaths.length || runCommands.length >= 3 || looksLikeNativeApp
            ? "Medium"
            : "Low";

      return {
        setupSteps,
        runCommands: [...new Set(runCommands)],
        estimatedSetupTime,
        complexity,
        confidence: confidenceFromSignals([
          { value: runCommands.length ? 18 : -14 },
          { value: setupSteps.length ? 12 : -8 },
          { value: hasFile(files, "README.md") ? 6 : -4 }
        ]),
        reasoning
      };
    },
    options
  );
}

export async function runAgents(context, options = {}) {
  const [dependency, environment, infrastructure, onboarding] = await Promise.all([
    runDependencyAgent(context, options),
    runEnvironmentAgent(context, options),
    runInfrastructureAgent(context, options),
    runOnboardingAgent(context, options)
  ]);

  return {
    dependency,
    environment,
    infrastructure,
    onboarding
  };
}
