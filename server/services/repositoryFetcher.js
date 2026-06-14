export const TARGET_FILES = [
  "README.md",
  "CONTRIBUTING.md",
  "DEVELOPERS.md",
  "GOVERNANCE.md",
  "SECURITY.md",
  "package.json",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "requirements.txt",
  "pyproject.toml",
  "pubspec.yaml",
  "pubspec.lock",
  "Cargo.toml",
  "Cargo.lock",
  "rust-toolchain",
  "rust-toolchain.toml",
  "melos.yaml",
  "analysis_options.yaml",
  "Makefile",
  "install.sh",
  "codemagic.yaml",
  ".nvmrc",
  ".node-version",
  ".npmrc",
  "Dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "docker/docker-compose.yml",
  "docker/docker-compose.yaml",
  ".env.example",
  ".env.template",
  "docker/.env.example",
  "docker/.env.template",
  "supabase/.env.example",
  "supabase/.env.template",
  "next.config.js",
  "vite.config.js",
  "tsconfig.json",
  "turbo.json",
  "turbo.jsonc",
  "frontend/README.md",
  "frontend/appflowy_flutter/README.md",
  "frontend/appflowy_flutter/pubspec.yaml",
  "frontend/appflowy_flutter/pubspec.lock",
  "frontend/rust-lib/Cargo.toml",
  "frontend/rust-lib/Cargo.lock",
  "doc/README.md",
  "doc/CONTRIBUTING.md",
  "doc/DEVELOPMENT.md",
  "doc/Development.md",
  "doc/BUILD.md",
  "doc/Build.md",
  "doc/INSTALL.md",
  "doc/Install.md",
  "docs/README.md",
  "docs/CONTRIBUTING.md",
  "docs/DEVELOPMENT.md",
  "docs/development.md",
  "docs/setup.md",
  "docs/SETUP.md",
  "Procfile"
];

const SOURCE_DIRS = [
  "src",
  "lib",
  "app",
  "server",
  "backend",
  "api",
  "routes",
  "controllers",
  "middleware",
  "models",
  "rag",
  "workflows"
];
const SOURCE_EXTENSIONS = /\.(cjs|mjs|js|jsx|ts|tsx|py|go|rs|java|kt|rb|php|cs)$/i;
const SOURCE_NAME_PRIORITY = /(auth|login|session|user|route|api|server|main|app|index|config|database|db|model|agent|workflow|controller|middleware)/i;

const githubHeaders = () => {
  const headers = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "RepoPilot-Hackathon-MVP"
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  return headers;
};

export function parseGitHubUrl(input) {
  let url;

  try {
    url = new URL(input.trim());
  } catch {
    const error = new Error("Enter a valid GitHub repository URL.");
    error.status = 400;
    throw error;
  }

  if (!["github.com", "www.github.com"].includes(url.hostname.toLowerCase())) {
    const error = new Error("RepoPilot currently supports GitHub repository URLs.");
    error.status = 400;
    throw error;
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const [owner, rawRepo, maybeTree] = parts;
  const repo = rawRepo?.replace(/\.git$/, "");

  if (!owner || !repo) {
    const error = new Error("GitHub URL must include an owner and repository name.");
    error.status = 400;
    throw error;
  }

  return {
    owner,
    repo,
    branchHint: maybeTree === "tree" ? parts.slice(3).join("/") : null,
    webUrl: `https://github.com/${owner}/${repo}`
  };
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: githubHeaders() });

  if (!response.ok) {
    const rateLimitRemaining = response.headers.get("x-ratelimit-remaining");
    const rateLimitReset = response.headers.get("x-ratelimit-reset");
    let message = `GitHub request failed with ${response.status}.`;

    if (response.status === 403 && rateLimitRemaining === "0") {
      const resetTime = rateLimitReset
        ? new Date(Number(rateLimitReset) * 1000).toLocaleTimeString()
        : "later";
      message = `GitHub rate limit reached. Try again after ${resetTime} or add GITHUB_TOKEN.`;
    } else if (response.status === 404) {
      message = "GitHub repository was not found or is private.";
    } else if (response.status >= 500) {
      message = "GitHub is temporarily unavailable.";
    }

    const error = new Error(message);
    error.status = response.status === 404 ? 404 : 502;
    error.githubStatus = response.status;
    error.rateLimited = response.status === 403 && rateLimitRemaining === "0";
    throw error;
  }

  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, { headers: githubHeaders() });

  if (!response.ok) {
    return null;
  }

  return response.text();
}

async function getDefaultBranch(owner, repo, branchHint) {
  if (branchHint) {
    return branchHint;
  }

  const metadata = await fetchJson(`https://api.github.com/repos/${owner}/${repo}`);
  return metadata.default_branch || "main";
}

