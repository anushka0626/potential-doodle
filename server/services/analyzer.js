import { fetchRepositoryFiles } from "./repositoryFetcher.js";
import { runAgents } from "./agents.js";
import { aggregateBlueprint } from "./aggregator.js";
import { applyScoringReview } from "./scoringAgent.js";
import { getDemoRepositoryContext } from "./demoFixtures.js";

async function analyzeContext(repositoryContext) {
  const agents = await runAgents(repositoryContext);
  const heuristicBlueprint = aggregateBlueprint({
    ...repositoryContext,
    agents
  });

  return applyScoringReview(repositoryContext, heuristicBlueprint);
}

function fallbackReason(error) {
  if (error.rateLimited) {
    return "GitHub rate limit was reached, so RepoPilot loaded a curated demo fixture.";
  }

  if (error.githubStatus === 404 || error.status === 404) {
    return "GitHub repository was unavailable, so RepoPilot loaded a curated demo fixture.";
  }

  return "Live GitHub analysis failed, so RepoPilot loaded a curated demo fixture.";
}

function enrichError(error) {
  if (error.rateLimited) {
    error.message = `${error.message} No matching demo fixture is available for this repository.`;
  } else if (error.githubStatus) {
    error.message = `${error.message} Add GITHUB_TOKEN, check the repo URL, or try one of the demo repos.`;
  }

  return error;
}

export async function analyzeRepository(repoUrl, options = {}) {
  return (await analyzeRepositoryWithContext(repoUrl, options)).blueprint;
}

export async function analyzeRepositoryWithContext(repoUrl, options = {}) {
  if (options.useDemo) {
    const demoContext = getDemoRepositoryContext(repoUrl, "Demo fixture requested from the dashboard.");

    if (demoContext) {
      return {
        context: demoContext,
        blueprint: await analyzeContext(demoContext)
      };
    }
  }

  try {
    const repositoryContext = await fetchRepositoryFiles(repoUrl);
    return {
      context: repositoryContext,
      blueprint: await analyzeContext(repositoryContext)
    };
  } catch (error) {
    const demoContext = getDemoRepositoryContext(repoUrl, fallbackReason(error));

    if (demoContext) {
      return {
        context: demoContext,
        blueprint: await analyzeContext(demoContext)
      };
    }

    throw enrichError(error);
  }
}
