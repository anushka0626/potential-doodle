import "dotenv/config";
import express from "express";
import cors from "cors";
import { analyzeRepositoryWithContext } from "./services/analyzer.js";
import { saveAnalysisSession, getAnalysisSession } from "./services/analysisStore.js";
import { askRepositoryQuestion } from "./services/askRepoAgent.js";
import { listDemoEvaluations, runDemoEvaluations } from "./services/demoFixtures.js";
import { generateSetupScripts } from "./services/scriptGenerator.js";

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "RepoPilot API" });
});

app.get("/api/evaluations", (_req, res) => {
  res.json({ evaluations: listDemoEvaluations() });
});

app.post("/api/evaluations/run", async (_req, res) => {
  try {
    res.json(await runDemoEvaluations());
  } catch (error) {
    res.status(500).json({ error: error.message || "Evaluation run failed." });
  }
});

app.post("/api/analyze", async (req, res) => {
  try {
    const { repoUrl, useDemo } = req.body;

    if (!repoUrl || typeof repoUrl !== "string") {
      return res.status(400).json({ error: "A GitHub repository URL is required." });
    }

    const { context, blueprint } = await analyzeRepositoryWithContext(repoUrl, { useDemo: Boolean(useDemo) });
    res.json(saveAnalysisSession(context, blueprint));
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({
      error: error.message || "Repository analysis failed.",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }
});

app.post("/api/ask-repo", async (req, res) => {
  try {
    const { analysisId, question } = req.body;

    if (!analysisId || typeof analysisId !== "string") {
      return res.status(400).json({ error: "An analysisId from a completed repository analysis is required." });
    }

    if (!question || typeof question !== "string") {
      return res.status(400).json({ error: "A repository question is required." });
    }

    const session = getAnalysisSession(analysisId);

    if (!session) {
      return res.status(404).json({ error: "Analysis session was not found. Run the repository analysis again, then ask your question." });
    }

    res.json(await askRepositoryQuestion(session, question));
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ error: error.message || "Ask Repo failed." });
  }
});

app.post("/api/generate-script", async (req, res) => {
  try {
    const { blueprint } = req.body;

    if (!blueprint || typeof blueprint !== "object") {
      return res.status(400).json({ error: "A repository blueprint is required." });
    }

    res.json(generateSetupScripts(blueprint));
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not generate setup script." });
  }
});

app.listen(port, () => {
  console.log(`RepoPilot API running on http://localhost:${port}`);
});
