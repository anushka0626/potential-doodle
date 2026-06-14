export function readJsonFile(files, path) {
  const file = files[path];

  if (!file?.found || !file.content.trim()) {
    return null;
  }

  try {
    return JSON.parse(file.content);
  } catch {
    return null;
  }
}

export function hasFile(files, path) {
  return Boolean(files[path]?.found);
}

export function getFile(files, path) {
  return files[path]?.content || "";
}

export function packageManagerFromFiles(files) {
  if (
    (hasFile(files, "pubspec.yaml") || hasFile(files, "frontend/appflowy_flutter/pubspec.yaml")) &&
    (hasFile(files, "Cargo.toml") || hasFile(files, "frontend/rust-lib/Cargo.toml"))
  ) {
    return "flutter pub + cargo";
  }
  if (hasFile(files, "pnpm-lock.yaml")) return "pnpm";
  if (hasFile(files, "yarn.lock")) return "yarn";
  if (hasFile(files, "package-lock.json")) return "npm";
  if (hasFile(files, "package.json")) return "npm";
  if (hasFile(files, "requirements.txt")) return "pip";
  if (hasFile(files, "pyproject.toml")) return "pip/poetry";
  if (hasFile(files, "pubspec.yaml") || hasFile(files, "frontend/appflowy_flutter/pubspec.yaml")) return "flutter pub";
  if (hasFile(files, "Cargo.toml") || hasFile(files, "frontend/rust-lib/Cargo.toml")) return "cargo";
  return "";
}

export function detectPackageScripts(packageJson) {
  return packageJson?.scripts || {};
}

export function extractEnvVariables(text) {
  const variables = new Set();
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) continue;

    const assignment = trimmed.match(/^([A-Z0-9_]+)\s*=/i);
    if (assignment) {
      variables.add(assignment[1]);
      continue;
    }

    const inlineRefs = trimmed.match(/\b[A-Z][A-Z0-9_]{2,}\b/g);
    inlineRefs?.forEach((name) => {
      if (/(KEY|SECRET|TOKEN|URL|URI|HOST|PORT|DATABASE|REDIS|AUTH|PUBLIC|CLIENT|SERVER)/.test(name)) {
        variables.add(name);
      }
    });
  }

  return [...variables];
}

export function dependencyNames(packageJson) {
  if (!packageJson) return [];

  return [
    ...Object.keys(packageJson.dependencies || {}),
    ...Object.keys(packageJson.devDependencies || {})
  ].sort();
}

export function pythonRequirementNames(files) {
  return getFile(files, "requirements.txt")
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*/, "").trim())
    .filter(Boolean)
    .map((line) => line.split(/[<>=~!;\[]/)[0].trim())
    .filter(Boolean)
    .sort();
}

export function detectFrameworks(packageJson, files) {
  const deps = dependencyNames(packageJson);
  const pythonDeps = pythonRequirementNames(files).map((dependency) => dependency.toLowerCase());
  const stack = new Set();

  const includeIfDep = (name, label = name) => {
    if (deps.includes(name)) stack.add(label);
  };

  includeIfDep("react", "React");
  includeIfDep("vite", "Vite");
  includeIfDep("next", "Next.js");
  includeIfDep("express", "Express");
  includeIfDep("tailwindcss", "Tailwind CSS");
  includeIfDep("@nestjs/core", "NestJS");
  includeIfDep("fastify", "Fastify");
  includeIfDep("vue", "Vue");
  includeIfDep("svelte", "Svelte");
  includeIfDep("django", "Django");
  includeIfDep("flask", "Flask");

  if (hasFile(files, "vite.config.js")) stack.add("Vite");
  if (hasFile(files, "next.config.js")) stack.add("Next.js");
  if (hasFile(files, "turbo.json") || hasFile(files, "turbo.jsonc")) stack.add("Turborepo");
  if (hasFile(files, "pnpm-workspace.yaml") || packageJson?.workspaces) stack.add("Monorepo");
  if (hasFile(files, "requirements.txt") || hasFile(files, "pyproject.toml")) stack.add("Python");
  if (pythonDeps.includes("fastapi")) stack.add("FastAPI");
  if (pythonDeps.includes("django")) stack.add("Django");
  if (pythonDeps.includes("flask")) stack.add("Flask");
  if (pythonDeps.includes("ollama")) stack.add("Ollama");
  if (hasFile(files, "pubspec.yaml") || hasFile(files, "frontend/appflowy_flutter/pubspec.yaml")) {
    stack.add("Flutter");
    stack.add("Dart");
  }
  if (hasFile(files, "Cargo.toml") || hasFile(files, "frontend/rust-lib/Cargo.toml")) stack.add("Rust");
  if (hasFile(files, "melos.yaml")) stack.add("Melos");
  if (hasFile(files, "codemagic.yaml")) stack.add("Codemagic CI");
  if (hasFile(files, "Dockerfile")) stack.add("Docker");

  return [...stack];
}

