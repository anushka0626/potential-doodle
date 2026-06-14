import { aggregateBlueprint } from "./aggregator.js";
import { runAgents } from "./agents.js";
import { applyScoringReview } from "./scoringAgent.js";
import { parseGitHubUrl, TARGET_FILES } from "./repositoryFetcher.js";
import { generateSetupScripts } from "./scriptGenerator.js";

const FIXTURES = {
  "expressjs/express": {
    defaultBranch: "master",
    expectedScoreRange: [80, 95],
    description: "Library/package repo with strong README usage docs and test scripts.",
    rootFolders: ["examples", "lib", "test"],
    files: {
      "README.md": [
        "# Express",
        "Fast, unopinionated, minimalist web framework for Node.js.",
        "## Installation",
        "npm install express",
        "## Running Tests",
        "npm test",
        "## Contributing",
        "See contribution guidance before opening pull requests."
      ].join("\n"),
      "package.json": JSON.stringify(
        {
          name: "express",
          version: "5.1.0",
          description: "Fast, unopinionated, minimalist web framework",
          keywords: ["express", "framework", "http", "web"],
          main: "index.js",
          files: ["index.js", "lib/"],
          engines: { node: ">= 18" },
          scripts: {
            lint: "eslint .",
            test: "mocha --require test/support/env --reporter spec --bail --check-leaks test/ test/acceptance/"
          },
          dependencies: {
            accepts: "^2.0.0",
            "body-parser": "^2.2.0",
            "cookie-parser": "^1.4.7"
          },
          devDependencies: {
            eslint: "^8.0.0",
            mocha: "^10.0.0"
          }
        },
        null,
        2
      )
    }
  },
  "supabase/supabase": {
    defaultBranch: "master",
    expectedScoreRange: [65, 88],
    description: "Large platform monorepo with workspace config, Docker services, and developer docs.",
    rootFolders: ["apps", "docker", "examples", "packages"],
    files: {
      "README.md": [
        "# Supabase",
        "Supabase is an open source Firebase alternative.",
        "The platform includes Postgres, Auth, Realtime, Storage, Edge Functions, and APIs.",
        "Local development uses pnpm workspaces and Docker services."
      ].join("\n"),
      "CONTRIBUTING.md": "## Contributing\nInstall dependencies with pnpm and read developer setup docs.",
      "DEVELOPERS.md": "## Local development\nUse pnpm install, Docker Compose services, and Makefile targets for platform development.",
      "package.json": JSON.stringify(
        {
          private: true,
          workspaces: ["apps/*", "packages/*"],
          scripts: {
            dev: "turbo dev",
            lint: "turbo lint",
            test: "turbo test"
          },
          devDependencies: {
            turbo: "^2.0.0",
            typescript: "^5.0.0"
          }
        },
        null,
        2
      ),
      "pnpm-lock.yaml": "lockfileVersion: '9.0'",
      "pnpm-workspace.yaml": "packages:\n  - apps/*\n  - packages/*",
      ".nvmrc": "22",
      "Makefile": "help:\n\t@echo Available targets\n",
      "docker/docker-compose.yml": "services:\n  postgres:\n    image: postgres:15\n  redis:\n    image: redis:7\n  kong:\n    image: kong:latest\n"
    }
  },
  "vitejs/vite": {
    defaultBranch: "main",
    expectedScoreRange: [75, 92],
    description: "Monorepo/library tooling project with pnpm workspace and clear package scripts.",
    rootFolders: ["packages", "docs", "playground"],
    files: {
      "README.md": "# Vite\nNext generation frontend tooling.\n\n## Contributing\nUse pnpm install and pnpm run dev.",
      "CONTRIBUTING.md": "## Development Setup\nRun pnpm install, pnpm run dev, pnpm test.",
      "package.json": JSON.stringify(
        {
          private: true,
          packageManager: "pnpm@10.0.0",
          workspaces: ["packages/*"],
          scripts: {
            dev: "pnpm --filter vite dev",
            test: "pnpm run test-unit",
            lint: "eslint ."
          },
          devDependencies: {
            "@vitejs/plugin-react": "^5.0.0",
            typescript: "^5.0.0"
          }
        },
        null,
        2
      ),
      "pnpm-lock.yaml": "lockfileVersion: '9.0'",
      "pnpm-workspace.yaml": "packages:\n  - packages/*\n  - playground/*",
      "tsconfig.json": "{}"
    }
  },
  "openai/openai-node": {
    defaultBranch: "master",
    expectedScoreRange: [85, 98],
    description: "SDK/library repo with package metadata, runtime clarity, examples, and tests.",
    rootFolders: ["examples", "src", "tests"],
    files: {
      "README.md": "# OpenAI Node API Library\n\nInstall with npm install openai.\n\nSet OPENAI_API_KEY for examples.\n\nRun tests with npm test.",
      "CONTRIBUTING.md": "## Contributing\nRun npm install, npm test, and npm run lint before opening a PR.",
      "package.json": JSON.stringify(
        {
          name: "openai",
          type: "module",
          main: "dist/index.js",
          exports: "./dist/index.js",
          types: "dist/index.d.ts",
          engines: { node: ">= 18" },
          scripts: {
            build: "tsc",
            lint: "eslint .",
            test: "jest"
          },
          dependencies: {
            "@types/node": "^18.0.0"
          },
          devDependencies: {
            typescript: "^5.0.0",
            jest: "^29.0.0"
          }
        },
        null,
        2
      ),
      ".env.example": "OPENAI_API_KEY=\n",
      "tsconfig.json": "{}"
    }
  },
  "appflowy-io/appflowy": {
    defaultBranch: "main",
    expectedScoreRange: [58, 78],
    description: "Cross-platform Flutter/Rust app with nested manifests and source-build docs.",
    rootFolders: ["doc", "frontend", "resources", "scripts"],
    files: {
      "README.md": [
        "# AppFlowy",
        "AppFlowy is an open-source alternative to Notion.",
        "Built with Flutter and Rust.",
        "For development from source, follow the documentation in the doc folder."
      ].join("\n"),
      "CONTRIBUTING.md": "## Contributing\nRead source build instructions before opening a pull request.",
      "install.sh": "#!/usr/bin/env bash\nset -e\n# install helper for local dependencies\n",
      "codemagic.yaml": "workflows:\n  appflowy-workflow:\n    name: AppFlowy CI\n",
      "frontend/appflowy_flutter/pubspec.yaml": [
        "name: appflowy",
        "environment:",
        "  sdk: '>=3.5.0 <4.0.0'",
        "dependencies:",
        "  flutter:",
        "    sdk: flutter"
      ].join("\n"),
      "frontend/rust-lib/Cargo.toml": [
        "[workspace]",
        "members = [\"flowy-core\", \"flowy-user\"]",
        "[workspace.package]",
        "edition = \"2021\""
      ].join("\n"),
      "doc/Build.md": "## Build from source\nInstall Flutter and Rust, then run flutter pub get and cargo test/build commands.",
      "doc/Development.md": "## Development\nUse the nested Flutter app and Rust library workspaces for local development."
    }
  },
  "anyak393/ai-innovation-copilot": {
    defaultBranch: "main",
    expectedScoreRange: [62, 84],
    description: "Python FastAPI app with local Ollama dependency and setup-script ordering risks.",
    rootFolders: ["api", "backend", "docs", "models", "rag", "tests", "workflows"],
    scriptChecks: {
      windowsIncludes: [
        "python -m venv .venv",
        ".venv\\Scripts\\activate",
        "pip install -r requirements.txt",
        "ollama pull qwen3:4b",
        "uvicorn main:app --reload"
      ],
      windowsExcludes: [
        "source venv/bin/activate",
        "git clone <repository-url>",
        "\nollama serve\n"
      ]
    },
    files: {
      "README.md": [
        "# AI Innovation Copilot",
        "A FastAPI backend that uses local Ollama models for ideation workflows.",
        "## Setup",
        "Clone the repository locally.",
        "Create a Python virtual environment.",
        "Install dependencies using requirements.txt.",
        "Install Ollama and pull the qwen3:4b model.",
        "Start Ollama in a separate terminal with ollama serve.",
        "Run the FastAPI backend using uvicorn main:app --reload."
      ].join("\n"),
      "requirements.txt": [
        "fastapi==0.136.3",
        "uvicorn==0.32.1",
        "ollama==0.4.5",
        "pydantic==2.13.4"
      ].join("\n"),
      "main.py": [
        "from fastapi import FastAPI",
        "from api.routes import router",
        "",
        "app = FastAPI(title='AI Innovation Copilot')",
        "app.include_router(router)"
      ].join("\n"),
      "api/routes.py": [
        "from fastapi import APIRouter",
        "from backend.auth import validate_session",
        "",
        "router = APIRouter()",
        "",
        "@router.post('/ideas')",
        "def generate_ideas(payload: dict):",
        "    validate_session(payload.get('session_id'))",
        "    return {'ideas': []}"
      ].join("\n"),
      "backend/auth.py": [
        "def validate_session(session_id: str | None) -> bool:",
        "    if not session_id:",
        "        raise ValueError('Missing session id')",
        "    return True"
      ].join("\n")
    }
  }
};

