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
  if (hasFile(files, "pnpm-lock.yaml")) return "pnpm";
  if (hasFile(files, "yarn.lock")) return "yarn";
  if (hasFile(files, "package-lock.json")) return "npm";
  if (hasFile(files, "package.json")) return "npm";
  if (hasFile(files, "requirements.txt")) return "pip";
  if (hasFile(files, "pyproject.toml")) return "pip/poetry";
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

export function detectFrameworks(packageJson, files) {
  const deps = dependencyNames(packageJson);
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
  if (hasFile(files, "requirements.txt") || hasFile(files, "pyproject.toml")) stack.add("Python");
  if (hasFile(files, "Dockerfile")) stack.add("Docker");

  return [...stack];
}

export function detectRuntime(packageJson, files) {
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

  if (hasFile(files, "package.json")) return "Node.js";
  if (hasFile(files, "requirements.txt") || hasFile(files, "pyproject.toml")) return "Python";
  return "";
}

export function detectServices(files, packageJson) {
  const haystack = [
    getFile(files, "docker-compose.yml"),
    getFile(files, "docker-compose.yaml"),
    getFile(files, "Dockerfile"),
    getFile(files, "README.md"),
    dependencyNames(packageJson).join("\n")
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
    [/rabbitmq|amqp/, "RabbitMQ", services],
    [/kafka/, "Kafka", services],
    [/elasticsearch|opensearch/, "Search", services],
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
