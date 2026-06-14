#RepoPilot — Autonomous Repository Onboarding Agent

Build a hackathon MVP called **RepoPilot**.

##Core Problem

Developers waste hours onboarding to repositories.

Documentation is incomplete, outdated, or spread across multiple files.

RepoPilot acts as an autonomous onboarding agent that analyzes a repository and produces everything a new contributor needs to start working immediately.

---

## Tech Stack

Frontend:

* React
* Vite
* JavaScript
* Tailwind CSS

Backend:

* Node.js
* Express

AI:

* OpenAI Responses API
* Multiple specialized agents
* No TypeScript
* No LangChain
* No CrewAI
* No AutoGen

Implement agent orchestration manually.

---

## User Flow

1. User pastes a GitHub repository URL.
2. Application fetches important repository files.
3. Multiple agents analyze the repository in parallel.
4. Results are aggregated.
5. User receives a complete onboarding blueprint.

---

## Repository Files To Analyze

Attempt to fetch and inspect:

* README.md
* package.json
* package-lock.json
* yarn.lock
* pnpm-lock.yaml
* requirements.txt
* pyproject.toml
* Dockerfile
* docker-compose.yml
* docker-compose.yaml
* .env.example
* .env.template
* next.config.js
* vite.config.js
* tsconfig.json
* Procfile

Handle missing files gracefully.

---

## Agent Architecture

Create separate prompts and execution paths for:

### 1. Dependency Agent

Responsibilities:

* Detect language
* Detect framework
* Detect package manager
* Detect runtime versions
* Detect dependencies

Output:

{
stack: [],
runtime: "",
packageManager: "",
dependencies: [],
confidence: number,
reasoning: []
}

---

### 2. Environment Agent

Responsibilities:

* Detect environment variables
* Detect required secrets
* Detect missing configuration

Output:

{
envVariables: [],
missingSecrets: [],
confidence: number,
reasoning: []
}

---

### 3. Infrastructure Agent

Responsibilities:

* Detect databases
* Detect Redis
* Detect Docker
* Detect services
* Detect containers
* Detect external dependencies

Output:

{
services: [],
databases: [],
infrastructure: [],
confidence: number,
reasoning: []
}

---

### 4. Onboarding Agent

Responsibilities:

* Generate setup instructions
* Generate run commands
* Estimate onboarding complexity
* Estimate onboarding time

Output:

{
setupSteps: [],
runCommands: [],
estimatedSetupTime: "",
confidence: number,
reasoning: []
}

---

## Aggregator Agent

Combine outputs from all agents.

Generate a final repository onboarding blueprint.

Output:

{
stack: [],
runtime: "",
packageManager: "",
dependencies: [],
envVariables: [],
missingSecrets: [],
services: [],
databases: [],
setupSteps: [],
runCommands: [],
risks: [],
confidenceScore: number
}

---

## Confidence Score System

Generate a Setup Confidence Score.

Example:

72%

Factors:

Positive:

* package.json found
* Dockerfile found
* README found
* env example found

Negative:

* missing env variables
* undocumented services
* conflicting versions
* missing setup instructions

Return a numeric score from 0-100.

---

## Risk Analysis

Generate a dedicated Risks section.

Examples:

* Docker Compose references Redis but Redis config not found.
* PostgreSQL service detected but no migration instructions found.
* Missing environment variables.
* No setup documentation.

---

## Agent Trace Panel

For transparency, display reasoning from each agent.

Example:

Agent: Dependency Analyzer

Reasoning:

* Found package.json
* Found Dockerfile
* Detected Node 22

Confidence:
94%

Display similar traces for all agents.

---

## Setup Script Generator

Create a button:

Generate Setup Script

When clicked:

Generate a repository-specific setup script.

Example:

npm install

cp .env.example .env

docker compose up -d

npm run dev

Display script inside a code block with copy functionality.

---

## Additional Metric

Display:

Estimated Onboarding Time

Example:

Without RepoPilot:
45 minutes

With RepoPilot:
5 minutes

Time Saved:
40 minutes

---

## UI Requirements

Dark modern dashboard.

Sections:

1. Repository Input
2. Repository Overview
3. Detected Stack
4. Services & Infrastructure
5. Environment Variables
6. Setup Confidence Score
7. Risks
8. Agent Trace
9. Setup Script Generator
10. Time Saved

Use cards and clean layout.

The UI should look impressive for hackathon judging.

---

## Priority

Focus on:

1. Working demo
2. Agent orchestration
3. Confidence score
4. Agent trace visualization
5. Setup script generation

Do NOT build:

* actual provisioning
* VM creation
* Docker execution
* Kubernetes deployment
* cloud infrastructure

This is an onboarding intelligence agent, not an infrastructure automation platform.

Build the MVP as quickly as possible with clean architecture and production-looking UI.
