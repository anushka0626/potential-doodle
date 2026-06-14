import { mergeAiScoringReview } from "./aggregator.js";
import { callJsonAgent } from "./openaiClient.js";

const scoringReviewSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    repositoryType: {
      type: "string",
      enum: ["application", "library", "monorepo", "native", "documentation", "unknown"]
    },
    confidenceScore: { type: "number", minimum: 0, maximum: 100 },
    scoreSummary: { type: "string" },
    scoreFactors: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          impact: { type: "number" },
          detail: { type: "string" },
          sentiment: {
            type: "string",
            enum: ["positive", "negative", "neutral"]
          }
        },
        required: ["label", "impact", "detail", "sentiment"]
      }
    },
    riskDetails: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          message: { type: "string" },
          severity: {
            type: "string",
            enum: ["low", "medium", "high"]
          }
        },
        required: ["message", "severity"]
      }
    },
    confidence: { type: "number", minimum: 0, maximum: 100 },
    reasoning: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: [
    "repositoryType",
    "confidenceScore",
    "scoreSummary",
    "scoreFactors",
    "riskDetails",
    "confidence",
    "reasoning"
  ]
};

function compactFiles(files) {
  return Object.fromEntries(
    Object.entries(files)
      .filter(([, file]) => file.found)
      .map(([path, file]) => [
        path,
        {
          sourcePath: file.sourcePath || path,
          content: file.content.slice(0, 16000)
        }
      ])
  );
}

function compactBlueprint(blueprint) {
  return {
    repositoryInsights: blueprint.repositoryInsights,
    heuristicConfidenceScore: blueprint.heuristicConfidenceScore,
    stack: blueprint.stack,
    runtime: blueprint.runtime,
    packageManager: blueprint.packageManager,
    envVariables: blueprint.envVariables,
    missingSecrets: blueprint.missingSecrets,
    services: blueprint.services,
    databases: blueprint.databases,
    infrastructure: blueprint.infrastructure,
    setupSteps: blueprint.setupSteps,
    runCommands: blueprint.runCommands,
    riskDetails: blueprint.riskDetails,
    scoreFactors: blueprint.scoreFactors
  };
}

export async function applyScoringReview(context, blueprint) {
  try {
    const review = await callJsonAgent({
      name: "repository_scoring_review",
      schema: scoringReviewSchema,
      payload: {
        repository: context.repository,
        files: compactFiles(context.files),
        heuristicBlueprint: compactBlueprint(blueprint)
      },
      system: [
        "You are RepoPilot's AI Scoring Reviewer.",
        "Your job is to grade repository onboarding confidence using the correct repository archetype, not a one-size-fits-all web app rubric.",
        "All numeric confidence values must be whole-number percentages from 0 to 100. Never return 0-1 decimals.",
        "Classify the repo as application, library, monorepo, native, documentation, or unknown.",
        "For application/service repos, reward env templates, Docker/Compose, run commands, services, and setup docs.",
        "For library/package repos, do not penalize missing env files, Docker Compose, databases, or dev server commands unless the docs imply they are needed.",
        "For library/package repos, reward install instructions, runtime requirement, test/lint commands, examples, contribution guidance, package metadata, and clear usage docs.",
        "For monorepos/platform repos, reward workspace config, contributor/developer guides, Makefile/task runner entrypoints, package-manager clarity, and service orchestration docs.",
        "For native/cross-platform app repos, reward Flutter/Dart/Rust manifests, nested development docs, install scripts, CI setup files, and source-build guidance; penalize complexity but do not expect package.json or Docker by default.",
        "Use the heuristic blueprint as evidence, but correct false assumptions when files show a better interpretation.",
        "Return calibrated score factors and concise reasons suitable for a hackathon dashboard.",
        "The score should represent confidence that a new contributor can get productive quickly, not code quality or project popularity.",
        "Write reasoning as judge-facing evidence bullets that explain why the final score is fair."
      ].join(" ")
    });

    return mergeAiScoringReview(blueprint, review);
  } catch (error) {
    return {
      ...blueprint,
      scoreFactors: [
        {
          label: "AI reviewer unavailable",
          impact: 0,
          detail: error.message,
          sentiment: "neutral"
        },
        ...blueprint.scoreFactors
      ]
    };
  }
}
