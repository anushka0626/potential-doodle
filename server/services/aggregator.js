import { getFile, hasFile, readJsonFile } from "./heuristics.js";

const DOC_FILES = ["README.md", "CONTRIBUTING.md", "DEVELOPERS.md"];
const NATIVE_DOC_FILES = [
  "doc/README.md",
  "doc/DEVELOPMENT.md",
  "doc/Development.md",
  "doc/BUILD.md",
  "doc/Build.md",
  "docs/README.md",
  "docs/development.md",
  "frontend/README.md",
  "frontend/appflowy_flutter/README.md"
];
const ENV_TEMPLATE_FILES = [
  ".env.example",
  ".env.template",
  "docker/.env.example",
  "docker/.env.template",
  "supabase/.env.example",
  "supabase/.env.template"
];
const COMPOSE_FILES = [
  "docker-compose.yml",
  "docker-compose.yaml",
  "docker/docker-compose.yml",
  "docker/docker-compose.yaml"
];
const LOCK_FILES = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml"];
const FLUTTER_FILES = ["pubspec.yaml", "frontend/appflowy_flutter/pubspec.yaml"];
const RUST_FILES = ["Cargo.toml", "frontend/rust-lib/Cargo.toml"];

const REPOSITORY_KIND_LABELS = {
  application: "Application / Service",
  library: "Library / Package",
  monorepo: "Monorepo / Platform",
  native: "Native / Cross-platform App",
  documentation: "Documentation",
  unknown: "Unknown"
};

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function hasAnyFile(files, paths) {
  return paths.some((path) => hasFile(files, path));
}

function foundFiles(files, paths) {
  return paths.filter((path) => hasFile(files, path));
}

function fileLabel(file) {
  return file.sourcePath || file.path;
}

function packageManagers(files) {
  return [
    hasFile(files, "package-lock.json") && "npm",
    hasFile(files, "yarn.lock") && "yarn",
    hasFile(files, "pnpm-lock.yaml") && "pnpm"
  ].filter(Boolean);
}

function detectMonorepo(files, repository, packageJson) {
  const rootFolders = new Set(repository?.rootFolders || []);
  const workspaceFolders = ["apps", "packages", "services", "examples"].filter((folder) => rootFolders.has(folder));
  const indicators = [
    hasFile(files, "pnpm-workspace.yaml") && "pnpm workspace",
    (hasFile(files, "turbo.json") || hasFile(files, "turbo.jsonc")) && "Turborepo",
    packageJson?.workspaces && "package workspaces",
    workspaceFolders.length >= 2 && `folders: ${workspaceFolders.join(", ")}`
  ].filter(Boolean);

  return {
    isMonorepo: indicators.length > 0,
    indicators,
    workspaceFolders
  };
}