export function detectRuntime(packageJson, files) {
  const nvmVersion = getFile(files, ".nvmrc").trim();
  if (nvmVersion) {
    return `Node ${nvmVersion}`;
  }

  const nodeVersion = getFile(files, ".node-version").trim();
  if (nodeVersion) {
    return `Node ${nodeVersion}`;
  }

  if (packageJson?.engines?.node) {
    return `Node ${packageJson.engines.node}`;
  }

  const dockerfile = getFile(files, "Dockerfile");
  const nodeImage = dockerfile.match(/FROM\s+node:([^\s]+)/i);
  if (nodeImage) return `Node ${nodeImage[1]}`;

  const pythonImage = dockerfile.match(/FROM\s+python:([^\s]+)/i);
  if (pythonImage) return `Python ${pythonImage[1]}`;

  const pyproject = getFile(files, "pyproject.toml");
  const pythonRequires = pyproject.match(/requires-python\s*=\s*["']([^"']+)/i);
  if (pythonRequires) return `Python ${pythonRequires[1]}`;

  const pubspec = [getFile(files, "pubspec.yaml"), getFile(files, "frontend/appflowy_flutter/pubspec.yaml")].find(Boolean) || "";
  const dartSdk = pubspec.match(/sdk:\s*['"]?([^'"\n]+)/i);
  const flutterSdk = pubspec.match(/flutter:\s*['"]?([^'"\n]+)/i);
  const rustToolchain = [getFile(files, "rust-toolchain.toml"), getFile(files, "rust-toolchain")]
    .find(Boolean)
    ?.trim();
  const hasRust = hasFile(files, "Cargo.toml") || hasFile(files, "frontend/rust-lib/Cargo.toml");
  const hasFlutter = hasFile(files, "pubspec.yaml") || hasFile(files, "frontend/appflowy_flutter/pubspec.yaml");

  if (hasFlutter && hasRust) {
    const dartPart = dartSdk ? `Dart ${dartSdk[1].trim()}` : "Dart/Flutter";
    const rustPart = rustToolchain ? `Rust ${rustToolchain.split(/\r?\n/)[0]}` : "Rust";
    return `${dartPart} + ${rustPart}`;
  }

  if (hasFlutter) return dartSdk ? `Dart ${dartSdk[1].trim()}` : "Dart/Flutter";
  if (hasRust) return rustToolchain ? `Rust ${rustToolchain.split(/\r?\n/)[0]}` : "Rust";

  if (hasFile(files, "package.json")) return "Node.js";
  if (hasFile(files, "requirements.txt") || hasFile(files, "pyproject.toml")) return "Python";
  return "";
}

export function detectServices(files, packageJson) {
  const haystack = [
    getFile(files, "docker-compose.yml"),
    getFile(files, "docker-compose.yaml"),
    getFile(files, "docker/docker-compose.yml"),
    getFile(files, "docker/docker-compose.yaml"),
    getFile(files, "Dockerfile"),
    getFile(files, "README.md"),
    getFile(files, "doc/README.md"),
    getFile(files, "docs/README.md"),
    getFile(files, "doc/DEVELOPMENT.md"),
    getFile(files, "doc/Development.md"),
    getFile(files, "docs/development.md"),
    getFile(files, "frontend/appflowy_flutter/pubspec.yaml"),
    getFile(files, "frontend/rust-lib/Cargo.toml"),
    getFile(files, "DEVELOPERS.md"),
    getFile(files, "CONTRIBUTING.md"),
    dependencyNames(packageJson).join("\n"),
    pythonRequirementNames(files).join("\n")
  ].join("\n").toLowerCase();

  const services = new Set();
  const databases = new Set();
  const infrastructure = new Set();

  const checks = [
    [/postgres|postgresql|pg\b|prisma/, "PostgreSQL", databases],
    [/mysql|mariadb/, "MySQL", databases],
    [/mongodb|mongo|mongoose/, "MongoDB", databases],
    [/sqlite/, "SQLite", databases],
    [/redis|ioredis/, "Redis", services],
    [/postgrest/, "PostgREST", services],
    [/\bgotrue\b/, "GoTrue Auth", services],
    [/\bkong\b/, "Kong Gateway", services],
    [/\brealtime\b|websocket/, "Realtime", services],
    [/rabbitmq|amqp/, "RabbitMQ", services],
    [/kafka/, "Kafka", services],
    [/elasticsearch|opensearch/, "Search", services],
    [/ollama/, "Ollama", services],
    [/docker compose|docker-compose|services:/, "Docker Compose", infrastructure],
    [/dockerfile|from\s+/, "Docker", infrastructure],
    [/s3|aws-sdk|@aws-sdk/, "AWS", infrastructure],
    [/stripe/, "Stripe", services],
    [/sendgrid|mailgun|resend/, "Email Provider", services]
  ];

  checks.forEach(([regex, label, bucket]) => {
    if (regex.test(haystack)) bucket.add(label);
  });

  return {
    services: [...services],
    databases: [...databases],
    infrastructure: [...infrastructure]
  };
}

export function confidenceFromSignals(signals) {
  const score = signals.reduce((total, signal) => total + signal.value, 50);
  return Math.max(0, Math.min(100, Math.round(score)));
}