async function getRootEntries(owner, repo, branch) {
  try {
    const entries = await fetchJson(
      `https://api.github.com/repos/${owner}/${repo}/contents?ref=${encodeURIComponent(branch)}`
    );

    if (!Array.isArray(entries)) {
      return [];
    }

    return entries.map((entry) => ({
      name: entry.name,
      path: entry.path,
      type: entry.type,
      size: entry.size || 0
    }));
  } catch {
    return [];
  }
}

async function getDirectoryEntries(owner, repo, branch, path) {
  try {
    const entries = await fetchJson(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`
    );

    if (!Array.isArray(entries)) {
      return [];
    }

    return entries.map((entry) => ({
      name: entry.name,
      path: entry.path,
      type: entry.type,
      size: entry.size || 0
    }));
  } catch {
    return [];
  }
}

function dynamicDocTargets(entries) {
  return entries
    .filter((entry) => entry.type === "file")
    .filter((entry) => /\.md$/i.test(entry.name))
    .filter((entry) => /(setup|install|build|develop|development|contribut|source|local|run)/i.test(entry.name))
    .map((entry) => entry.path)
    .slice(0, 8);
}

function dynamicSourceTargets(rootEntries, directoryEntries) {
  const rootSourceFiles = rootEntries
    .filter((entry) => entry.type === "file")
    .filter((entry) => SOURCE_EXTENSIONS.test(entry.name))
    .filter((entry) => entry.size < 120000)
    .map((entry) => entry.path);

  const directorySourceFiles = directoryEntries
    .filter((entry) => entry.type === "file")
    .filter((entry) => SOURCE_EXTENSIONS.test(entry.name))
    .filter((entry) => entry.size < 120000)
    .sort((a, b) => {
      const aPriority = SOURCE_NAME_PRIORITY.test(a.path) ? 0 : 1;
      const bPriority = SOURCE_NAME_PRIORITY.test(b.path) ? 0 : 1;
      return aPriority - bPriority || a.path.localeCompare(b.path);
    })
    .map((entry) => entry.path)
    .slice(0, 24);

  return [...new Set([...rootSourceFiles, ...directorySourceFiles])].slice(0, 32);
}

function resolvePathCase(path, rootEntries) {
  if (path.includes("/")) {
    return path;
  }

  return rootEntries.find((entry) => entry.name.toLowerCase() === path.toLowerCase())?.name || path;
}

function rawFileUrl(owner, repo, branch, path) {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
}

export async function fetchRepositoryFiles(repoUrl) {
  const repo = parseGitHubUrl(repoUrl);
  const defaultBranch = await getDefaultBranch(repo.owner, repo.repo, repo.branchHint);
  const rootEntries = await getRootEntries(repo.owner, repo.repo, defaultBranch);
  const docEntries = await Promise.all(
    rootEntries
      .filter((entry) => entry.type === "dir" && ["doc", "docs", ".github"].includes(entry.name.toLowerCase()))
      .map((entry) => getDirectoryEntries(repo.owner, repo.repo, defaultBranch, entry.path))
  );
  const sourceEntries = await Promise.all(
    rootEntries
      .filter((entry) => entry.type === "dir" && SOURCE_DIRS.includes(entry.name.toLowerCase()))
      .slice(0, 10)
      .map((entry) => getDirectoryEntries(repo.owner, repo.repo, defaultBranch, entry.path))
  );
  const dynamicTargets = dynamicDocTargets(docEntries.flat());
  const dynamicSources = dynamicSourceTargets(rootEntries, sourceEntries.flat());
  const targetFiles = [...new Set([...TARGET_FILES, ...dynamicTargets, ...dynamicSources])];
  const branchCandidates = [...new Set([defaultBranch, "main", "master"].filter(Boolean))];
  const files = {};

  await Promise.all(
    targetFiles.map(async (path) => {
      const sourcePath = resolvePathCase(path, rootEntries);

      for (const branch of branchCandidates) {
        const content = await fetchText(rawFileUrl(repo.owner, repo.repo, branch, sourcePath));

        if (content !== null) {
          files[path] = {
            path,
            sourcePath,
            found: true,
            branch,
            content: content.slice(0, 70000)
          };
          return;
        }
      }

      files[path] = {
        path,
        sourcePath,
        found: false,
        branch: defaultBranch,
        content: ""
      };
    })
  );

  return {
    repository: {
      ...repo,
      defaultBranch,
      rootEntries,
      rootFolders: rootEntries.filter((entry) => entry.type === "dir").map((entry) => entry.path),
      analyzedAt: new Date().toISOString()
    },
    files,
    fileSummary: targetFiles.map((path) => ({
      path,
      sourcePath: files[path]?.sourcePath || path,
      found: files[path]?.found || false,
      branch: files[path]?.branch || defaultBranch
    }))
  };
}