function detectRepositoryKind(files, repository, packageJson, agents) {
  const monorepo = detectMonorepo(files, repository, packageJson);
  const readme = getFile(files, "README.md").toLowerCase();
  const scripts = packageJson?.scripts || {};
  const keywords = (packageJson?.keywords || []).map((keyword) => String(keyword).toLowerCase());
  const packageName = packageJson?.name?.replace(/^@[^/]+\//, "").toLowerCase();
  const hasEnvTemplate = hasAnyFile(files, ENV_TEMPLATE_FILES);
  const hasCompose = hasAnyFile(files, COMPOSE_FILES);
  const hasFlutter = hasAnyFile(files, FLUTTER_FILES);
  const hasRust = hasAnyFile(files, RUST_FILES);
  const rootFolders = new Set(repository?.rootFolders || []);

  const librarySignals = [
    packageJson?.main && "package entrypoint",
    packageJson?.exports && "package exports",
    packageJson?.types && "type declarations",
    packageJson?.files && "published package files",
    packageJson?.bin && "CLI package",
    packageName && readme.includes(`npm install ${packageName}`) && "README install command for package",
    readme.includes("module available through the npm registry") && "npm registry module language",
    keywords.some((keyword) => /library|framework|middleware|module|plugin|sdk|client/.test(keyword)) && "library-style keywords"
  ].filter(Boolean);

  const applicationSignals = [
    scripts.dev && "dev script",
    scripts.start && "start script",
    hasEnvTemplate && "env template",
    hasCompose && "Docker Compose",
    agents.infrastructure.databases.length && "database dependency",
    agents.dependency.stack?.some((item) => /fastapi|django|flask/i.test(item)) && "Python web framework",
    hasFile(files, "main.py") && "Python application entrypoint",
    rootFolders.has("app") && "app folder"
  ].filter(Boolean);
  const hasRuntimeApplicationSignals = Boolean(scripts.dev || scripts.start || hasCompose || agents.infrastructure.databases.length);
  const nativeSignals = [
    hasFlutter && "Flutter/Dart manifest",
    hasRust && "Rust Cargo manifest",
    hasFile(files, "codemagic.yaml") && "Codemagic mobile CI",
    hasFile(files, "install.sh") && "install script",
    rootFolders.has("frontend") && "frontend folder",
    rootFolders.has("appflowy") && "app folder"
  ].filter(Boolean);

  if (monorepo.isMonorepo) {
    return {
      kind: "monorepo",
      kindLabel: REPOSITORY_KIND_LABELS.monorepo,
      signals: monorepo.indicators
    };
  }

  if (nativeSignals.length) {
    return {
      kind: "native",
      kindLabel: REPOSITORY_KIND_LABELS.native,
      signals: nativeSignals
    };
  }

  if (!packageJson && hasFile(files, "README.md") && !hasAnyFile(files, ["requirements.txt", "pyproject.toml", ...FLUTTER_FILES, ...RUST_FILES])) {
    return {
      kind: "documentation",
      kindLabel: REPOSITORY_KIND_LABELS.documentation,
      signals: ["README-focused repository"]
    };
  }

  if (librarySignals.length >= 2 && !hasRuntimeApplicationSignals) {
    return {
      kind: "library",
      kindLabel: REPOSITORY_KIND_LABELS.library,
      signals: librarySignals
    };
  }

  if (librarySignals.length && applicationSignals.length <= 1) {
    return {
      kind: "library",
      kindLabel: REPOSITORY_KIND_LABELS.library,
      signals: librarySignals
    };
  }

  if (applicationSignals.length) {
    return {
      kind: "application",
      kindLabel: REPOSITORY_KIND_LABELS.application,
      signals: applicationSignals
    };
  }

  if (librarySignals.length) {
    return {
      kind: "library",
      kindLabel: REPOSITORY_KIND_LABELS.library,
      signals: librarySignals
    };
  }

  return {
    kind: "unknown",
    kindLabel: REPOSITORY_KIND_LABELS.unknown,
    signals: []
  };
}

function addFactor(factors, label, impact, detail = "") {
  factors.push({
    label,
    impact,
    detail,
    sentiment: impact > 0 ? "positive" : impact < 0 ? "negative" : "neutral"
  });
}

function buildFileCoverage(fileSummary, files, agents, repositoryKind) {
  const found = fileSummary.filter((file) => file.found);
  const missing = fileSummary.filter((file) => !file.found);
  const isLibrary = repositoryKind.kind === "library";
  const isMonorepo = repositoryKind.kind === "monorepo";
  const isNative = repositoryKind.kind === "native";
  const hasDependencyManifest = hasAnyFile(files, ["package.json", "requirements.txt", "pyproject.toml", ...FLUTTER_FILES, ...RUST_FILES]);
  const hasLockfile = hasAnyFile(files, LOCK_FILES);
  const hasContributorDocs = hasAnyFile(files, ["CONTRIBUTING.md", "DEVELOPERS.md"]);
  const readmeMentionsContribution = /contribut/i.test(getFile(files, "README.md"));
  const hasEnvNeed = !isLibrary && (agents.environment.envVariables.length || agents.environment.missingSecrets.length);
  const hasServiceNeed = !isLibrary && (agents.infrastructure.services.length || agents.infrastructure.databases.length);

  const relevantMissing = missing.filter((file) => {
    const path = file.path;

    if (path === "README.md") return true;
    if (path === "package.json") return !hasAnyFile(files, ["requirements.txt", "pyproject.toml", ...FLUTTER_FILES, ...RUST_FILES]);
    if (["requirements.txt", "pyproject.toml"].includes(path)) return !hasDependencyManifest;
    if ([...FLUTTER_FILES, ...RUST_FILES].includes(path)) return isNative && !hasAnyFile(files, [...FLUTTER_FILES, ...RUST_FILES]);
    if (["CONTRIBUTING.md", "DEVELOPERS.md"].includes(path)) {
      return (isLibrary || isMonorepo || isNative) && !hasContributorDocs && !(isLibrary && readmeMentionsContribution);
    }
    if (LOCK_FILES.includes(path)) return hasFile(files, "package.json") && !hasLockfile && !isLibrary;
    if (ENV_TEMPLATE_FILES.includes(path)) return hasEnvNeed && [".env.example", ".env.template", "docker/.env.example"].includes(path);
    if (COMPOSE_FILES.includes(path)) return hasServiceNeed && ["docker-compose.yml", "docker-compose.yaml", "docker/docker-compose.yml"].includes(path);
    if (path === "Makefile") return isMonorepo && !agents.onboarding.runCommands.some((cmd) => /make/i.test(cmd));
    if (path === "install.sh") return false;
    if (["pnpm-workspace.yaml", "turbo.json", "turbo.jsonc"].includes(path)) return isMonorepo && !hasDependencyManifest;

    return false;
  });

  const relevantMissingPaths = new Set(relevantMissing.map((file) => file.path));
  const optionalMissing = missing.filter((file) => !relevantMissingPaths.has(file.path));

  return {
    scannedCount: fileSummary.length,
    foundCount: found.length,
    relevantMissingCount: relevantMissing.length,
    optionalMissingCount: optionalMissing.length,
    found: found.map((file) => ({
      path: file.path,
      sourcePath: file.sourcePath,
      label: fileLabel(file)
    })),
    missingRelevant: relevantMissing.map((file) => ({
      path: file.path,
      sourcePath: file.sourcePath,
      label: file.path
    })),
    optionalMissing: optionalMissing.map((file) => ({
      path: file.path,
      sourcePath: file.sourcePath,
      label: file.path
    }))
  };
}

function riskPenalty(severity) {
  if (severity === "high") return 10;
  if (severity === "medium") return 7;
  return 4;
}

function buildRisks(files, repository, agents, repositoryKind) {
  const risks = [];
  const packageJson = readJsonFile(files, "package.json");
  const managers = packageManagers(files);
  const monorepo = detectMonorepo(files, repository, packageJson);
  const scripts = packageJson?.scripts || {};
  const hasEnvTemplate = hasAnyFile(files, ENV_TEMPLATE_FILES);
  const hasCompose = hasAnyFile(files, COMPOSE_FILES);
  const isLibrary = repositoryKind.kind === "library";
  const isNative = repositoryKind.kind === "native";
  const isApplicationLike = ["application", "monorepo", "native"].includes(repositoryKind.kind);

  const pushRisk = (message, severity = "medium") => {
    risks.push({ message, severity });
  };

  if (!hasFile(files, "README.md")) {
    pushRisk("No README found, so setup instructions may be tribal knowledge.", "high");
  }

  if (!hasEnvTemplate && agents.environment.missingSecrets.length) {
    pushRisk("Secrets are referenced but no env template file was found.", "high");
  }

  if (managers.length > 1) {
    pushRisk(`Multiple package managers detected: ${managers.join(", ")}.`, "medium");
  }

  if (!isLibrary && !isNative && agents.infrastructure.databases.length && !agents.onboarding.runCommands.some((cmd) => /migrate|prisma|sequelize/i.test(cmd))) {
    pushRisk("Database detected but no migration command was identified.", monorepo.isMonorepo ? "medium" : "high");
  }

  if (!isLibrary && agents.infrastructure.services.includes("Redis") && !hasCompose) {
    pushRisk("Redis detected but no Docker Compose service definition was found.", "medium");
  }

  if (isApplicationLike && !isNative && packageJson && !scripts.dev && !scripts.start && !hasFile(files, "Makefile")) {
    pushRisk("package.json does not expose an obvious dev or start script.", monorepo.isMonorepo ? "low" : "medium");
  }

  if (isLibrary && packageJson && !scripts.test) {
    pushRisk("Library/package repo does not expose an obvious test script.", "medium");
  }

  if (!agents.onboarding.runCommands.length) {
    pushRisk("No reliable setup command sequence could be generated.", "high");
  }

  if (monorepo.isMonorepo && !hasFile(files, "DEVELOPERS.md") && !hasFile(files, "CONTRIBUTING.md")) {
    pushRisk("Monorepo detected but no dedicated contributor/developer guide was found.", "medium");
  }

  if (isLibrary && !hasFile(files, "CONTRIBUTING.md") && !/contribut/i.test(getFile(files, "README.md"))) {
    pushRisk("Library/package repo has no visible contribution guidance in scanned docs.", "low");
  }

  return risks.filter((risk, index, all) => all.findIndex((item) => item.message === risk.message) === index);
}

function calculateConfidence(files, repository, agents, riskDetails, repositoryKind) {
  const packageJson = readJsonFile(files, "package.json");
  const monorepo = detectMonorepo(files, repository, packageJson);
  const scripts = packageJson?.scripts || {};
  const isLibrary = repositoryKind.kind === "library";
  const isNative = repositoryKind.kind === "native";
  const isApplicationLike = ["application", "monorepo", "native"].includes(repositoryKind.kind);
  const factors = [];
  let score = 40;

  const apply = (label, impact, detail = "") => {
    score += impact;
    addFactor(factors, label, impact, detail);
  };

  const docs = foundFiles(files, [...DOC_FILES, ...NATIVE_DOC_FILES]);
  if (hasFile(files, "README.md")) apply("README found", 6, "Primary project overview is available.");
  else apply("README missing", -12, "New contributors lose the first setup anchor.");

  if (docs.some((path) => path !== "README.md")) {
    apply("Contributor docs found", 6, docs.filter((path) => path !== "README.md").join(", "));
  } else {
    const readmeMentionsContribution = /contribut/i.test(getFile(files, "README.md"));
    apply(
      readmeMentionsContribution ? "Contribution guidance linked" : "Contributor docs missing",
      readmeMentionsContribution ? 3 : -3,
      readmeMentionsContribution
        ? "README mentions contribution guidance even without a local contributor file."
        : "No CONTRIBUTING.md or DEVELOPERS.md in the scanned paths."
    );
  }

  if (hasFile(files, "package.json") || hasFile(files, "requirements.txt") || hasFile(files, "pyproject.toml") || hasAnyFile(files, FLUTTER_FILES) || hasAnyFile(files, RUST_FILES)) {
    apply("Dependency manifest found", 8, "Repo exposes a machine-readable dependency entrypoint.");
  } else {
    apply("Dependency manifest missing", -10, "Runtime and install command detection are weaker.");
  }

  const managers = packageManagers(files);
  if (managers.length === 1) apply("Package manager is clear", 5, `${managers[0]} lockfile found.`);
  if (managers.length > 1) apply("Conflicting package managers", -7, managers.join(", "));
  if (!managers.length && hasFile(files, "package.json")) {
    apply(
      isLibrary ? "No lockfile for package repo" : "No JavaScript lockfile",
      isLibrary ? -1 : -4,
      isLibrary ? "Many published packages intentionally avoid committing lockfiles." : "Install reproducibility is less certain."
    );
  }

  if (agents.dependency.runtime) apply("Runtime detected", 5, agents.dependency.runtime);
  else apply("Runtime unclear", -7, "No runtime version signal found.");

  const envTemplates = foundFiles(files, ENV_TEMPLATE_FILES);
  if (envTemplates.length) apply("Env template found", 6, envTemplates.join(", "));
  else if (!isLibrary && (agents.environment.envVariables.length || agents.environment.missingSecrets.length)) {
    apply("Env template missing", -8, "Variables or secrets were detected but no template was scanned.");
  } else {
    apply(
      isLibrary ? "No env template expected" : "No env template needed",
      0,
      isLibrary ? "Library/package repos often have no runtime secrets." : "No strong env variable signals were detected."
    );
  }

  const composeFiles = foundFiles(files, COMPOSE_FILES);
  if (composeFiles.length) apply("Docker Compose found", 5, composeFiles.join(", "));
  else if (!isLibrary && (agents.infrastructure.services.length || agents.infrastructure.databases.length)) {
    apply("Service startup unclear", -6, "Services were detected without a Compose file in scanned paths.");
  } else if (isLibrary) {
    apply("No service orchestration expected", 0, "Library/package repos usually do not need Docker Compose.");
  }

  if (hasFile(files, "Dockerfile")) apply("Dockerfile found", 3, "Container build instructions are available.");
  if (hasFile(files, "Makefile")) apply("Makefile found", 3, "Likely project commands are centralized.");
  if (hasFile(files, "install.sh")) apply("Install script found", 4, "Project-specific install helper is available.");

  if (agents.onboarding.runCommands.length >= 2) {
    apply("Setup command path generated", 10, `${agents.onboarding.runCommands.length} command(s) identified.`);
  } else if (agents.onboarding.runCommands.length === 1) {
    apply("Partial setup command path", 6, agents.onboarding.runCommands[0]);
  } else {
    apply("Setup command path missing", -14, "RepoPilot could not identify a reliable command sequence.");
  }

  if (isLibrary) {
    apply("Library/package rubric", 5, repositoryKind.signals.join("; ") || "Package-style repository signals detected.");

    if (scripts.test) apply("Test script found", 5, "Contributors can verify changes locally.");
    else apply("Test script missing", -7, "Contributor verification path is weaker.");

    if (scripts.lint) apply("Lint script found", 2, "Code quality check is exposed in package scripts.");
  }

  if (isApplicationLike && !isNative) {
    apply("Application/platform rubric", 2, repositoryKind.kindLabel);
  }

  if (isNative) {
    apply("Native app rubric", 4, repositoryKind.signals.join("; ") || "Native/cross-platform app signals detected.");
    if (hasAnyFile(files, FLUTTER_FILES)) apply("Flutter manifest found", 3, foundFiles(files, FLUTTER_FILES).join(", "));
    if (hasAnyFile(files, RUST_FILES)) apply("Rust manifest found", 3, foundFiles(files, RUST_FILES).join(", "));
    if (docs.some((path) => NATIVE_DOC_FILES.includes(path))) apply("Nested setup docs found", 4, docs.filter((path) => NATIVE_DOC_FILES.includes(path)).slice(0, 4).join(", "));
    apply("Native app complexity", -20, "Cross-platform Flutter/Rust repos usually need SDK-specific setup outside one command.");
  }

  if (monorepo.isMonorepo) {
    const impact = monorepo.indicators.length >= 2 ? 3 : 1;
    apply("Monorepo recognized", impact, monorepo.indicators.join("; "));
    apply("Monorepo complexity", -6, "Large repos often need package-specific setup choices.");
  }

  const agentAverage =
    (agents.dependency.confidence +
      agents.environment.confidence +
      agents.infrastructure.confidence +
      agents.onboarding.confidence) /
    4;
  const agentAdjustment = Math.round((agentAverage - 50) * 0.2);
  apply("Agent confidence adjustment", agentAdjustment, `Average agent confidence: ${Math.round(agentAverage)}%.`);

  const penalty = riskDetails.reduce((total, risk) => total + riskPenalty(risk.severity), 0);
  if (penalty) apply("Risk penalty", -penalty, `${riskDetails.length} risk(s) weighted by severity.`);

  const confidenceScore = Math.max(0, Math.min(100, Math.round(score)));

  return {
    confidenceScore,
    scoreFactors: factors,
    scoreSummary:
      confidenceScore >= 80
        ? "Strong onboarding path detected."
        : confidenceScore >= 60
          ? "Usable onboarding path with a few review points."
          : confidenceScore >= 40
            ? "Partial onboarding path; manual repo knowledge still needed."
            : "High-touch onboarding; setup evidence is incomplete or scattered."
  };
}

function estimateTimeSaved(blueprint) {
  const totalRiskPenalty = blueprint.riskDetails.reduce((total, risk) => total + riskPenalty(risk.severity), 0);
  const servicePenalty = (blueprint.services.length + blueprint.databases.length) * 4;
  const monorepoPenalty = blueprint.repositoryInsights?.isMonorepo ? 18 : 0;
  const without = Math.min(150, Math.max(30, 45 + totalRiskPenalty + servicePenalty + monorepoPenalty));
  const withPilot = Math.max(5, Math.round(without * (blueprint.confidenceScore >= 75 ? 0.16 : 0.24)));

  return {
    withoutRepoPilot: `${without} minutes`,
    withRepoPilot: `${withPilot} minutes`,
    timeSaved: `${without - withPilot} minutes`
  };
}

function clampScore(score) {
  const numeric = Number(score);

  if (!Number.isFinite(numeric)) {
    return 0;
  }

  const scaled = numeric > 0 && numeric <= 1 ? numeric * 100 : numeric;
  return Math.max(0, Math.min(100, Math.round(scaled)));
}

function mergeRiskDetails(currentRisks, aiRisks = []) {
  return [...currentRisks, ...aiRisks]
    .filter((risk) => risk?.message)
    .map((risk) => ({
      message: String(risk.message),
      severity: ["low", "medium", "high"].includes(risk.severity) ? risk.severity : "medium"
    }))
    .filter((risk, index, all) => all.findIndex((item) => item.message === risk.message) === index);
}

function normalizeScoreFactors(factors = []) {
  return factors
    .filter((factor) => factor?.label)
    .map((factor) => ({
      label: String(factor.label),
      impact: Math.max(-20, Math.min(20, Math.round(Number(factor.impact) || 0))),
      detail: String(factor.detail || ""),
      sentiment: ["positive", "negative", "neutral"].includes(factor.sentiment)
        ? factor.sentiment
        : Number(factor.impact) > 0
          ? "positive"
          : Number(factor.impact) < 0
            ? "negative"
            : "neutral"
    }));
}

export function mergeAiScoringReview(blueprint, review) {
  if (!review) {
    return blueprint;
  }

  const aiScore = clampScore(review.confidenceScore);
  const finalScore = clampScore(blueprint.heuristicConfidenceScore * 0.4 + aiScore * 0.6);
  const reviewerImpact = finalScore - blueprint.heuristicConfidenceScore;
  const aiFactors = normalizeScoreFactors(review.scoreFactors).slice(0, 8);
  const riskDetails = mergeRiskDetails(blueprint.riskDetails, review.riskDetails);
  const repositoryType = review.repositoryType;
  const kind =
    repositoryType && REPOSITORY_KIND_LABELS[repositoryType] ? repositoryType : blueprint.repositoryInsights.kind;

  const merged = {
    ...blueprint,
    repositoryInsights: {
      ...blueprint.repositoryInsights,
      kind,
      kindLabel: REPOSITORY_KIND_LABELS[kind] || blueprint.repositoryInsights.kindLabel,
      aiRepositoryType: repositoryType || null
    },
    confidenceScore: finalScore,
    scoringMode: "heuristic+ai",
    aiAssessment: review,
    scoreSummary: review.scoreSummary || blueprint.scoreSummary,
    riskDetails,
    risks: riskDetails.map((risk) => risk.message),
    scoreFactors: [
      {
        label: "AI reviewer adjustment",
        impact: reviewerImpact,
        detail: `Heuristic score ${blueprint.heuristicConfidenceScore}%, AI reviewer score ${aiScore}%.`,
        sentiment: reviewerImpact > 0 ? "positive" : reviewerImpact < 0 ? "negative" : "neutral"
      },
      ...aiFactors,
      ...blueprint.scoreFactors
    ],
    agentTrace: [
      ...blueprint.agentTrace,
      {
        name: "AI Scoring Reviewer",
        mode: "ai",
        confidence: clampScore(review.confidence || aiScore),
        reasoning: review.reasoning || []
      }
    ]
  };

  merged.timeSaved = estimateTimeSaved(merged);
  return merged;
}

export function aggregateBlueprint({ repository, files, fileSummary, agents }) {
  const packageJson = readJsonFile(files, "package.json");
  const monorepoInsights = detectMonorepo(files, repository, packageJson);
  const repositoryKind = detectRepositoryKind(files, repository, packageJson, agents);
  const repositoryInsights = {
    ...monorepoInsights,
    ...repositoryKind
  };
  const riskDetails = buildRisks(files, repository, agents, repositoryKind);
  const fileCoverage = buildFileCoverage(fileSummary, files, agents, repositoryKind);
  const { confidenceScore, scoreFactors, scoreSummary } = calculateConfidence(
    files,
    repository,
    agents,
    riskDetails,
    repositoryKind
  );
  const blueprint = {
    repository,
    repositoryInsights,
    analysisMode: repository.analysisMode || "live",
    fallbackReason: repository.fallbackReason || "",
    files: fileSummary,
    fileCoverage,
    stack: unique(agents.dependency.stack),
    runtime: agents.dependency.runtime,
    packageManager: agents.dependency.packageManager,
    dependencies: unique(agents.dependency.dependencies),
    envVariables: unique(agents.environment.envVariables),
    missingSecrets: unique(agents.environment.missingSecrets),
    services: unique(agents.infrastructure.services),
    databases: unique(agents.infrastructure.databases),
    infrastructure: unique(agents.infrastructure.infrastructure),
    setupSteps: unique(agents.onboarding.setupSteps),
    runCommands: unique(agents.onboarding.runCommands),
    estimatedSetupTime: agents.onboarding.estimatedSetupTime,
    complexity: agents.onboarding.complexity || "Medium",
    risks: riskDetails.map((risk) => risk.message),
    riskDetails,
    confidenceScore,
    heuristicConfidenceScore: confidenceScore,
    scoringMode: "heuristic",
    aiAssessment: null,
    scoreFactors,
    scoreSummary,
    timeSaved: null,
    agentTrace: [
      { name: "Dependency Analyzer", ...agents.dependency },
      { name: "Environment Analyzer", ...agents.environment },
      { name: "Infrastructure Analyzer", ...agents.infrastructure },
      { name: "Onboarding Planner", ...agents.onboarding }
    ]
  };

  blueprint.timeSaved = estimateTimeSaved(blueprint);
  return blueprint;
}