function slugFromRepoUrl(repoUrl) {
  try {
    const parsed = parseGitHubUrl(repoUrl);
    return `${parsed.owner}/${parsed.repo}`.toLowerCase();
  } catch {
    return "";
  }
}

function rootEntriesFromFolders(folders) {
  return folders.map((folder) => ({
    name: folder,
    path: folder,
    type: "dir"
  }));
}

function buildFiles(fileContents, defaultBranch) {
  const files = {};
  const paths = [...new Set([...TARGET_FILES, ...Object.keys(fileContents)])];

  paths.forEach((path) => {
    const found = Object.prototype.hasOwnProperty.call(fileContents, path);
    files[path] = {
      path,
      sourcePath: path,
      found,
      branch: defaultBranch,
      content: found ? fileContents[path] : ""
    };
  });

  return files;
}

function buildContext(slug, fixture, reason) {
  const [owner, repo] = slug.split("/");
  const defaultBranch = fixture.defaultBranch || "main";
  const files = buildFiles(fixture.files, defaultBranch);
  const rootEntries = rootEntriesFromFolders(fixture.rootFolders || []);

  return {
    repository: {
      owner,
      repo,
      branchHint: null,
      webUrl: `https://github.com/${owner}/${repo}`,
      defaultBranch,
      rootEntries,
      rootFolders: fixture.rootFolders || [],
      analyzedAt: new Date().toISOString(),
      analysisMode: "demo-fixture",
      demoFixture: true,
      fallbackReason: reason || "Loaded curated demo fixture."
    },
    files,
    fileSummary: Object.keys(files).map((path) => ({
      path,
      sourcePath: files[path].sourcePath,
      found: files[path].found,
      branch: files[path].branch
    }))
  };
}

