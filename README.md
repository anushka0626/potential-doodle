# RepoPilot

RepoPilot is a hackathon MVP for autonomous repository onboarding. A user enters a GitHub repository URL, the backend fetches important project files, specialized agents analyze the repo, and the dashboard returns an onboarding blueprint with setup steps, risks, confidence score, agent trace, a generated setup script, and an interactive Ask Repo follow-up agent.


## Stack

- React, Vite, JavaScript
- Tailwind CSS
- Node.js, Express
- OpenAI Responses API with local heuristic fallback

## Features

- Multi-agent analysis: Dependency, Environment, Infrastructure, and Onboarding agents.
- AI plus heuristic fallback so demos still work when AI is unavailable.
- Calibrated setup confidence score with visible score factors.
- Repository type detection for apps, libraries, monorepos, and native/cross-platform apps.
- OS-aware setup script generation for Windows and macOS/Linux.
- Ask Repo follow-up agent with citations.
- Shallow source discovery for implementation-location questions.
- Collapsible evaluation set with deterministic demo fixtures.
- Copy/download Markdown onboarding report.

## Setup

```bash
npm install
copy .env.example .env
npm run dev
```

Add `OPENAI_API_KEY` in `.env` to use AI agents. Without it, RepoPilot still runs with deterministic local heuristics for demo reliability.

Optional:

```bash
GITHUB_TOKEN=your_token
OPENAI_MODEL=gpt-4.1-mini
```

`GITHUB_TOKEN` raises GitHub API limits.

## Scripts

```bash
npm run dev       # Start Vite and Express
npm run build     # Build frontend
npm start         # Start Express API
```

## Deploy

RepoPilot can deploy as a single Node web service because Express serves the built `dist/` frontend and keeps APIs under `/api`.

Render settings:

- Service type: Web Service
- Build command: `npm install && npm run build`
- Start command: `npm start`
- Environment variables:
  - `OPENAI_API_KEY`
  - `GITHUB_TOKEN`
  - `OPENAI_MODEL` optional, for example `gpt-4.1-mini`

Do not commit `.env`; add secrets only in the hosting provider dashboard.

## Demo Repositories

The dashboard includes deterministic fixtures for:

- `expressjs/express`
- `supabase/supabase`
- `vitejs/vite`
- `openai/openai-node`
- `AppFlowy-IO/AppFlowy`
- `AnyaK393/AI-Innovation-Copilot`

## MVP Flow

1. Paste a GitHub repository URL.
2. Backend fetches important files like `README.md`, `package.json`, lockfiles, Docker files, and env templates.
3. Dependency, Environment, Infrastructure, and Onboarding agents run in parallel.
4. Aggregator combines results into one onboarding blueprint.
5. Dashboard displays confidence score, risks, agent trace, time saved, and setup script generation.
6. Ask Repo answers follow-up onboarding questions using the scanned repository context and cites the files it used.

## Known Limitations

- Source discovery is shallow and intentionally conservative; it fetches likely source files, not the full repository tree.
- Generated scripts are onboarding helpers, not guaranteed production provisioning scripts.
- Private repositories require a valid `GITHUB_TOKEN`.
- AI answers are citation-constrained, but repo-specific edge cases can still need manual review.
