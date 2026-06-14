import { callJsonAgent } from "./openaiClient.js";

const askRepoSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    answer: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 100 },
    citations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string" },
          evidence: { type: "string" }
        },
        required: ["path", "evidence"]
      }
    },
    followUps: { type: "array", items: { type: "string" } },
    reasoning: { type: "array", items: { type: "string" } }
  },
  required: ["answer", "confidence", "citations", "followUps", "reasoning"]
};

const SUGGESTED_TERMS = {
  setup: ["run", "start", "setup", "install", "dev", "build", "test", "script"],
  env: ["env", "environment", "secret", "token", "key", "config", "variable"],
  database: ["database", "db", "postgres", "mysql", "redis", "sqlite", "mongo"],
  auth: ["auth", "authentication", "login", "oauth", "jwt", "session", "user"],
  docs: ["read", "docs", "documentation", "first", "contributing", "guide"]
};

const DOC_PRIORITY = [
  "README.md",
  "CONTRIBUTING.md",
  "DEVELOPERS.md",
  "doc/Build.md",
  "doc/BUILD.md",
  "doc/Development.md",
  "doc/DEVELOPMENT.md",
  "docs/setup.md",
  "docs/SETUP.md",
  ".env.example",
  ".env.template",
  "package.json",
  "frontend/appflowy_flutter/pubspec.yaml",
  "frontend/rust-lib/Cargo.toml",
  "docker-compose.yml",
  "docker-compose.yaml",
  "docker/docker-compose.yml",
  "docker/docker-compose.yaml"
];

function normalizePercent(value, fallback = 60) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) return fallback;

  const scaled = numeric > 0 && numeric <= 1 ? numeric * 100 : numeric;
  return Math.max(0, Math.min(100, Math.round(scaled)));
}

