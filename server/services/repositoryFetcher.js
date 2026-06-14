const TARGET_FILES = [
  "README.md",
  "package.json",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "requirements.txt",
  "pyproject.toml",
  "Dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  ".env.example",
  ".env.template",
  "next.config.js",
  "vite.config.js",
  "tsconfig.json",
  "Procfile"
];

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

  const [owner, rawRepo, maybeTree, branch] = url.pathname.split("/").filter(Boolean);
  const repo = rawRepo?.replace(/\.git$/, "");

  if (!owner || !repo) {
    const error = new Error("GitHub URL must include an owner and repository name.");
    error.status = 400;
    throw error;
  }

  return {
    owner,
    repo,
    branchHint: maybeTree === "tree" ? branch : null,
    webUrl: `https://github.com/${owner}/${repo}`
  };
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: githubHeaders() });

  if (!response.ok) {
    const error = new Error(`GitHub request failed with ${response.status}.`);
    error.status = response.status === 404 ? 404 : 502;
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

function rawFileUrl(owner, repo, branch, path) {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
}

export async function fetchRepositoryFiles(repoUrl) {
  const repo = parseGitHubUrl(repoUrl);
  const defaultBranch = await getDefaultBranch(repo.owner, repo.repo, repo.branchHint);
  const branchCandidates = [...new Set([defaultBranch, "main", "master"].filter(Boolean))];
  const files = {};

  await Promise.all(
    TARGET_FILES.map(async (path) => {
      for (const branch of branchCandidates) {
        const content = await fetchText(rawFileUrl(repo.owner, repo.repo, branch, path));

        if (content !== null) {
          files[path] = {
            path,
            found: true,
            branch,
            content: content.slice(0, 70000)
          };
          return;
        }
      }

      files[path] = {
        path,
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
      analyzedAt: new Date().toISOString()
    },
    files,
    fileSummary: TARGET_FILES.map((path) => ({
      path,
      found: files[path]?.found || false,
      branch: files[path]?.branch || defaultBranch
    }))
  };
}