export function getDemoRepositoryContext(repoUrl, reason) {
  const slug = slugFromRepoUrl(repoUrl);
  const fixture = FIXTURES[slug];

  if (!fixture) {
    return null;
  }

  return buildContext(slug, fixture, reason);
}

export async function analyzeDemoRepository(repoUrl, reason) {
  const context = getDemoRepositoryContext(repoUrl, reason);

  if (!context) {
    return null;
  }

  const agents = await runAgents(context);
  const heuristicBlueprint = aggregateBlueprint({
    ...context,
    agents
  });

  return applyScoringReview(context, heuristicBlueprint);
}

export function listDemoEvaluations() {
  return Object.entries(FIXTURES).map(([slug, fixture]) => ({
    slug,
    repoUrl: `https://github.com/${slug}`,
    description: fixture.description,
    expectedScoreRange: fixture.expectedScoreRange,
    defaultBranch: fixture.defaultBranch
  }));
}

export async function runDemoEvaluations() {
  const results = [];

  for (const [slug, fixture] of Object.entries(FIXTURES)) {
    const context = buildContext(slug, fixture, "Deterministic evaluation fixture.");
    const agents = await runAgents(context, { useAi: false });
    const blueprint = aggregateBlueprint({
      ...context,
      agents
    });
    const scriptChecks = fixture.scriptChecks;
    const windowsScript = scriptChecks ? generateSetupScripts(blueprint).scripts.windows.content : "";
    const scriptPass = !scriptChecks || [
      ...(scriptChecks.windowsIncludes || []).map((expected) => windowsScript.includes(expected)),
      ...(scriptChecks.windowsExcludes || []).map((forbidden) => !windowsScript.includes(forbidden))
    ].every(Boolean);
    const [min, max] = fixture.expectedScoreRange;

    results.push({
      slug,
      repoUrl: `https://github.com/${slug}`,
      expectedScoreRange: fixture.expectedScoreRange,
      score: blueprint.confidenceScore,
      pass: blueprint.confidenceScore >= min && blueprint.confidenceScore <= max && scriptPass,
      repositoryType: blueprint.repositoryInsights.kindLabel,
      scriptPass,
      summary: blueprint.scoreSummary
    });
  }

  return {
    total: results.length,
    passed: results.filter((result) => result.pass).length,
    failed: results.filter((result) => !result.pass).length,
    results
  };
}