function trimText(text, limit = 220) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();

  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 1).trim()}...`;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function foundEntries(files = {}) {
  return Object.entries(files)
    .filter(([, file]) => file?.found)
    .map(([path, file]) => ({
      path,
      label: file.sourcePath || path,
      content: file.content || ""
    }));
}

function questionTerms(question) {
  const baseTerms = String(question || "")
    .toLowerCase()
    .split(/[^a-z0-9_.-]+/)
    .filter((term) => term.length >= 3)
    .filter((term) => !["this", "that", "repo", "repository", "project", "where", "what", "which", "how"].includes(term));

  const lower = String(question || "").toLowerCase();
  const expanded = Object.entries(SUGGESTED_TERMS)
    .filter(([, terms]) => terms.some((term) => lower.includes(term)))
    .flatMap(([, terms]) => terms);

  return unique([...baseTerms, ...expanded]);
}

function snippetForContent(content, terms = []) {
  const lines = String(content || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const lowerTerms = terms.map((term) => term.toLowerCase());
  const matched = lines.find((line) => lowerTerms.some((term) => line.toLowerCase().includes(term)));
  const fallback = lines.find((line) => !line.startsWith("#")) || lines[0] || "";

  return trimText(matched || fallback);
}

function citationsForPaths(context, paths, terms = []) {
  const entries = foundEntries(context.files);
  const byPath = new Map(entries.flatMap((entry) => [[entry.path, entry], [entry.label, entry]]));

  return unique(paths)
    .map((path) => byPath.get(path))
    .filter(Boolean)
    .slice(0, 5)
    .map((entry) => ({
      path: entry.label,
      evidence: snippetForContent(entry.content, terms)
    }))
    .filter((citation) => citation.evidence);
}

function rankedEvidence(context, question, limit = 8) {
  const terms = questionTerms(question);

  return foundEntries(context.files)
    .map((entry) => {
      const lowerContent = entry.content.toLowerCase();
      const priority = DOC_PRIORITY.includes(entry.path) || DOC_PRIORITY.includes(entry.label) ? 8 : 0;
      const termScore = terms.reduce((total, term) => total + (lowerContent.includes(term) ? 3 : 0), 0);
      const pathScore = terms.reduce((total, term) => total + (entry.label.toLowerCase().includes(term) ? 4 : 0), 0);

      return {
        ...entry,
        score: priority + termScore + pathScore
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => ({
      path: entry.label,
      excerpt: snippetForContent(entry.content, terms)
    }));
}

function compactBlueprint(blueprint) {
  return {
    repository: blueprint.repository,
    repositoryInsights: blueprint.repositoryInsights,
    confidenceScore: blueprint.confidenceScore,
    scoreSummary: blueprint.scoreSummary,
    stack: blueprint.stack,
    runtime: blueprint.runtime,
    packageManager: blueprint.packageManager,
    dependencies: blueprint.dependencies?.slice(0, 30) || [],
    envVariables: blueprint.envVariables,
    missingSecrets: blueprint.missingSecrets,
    services: blueprint.services,
    databases: blueprint.databases,
    infrastructure: blueprint.infrastructure,
    setupSteps: blueprint.setupSteps,
    runCommands: blueprint.runCommands,
    complexity: blueprint.complexity,
    risks: blueprint.risks
  };
}

function formatList(values, fallback = "none detected") {
  return values?.length ? values.join(", ") : fallback;
}

function isSourcePath(path) {
  return /(^|\/)(src|lib|app|server|backend|api|routes|controllers|middleware|models|rag|workflows)\//i.test(path) || /\.(cjs|mjs|js|jsx|ts|tsx|py|go|rs|java|kt|rb|php|cs)$/i.test(path);
}

function sourceLocationAnswer(context, blueprint, question) {
  const evidence = rankedEvidence(context, question, 8);
  const sourceEvidence = evidence.filter((item) => isSourcePath(item.path));

  if (sourceEvidence.length) {
    const files = sourceEvidence.slice(0, 4).map((item) => item.path);

    return {
      answer: `The best source-file matches in the scanned context are ${files.join(", ")}. Treat this as a shallow source hint, not a full-codebase search.`,
      confidence: sourceEvidence.length >= 2 ? 68 : 56,
      citations: sourceEvidence.slice(0, 5).map((item) => ({ path: item.path, evidence: item.excerpt })),
      reasoning: ["Answered from shallow source files fetched during repository analysis."]
    };
  }

  return {
    answer: "I could not find a matching implementation file in the scanned source/doc files. RepoPilot only performs shallow source discovery right now, so a full repository search would be the next step.",
    confidence: 35,
    citations: evidence.slice(0, 3).map((item) => ({ path: item.path, evidence: item.excerpt })),
    reasoning: ["No source-file citation matched the implementation question."]
  };
}

function setupAnswer(context, blueprint, question) {
  const terms = questionTerms(question);
  const docPaths = DOC_PRIORITY.filter((path) => context.files?.[path]?.found);
  const commands = blueprint.runCommands || [];
  const steps = blueprint.setupSteps || [];

  if (!commands.length && !steps.length) {
    return {
      answer: "RepoPilot could not identify a reliable setup path from the scanned files. Start with the README and contributor docs, then inspect package scripts or project-specific docs manually.",
      confidence: 42,
      citations: citationsForPaths(context, docPaths, terms),
      reasoning: ["No generated setup commands were available in the blueprint."]
    };
  }

  return {
    answer: [
      steps.length ? `Setup path: ${steps.join(" ")}` : "",
      commands.length ? `Commands to try: ${commands.map((command) => `\`${command}\``).join(", ")}.` : "",
      blueprint.complexity ? `Onboarding complexity is ${blueprint.complexity}.` : ""
    ]
      .filter(Boolean)
      .join(" "),
    confidence: commands.length >= 2 ? 84 : 72,
    citations: citationsForPaths(context, docPaths, terms),
    reasoning: ["Answered from the generated onboarding plan and scanned setup documentation."]
  };
}

function environmentAnswer(context, blueprint, question) {
  const terms = questionTerms(question);
  const envPaths = [".env.example", ".env.template", "docker/.env.example", "docker/.env.template", "supabase/.env.example", "supabase/.env.template"];
  const variables = blueprint.envVariables || [];
  const secrets = blueprint.missingSecrets || [];

  return {
    answer:
      variables.length || secrets.length
        ? `Environment variables detected: ${formatList(variables)}. Values that look secret or must be filled: ${formatList(secrets)}.`
        : "No required environment variables or secrets were detected in the scanned files.",
    confidence: variables.length || secrets.length ? 82 : 62,
    citations: citationsForPaths(context, envPaths.filter((path) => context.files?.[path]?.found), terms),
    reasoning: ["Answered from env templates, README/docs, and the Environment Analyzer output."]
  };
}

function databaseAnswer(context, blueprint, question) {
  const terms = questionTerms(question);
  const composePaths = ["docker-compose.yml", "docker-compose.yaml", "docker/docker-compose.yml", "docker/docker-compose.yaml", "README.md", "DEVELOPERS.md"];
  const databases = blueprint.databases || [];
  const services = blueprint.services || [];

  return {
    answer: databases.length
      ? `Database layer detected: ${databases.join(", ")}. Related local/external services: ${formatList(services)}.`
      : `No database was confidently detected from the scanned files. Related services found: ${formatList(services)}.`,
    confidence: databases.length ? 84 : 58,
    citations: citationsForPaths(context, composePaths.filter((path) => context.files?.[path]?.found), terms),
    reasoning: ["Answered from Docker/Compose files, docs, and Infrastructure Analyzer output."]
  };
}

function readFirstAnswer(context, blueprint, question) {
  const terms = questionTerms(question);
  const docs = DOC_PRIORITY.filter((path) => context.files?.[path]?.found && /\.md$/i.test(path));
  const firstDocs = docs.length ? docs.slice(0, 4) : ["README.md"].filter((path) => context.files?.[path]?.found);

  return {
    answer: firstDocs.length
      ? `Start with ${firstDocs.join(", ")}. Then use the generated setup steps and risks panel to decide what needs manual review.`
      : "Start with the repository README on GitHub. RepoPilot did not find enough local docs in the scanned paths.",
    confidence: firstDocs.length ? 78 : 45,
    citations: citationsForPaths(context, firstDocs, terms),
    reasoning: ["Answered from the scanned documentation paths and repository blueprint."]
  };
}

function authAnswer(context, blueprint, question) {
  const terms = questionTerms(question);
  const evidence = rankedEvidence(context, `${question} authentication auth login oauth jwt session user`, 5);
  const sourceEvidence = evidence.filter((item) => isSourcePath(item.path));
  const authDependencies = (blueprint.dependencies || []).filter((dependency) => /auth|jwt|passport|next-auth|oauth|session|supabase|firebase/i.test(dependency));
  const authServices = [...(blueprint.services || []), ...(blueprint.infrastructure || [])].filter((service) => /auth|supabase|firebase/i.test(service));

  if (sourceEvidence.length) {
    return {
      answer: `Authentication-related source evidence appears in ${sourceEvidence.map((item) => item.path).join(", ")}. This is based on shallow source discovery, so it is a strong hint rather than a full code search.`,
      confidence: sourceEvidence.length >= 2 ? 70 : 58,
      citations: sourceEvidence.map((item) => ({ path: item.path, evidence: item.excerpt })),
      reasoning: ["Answered from source files fetched during shallow repository discovery."]
    };
  }

  if (evidence.length || authDependencies.length || authServices.length) {
    return {
      answer: `The scanned files show authentication-related signals${authDependencies.length ? ` in dependencies (${authDependencies.join(", ")})` : ""}${authServices.length ? ` and services (${authServices.join(", ")})` : ""}. I do not have a source-file citation for the exact implementation location from this analysis.`,
      confidence: 48,
      citations: evidence.map((item) => ({ path: item.path, evidence: item.excerpt })),
      reasoning: ["Source-location questions need repository tree/code search beyond the current onboarding file scan."]
    };
  }

  return {
    answer: "I do not see authentication implementation evidence in the scanned files. To answer this precisely, RepoPilot needs a deeper source tree search.",
    confidence: 35,
    citations: citationsForPaths(context, ["README.md"].filter((path) => context.files?.[path]?.found), terms),
    reasoning: ["No auth-specific evidence was found in the scanned files."]
  };
}

function heuristicAnswer(context, blueprint, question) {
  const lower = question.toLowerCase();

  if (/(run|start|setup|install|build|test|command)/i.test(lower)) {
    return setupAnswer(context, blueprint, question);
  }

  if (/(env|environment|secret|token|key|variable|config)/i.test(lower)) {
    return environmentAnswer(context, blueprint, question);
  }

  if (/(database|\bdb\b|postgres|mysql|redis|sqlite|mongo)/i.test(lower)) {
    return databaseAnswer(context, blueprint, question);
  }

  if (/(auth|authentication|login|oauth|jwt|session)/i.test(lower)) {
    return authAnswer(context, blueprint, question);
  }

  if (/(where|which file|implemented|implementation|defined|located|handler|route|endpoint)/i.test(lower)) {
    return sourceLocationAnswer(context, blueprint, question);
  }

  if (/(read|first|docs|documentation|contributing|guide)/i.test(lower)) {
    return readFirstAnswer(context, blueprint, question);
  }

  return {
    answer: `From the current onboarding blueprint: this looks like a ${blueprint.repositoryInsights?.kindLabel || "repository"} with ${formatList(blueprint.stack)}. Runtime: ${blueprint.runtime || "unknown"}. Setup confidence is ${blueprint.confidenceScore}%. Ask about setup, env vars, databases, risks, or docs for a more targeted answer.`,
    confidence: 60,
    citations: rankedEvidence(context, question, 3).map((item) => ({ path: item.path, evidence: item.excerpt })),
    reasoning: ["Answered from the aggregate blueprint because the question did not match a specialized route."]
  };
}

function normalizeCitations(citations, context, fallback = []) {
  const known = new Map(foundEntries(context.files).flatMap((entry) => [[entry.path.toLowerCase(), entry.label], [entry.label.toLowerCase(), entry.label]]));
  const normalized = (Array.isArray(citations) ? citations : [])
    .map((citation) => {
      const path = known.get(String(citation?.path || "").toLowerCase());

      if (!path) return null;

      return {
        path,
        evidence: trimText(citation.evidence, 220)
      };
    })
    .filter((citation) => citation?.evidence);

  return unique([...normalized.map((citation) => JSON.stringify(citation)), ...fallback.map((citation) => JSON.stringify(citation))])
    .map((citation) => JSON.parse(citation))
    .slice(0, 5);
}

export async function askRepositoryQuestion(session, question) {
  const cleanQuestion = String(question || "").trim().slice(0, 600);

  if (!cleanQuestion) {
    const error = new Error("A repository question is required.");
    error.status = 400;
    throw error;
  }

  const heuristic = heuristicAnswer(session.context, session.blueprint, cleanQuestion);
  const fallback = {
    ...heuristic,
    question: cleanQuestion,
    mode: "heuristic",
    followUps: [
      "How do I run this project?",
      "What environment variables are required?",
      "Which files should I read first?"
    ]
  };

  try {
    const response = await callJsonAgent({
      name: "ask_repo_answer",
      schema: askRepoSchema,
      payload: {
        question: cleanQuestion,
        blueprint: compactBlueprint(session.blueprint),
        evidence: rankedEvidence(session.context, cleanQuestion, 10),
        heuristicDraft: heuristic
      },
      system: [
        "You are RepoPilot's Ask Repo agent.",
        "Answer questions for a developer onboarding to this repository.",
        "Use only the provided blueprint and evidence excerpts. Do not invent files, commands, secrets, or services.",
        "When the evidence is insufficient, say exactly what is missing and what RepoPilot would need next.",
        "RepoPilot may include shallow source-file excerpts from likely source directories; call them source hints, not exhaustive search results.",
        "For source-location questions, only name implementation files when a provided citation proves it.",
        "Keep answers concise, practical, and grounded in citations.",
        "Return confidence as a whole-number percentage from 0 to 100."
      ].join(" ")
    });

    if (!response) return fallback;

    return {
      question: cleanQuestion,
      answer: trimText(response.answer, 1200),
      confidence: normalizePercent(response.confidence, heuristic.confidence),
      mode: "ai",
      citations: normalizeCitations(response.citations, session.context, heuristic.citations),
      followUps: (Array.isArray(response.followUps) ? response.followUps : fallback.followUps).slice(0, 3),
      reasoning: (Array.isArray(response.reasoning) ? response.reasoning : heuristic.reasoning).slice(0, 5)
    };
  } catch (error) {
    return {
      ...fallback,
      reasoning: [...(fallback.reasoning || []), `AI answer unavailable: ${error.message}`].slice(0, 5)
    };
  }
}
