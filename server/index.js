import "dotenv/config";
import express from "express";
import cors from "cors";
import { analyzeRepository } from "./services/analyzer.js";
import { generateSetupScript } from "./services/scriptGenerator.js";

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "RepoPilot API" });
});

app.post("/api/analyze", async (req, res) => {
  try {
    const { repoUrl } = req.body;

    if (!repoUrl || typeof repoUrl !== "string") {
      return res.status(400).json({ error: "A GitHub repository URL is required." });
    }

    const result = await analyzeRepository(repoUrl);
    res.json(result);
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({
      error: error.message || "Repository analysis failed.",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }
});

app.post("/api/generate-script", async (req, res) => {
  try {
    const { blueprint } = req.body;

    if (!blueprint || typeof blueprint !== "object") {
      return res.status(400).json({ error: "A repository blueprint is required." });
    }

    res.json({ script: generateSetupScript(blueprint) });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not generate setup script." });
  }
});

app.listen(port, () => {
  console.log(`RepoPilot API running on http://localhost:${port}`);
});
