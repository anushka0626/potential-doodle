import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  Check,
  ChevronDown,
  Clipboard,
  Clock3,
  Code2,
  Copy,
  Database,
  Download,
  FileText,
  Gauge,
  Github,
  KeyRound,
  Loader2,
  MessageSquare,
  Play,
  Radar,
  Search,
  Send,
  Server,
  ShieldAlert,
  Sparkles,
  TerminalSquare
} from "lucide-react";

const sampleRepos = [
  "https://github.com/supabase/supabase",
  "https://github.com/vitejs/vite",
  "https://github.com/expressjs/express",
  "https://github.com/openai/openai-node"
];

const askSuggestions = [
  "How do I run this project?",
  "What environment variables are required?",
  "Which database is used?",
  "What should I read first?",
  "Where is authentication implemented?"
];

function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

function Pill({ children, tone = "slate" }) {
  const tones = {
    slate: "border-slate-700 bg-slate-900/70 text-slate-200",
    teal: "border-teal-400/30 bg-teal-400/10 text-teal-200",
    amber: "border-amber-400/30 bg-amber-400/10 text-amber-200",
    rose: "border-rose-400/30 bg-rose-400/10 text-rose-200",
    cyan: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200"
  };

  return (
    <span className={classNames("inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium", tones[tone])}>
      {children}
    </span>
  );
}

function Section({ icon: Icon, title, action, children, className }) {
  return (
    <section className={classNames("rounded-lg border border-slate-800 bg-slate-950/75 p-5 shadow-xl shadow-black/20", className)}>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-slate-800 bg-slate-900 text-teal-300">
            <Icon size={18} />
          </div>
          <h2 className="truncate text-sm font-semibold uppercase tracking-[0.16em] text-slate-300">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ text = "Waiting for analysis." }) {
  return <p className="text-sm text-slate-500">{text}</p>;
}

function ListBlock({ items, tone = "slate", empty = "None detected." }) {
  if (!items?.length) return <EmptyState text={empty} />;

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Pill key={item} tone={tone}>
          {item}
        </Pill>
      ))}
    </div>
  );
}

function ScoreRing({ score, summary }) {
  const color = score >= 80 ? "#2dd4bf" : score >= 60 ? "#f59e0b" : "#fb7185";

  return (
    <div className="flex items-center gap-5">
      <div
        className="grid h-28 w-28 shrink-0 place-items-center rounded-full"
        style={{
          background: `conic-gradient(${color} ${score * 3.6}deg, rgba(100,116,139,0.22) 0deg)`
        }}
      >
        <div className="grid h-[88px] w-[88px] place-items-center rounded-full bg-slate-950">
          <span className="text-3xl font-bold text-white">{score}%</span>
        </div>
      </div>
      <div>
        <p className="text-sm text-slate-400">Setup Confidence Score</p>
        <p className="mt-2 text-2xl font-semibold text-white">
          {score >= 80 ? "Ready to onboard" : score >= 60 ? "Needs a quick review" : "High-touch setup"}
        </p>
        {summary && <p className="mt-2 text-sm leading-6 text-slate-400">{summary}</p>}
      </div>
    </div>
  );
}

function ScoreFactors({ factors }) {
  if (!factors?.length) return <EmptyState />;

  const visible = factors
    .filter((factor) => factor.impact !== 0)
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
    .slice(0, 8);

  return (
    <div className="mt-5 space-y-2">
      {visible.map((factor) => (
        <div key={`${factor.label}-${factor.impact}`} className="flex items-start justify-between gap-3 rounded-md border border-slate-800 bg-slate-900/45 p-3">
          <div>
            <p className="text-sm font-medium text-slate-100">{factor.label}</p>
            {factor.detail && <p className="mt-1 text-xs leading-5 text-slate-500">{factor.detail}</p>}
          </div>
          <span
            className={classNames(
              "rounded-full border px-2.5 py-1 text-xs font-semibold",
              factor.impact > 0
                ? "border-teal-400/30 bg-teal-400/10 text-teal-200"
                : "border-rose-400/30 bg-rose-400/10 text-rose-200"
            )}
          >
            {factor.impact > 0 ? "+" : ""}
            {factor.impact}
          </span>
        </div>
      ))}
    </div>
  );
}

function ScoringMeta({ blueprint }) {
  if (!blueprint) return null;

  const agentModes = [
    ...new Set(
      (blueprint.agentTrace || [])
        .map((trace) => trace.mode || (trace.name === "AI Scoring Reviewer" ? "ai" : "unknown"))
        .filter((mode) => mode !== "unknown")
    )
  ];
  const agentModeLabel = agentModes.length
    ? agentModes.map((mode) => (mode === "ai" ? "AI" : "Heuristic")).join(" + ")
    : "Unknown";

  return (
    <div className="mt-4 grid gap-2 rounded-md border border-slate-800 bg-slate-900/45 p-3 text-sm text-slate-400">
      <div className="flex items-center justify-between gap-3">
        <span>Scoring mode</span>
        <span className="font-medium text-slate-100">{blueprint.scoringMode === "heuristic+ai" ? "Heuristic + AI" : "Heuristic"}</span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span>Agent mode</span>
        <span className="font-medium text-slate-100">{agentModeLabel}</span>
      </div>
      {blueprint.complexity && (
        <div className="flex items-center justify-between gap-3">
          <span>Complexity</span>
          <span className="font-medium text-slate-100">{blueprint.complexity}</span>
        </div>
      )}
      {typeof blueprint.heuristicConfidenceScore === "number" && (
        <div className="flex items-center justify-between gap-3">
          <span>Heuristic baseline</span>
          <span className="font-medium text-slate-100">{blueprint.heuristicConfidenceScore}%</span>
        </div>
      )}
    </div>
  );
}

function AgentTrace({ traces }) {
  if (!traces?.length) return <EmptyState />;

  return (
    <div className="space-y-3">
      {traces.map((trace) => (
        <details key={trace.name} className="group rounded-md border border-slate-800 bg-slate-900/55 p-4 open:border-teal-400/30">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
            <span className="font-medium text-slate-100">{trace.name}</span>
            <span className="flex shrink-0 items-center gap-2">
              {trace.mode && (
                <span
                  className={classNames(
                    "rounded-full border px-2.5 py-1 text-xs",
                    trace.mode === "ai"
                      ? "border-teal-400/30 bg-teal-400/10 text-teal-200"
                      : "border-amber-400/30 bg-amber-400/10 text-amber-200"
                  )}
                >
                  {trace.mode === "ai" ? "AI" : "Heuristic"}
                </span>
              )}
              <span className="rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-300">{trace.confidence}%</span>
            </span>
          </summary>
          <ul className="mt-3 space-y-2 text-sm text-slate-400">
            {trace.reasoning?.map((reason) => (
              <li key={reason} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-300" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}

function TimeSaved({ timeSaved }) {
  if (!timeSaved) return <EmptyState />;

  const rows = [
    ["Without RepoPilot", timeSaved.withoutRepoPilot],
    ["With RepoPilot", timeSaved.withRepoPilot],
    ["Time Saved", timeSaved.timeSaved]
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {rows.map(([label, value], index) => (
        <div key={label} className="rounded-md border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{label}</p>
          <p className={classNames("mt-2 text-2xl font-semibold", index === 2 ? "text-teal-200" : "text-white")}>{value}</p>
        </div>
      ))}
    </div>
  );
}

function FileSummary({ coverage, files }) {
  if (!coverage && !files?.length) return <EmptyState />;

  const found = coverage?.found || files.filter((file) => file.found).map((file) => ({ label: file.sourcePath || file.path }));
  const missing = coverage?.missingRelevant || files.filter((file) => !file.found).map((file) => ({ label: file.path }));
  const optionalMissingCount = coverage?.optionalMissingCount || 0;

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs uppercase tracking-[0.14em] text-slate-500">Found</p>
        <ListBlock items={found.map((file) => file.label)} tone="teal" empty="No target files found." />
      </div>
      <div>
        <p className="mb-2 text-xs uppercase tracking-[0.14em] text-slate-500">Relevant Missing</p>
        <ListBlock items={missing.map((file) => file.label)} tone="amber" empty="No relevant gaps found." />
      </div>
      {coverage && (
        <div className="rounded-md border border-slate-800 bg-slate-900/45 p-3 text-sm text-slate-500">
          {coverage.foundCount}/{coverage.scannedCount} scanned paths found
          {optionalMissingCount > 0 ? `, ${optionalMissingCount} optional misses hidden` : ""}
        </div>
      )}
    </div>
  );
}

function AskRepoPanel({ blueprint, messages, question, setQuestion, onAsk, isAsking, error }) {
  if (!blueprint) {
    return <EmptyState text="Run an analysis first, then ask follow-up questions about the repository." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {askSuggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onAsk(suggestion)}
            disabled={isAsking}
            className="rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-300 transition hover:border-teal-300 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {suggestion}
          </button>
        ))}
      </div>

      {messages.length > 0 && (
        <div className="space-y-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={classNames(
                "rounded-md border p-4 text-sm leading-6",
                message.role === "user"
                  ? "ml-auto max-w-2xl border-teal-400/30 bg-teal-400/10 text-teal-50"
                  : "border-slate-800 bg-slate-900/55 text-slate-200"
              )}
            >
              {message.role === "assistant" ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={message.mode === "ai" ? "teal" : "amber"}>{message.mode === "ai" ? "AI answer" : "Heuristic answer"}</Pill>
                    <Pill tone="cyan">{message.confidence}% confidence</Pill>
                  </div>
                  <p className="whitespace-pre-wrap">{message.answer}</p>
                  {message.citations?.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs uppercase tracking-[0.14em] text-slate-500">Evidence</p>
                      <div className="grid gap-2">
                        {message.citations.map((citation) => (
                          <div key={`${message.id}-${citation.path}-${citation.evidence}`} className="rounded-md border border-slate-800 bg-slate-950/70 p-3">
                            <p className="text-xs font-semibold text-teal-200">{citation.path}</p>
                            <p className="mt-1 text-xs leading-5 text-slate-400">{citation.evidence}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {message.followUps?.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {message.followUps.map((followUp) => (
                        <button
                          key={`${message.id}-${followUp}`}
                          type="button"
                          onClick={() => onAsk(followUp)}
                          disabled={isAsking}
                          className="rounded-md border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 transition hover:border-teal-300 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {followUp}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p>{message.content}</p>
              )}
            </div>
          ))}
          {isAsking && (
            <div className="inline-flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900/55 px-3 py-2 text-sm text-slate-400">
              <Loader2 className="animate-spin" size={16} />
              Reading repository context
            </div>
          )}
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          onAsk();
        }}
        className="grid gap-3 lg:grid-cols-[1fr_auto]"
      >
        <div className="relative">
          <MessageSquare className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            className="h-12 w-full rounded-md border border-slate-700 bg-slate-900 pl-11 pr-4 text-sm text-white outline-none transition focus:border-teal-300 focus:ring-2 focus:ring-teal-300/20"
            placeholder="Ask a question about this repository"
          />
        </div>
        <button
          type="submit"
          disabled={isAsking || !question.trim()}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-teal-300/50 bg-teal-300/10 px-4 text-sm font-semibold text-teal-100 transition hover:bg-teal-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isAsking ? <Loader2 className="animate-spin" size={17} /> : <Send size={17} />}
          Ask
        </button>
      </form>

      {error && (
        <div className="flex items-start gap-3 rounded-md border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-100">
          <ShieldAlert className="mt-0.5 shrink-0" size={17} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

function severityClasses(severity) {
  if (severity === "high") return "border-rose-400/30 bg-rose-400/10 text-rose-100";
  if (severity === "medium") return "border-amber-400/25 bg-amber-400/10 text-amber-100";
  return "border-slate-700 bg-slate-900/70 text-slate-300";
}

function markdownList(items, empty = "None detected.") {
  return items?.length ? items.map((item) => `- ${item}`).join("\n") : `- ${empty}`;
}

function buildMarkdownReport(blueprint) {
  if (!blueprint) return "";

  const repo = blueprint.repository ? `${blueprint.repository.owner}/${blueprint.repository.repo}` : "Repository";
  const risks = blueprint.riskDetails?.map((risk) => `${risk.message} (${risk.severity})`) || blueprint.risks || [];

  return [
    `# RepoPilot Onboarding Report: ${repo}`,
    "",
    `Repository: ${blueprint.repository?.webUrl || "Unknown"}`,
    `Branch: ${blueprint.repository?.defaultBranch || "Unknown"}`,
    `Repository Type: ${blueprint.repositoryInsights?.kindLabel || "Unknown"}`,
    `Setup Confidence: ${blueprint.confidenceScore}%`,
    `Complexity: ${blueprint.complexity || "Unknown"}`,
    `Estimated Setup Time: ${blueprint.estimatedSetupTime || "Unknown"}`,
    "",
    "## Summary",
    blueprint.scoreSummary || "No summary generated.",
    "",
    "## Stack",
    markdownList(blueprint.stack),
    "",
    `Runtime: ${blueprint.runtime || "Unknown"}`,
    `Package Manager: ${blueprint.packageManager || "Unknown"}`,
    "",
    "## Setup Steps",
    markdownList(blueprint.setupSteps),
    "",
    "## Commands",
    markdownList((blueprint.runCommands || []).map((command) => `\`${command}\``)),
    "",
    "## Environment",
    "Variables:",
    markdownList(blueprint.envVariables),
    "",
    "Secrets / required values:",
    markdownList(blueprint.missingSecrets, "No secret variables detected."),
    "",
    "## Services",
    markdownList([...(blueprint.services || []), ...(blueprint.infrastructure || [])], "No services detected."),
    "",
    "## Databases",
    markdownList(blueprint.databases, "No databases detected."),
    "",
    "## Risks",
    markdownList(risks, "No major risks detected."),
    "",
    "## Time Saved",
    `- Without RepoPilot: ${blueprint.timeSaved?.withoutRepoPilot || "Unknown"}`,
    `- With RepoPilot: ${blueprint.timeSaved?.withRepoPilot || "Unknown"}`,
    `- Time saved: ${blueprint.timeSaved?.timeSaved || "Unknown"}`,
    "",
    "## Agent Trace",
    markdownList((blueprint.agentTrace || []).map((trace) => `${trace.name}: ${trace.confidence}% (${trace.mode || "unknown"})`)),
    "",
    "_Generated by RepoPilot._"
  ].join("\n");
}

function SnapshotStrip({ blueprint }) {
  if (!blueprint) return null;

  const rows = [
    ["Score", `${blueprint.confidenceScore}%`],
    ["Type", blueprint.repositoryInsights?.kindLabel || "Unknown"],
    ["Complexity", blueprint.complexity || "Unknown"],
    ["Saved", blueprint.timeSaved?.timeSaved || "Unknown"]
  ];

  return (
    <div className="md:col-span-2 grid gap-3 sm:grid-cols-4">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-md border border-slate-800 bg-slate-900/55 p-3">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{label}</p>
          <p className="mt-1 truncate text-sm font-semibold text-white">{value}</p>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [repoUrl, setRepoUrl] = useState("");
  const [blueprint, setBlueprint] = useState(null);
  const [scriptBundle, setScriptBundle] = useState(null);
  const [activeScript, setActiveScript] = useState("unix");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [reportCopied, setReportCopied] = useState(false);
  const [evaluations, setEvaluations] = useState([]);
  const [evaluationRun, setEvaluationRun] = useState(null);
  const [isRunningEvaluations, setIsRunningEvaluations] = useState(false);
  const [isEvaluationSetOpen, setIsEvaluationSetOpen] = useState(false);
  const [askQuestion, setAskQuestion] = useState("");
  const [askMessages, setAskMessages] = useState([]);
  const [isAsking, setIsAsking] = useState(false);
  const [askError, setAskError] = useState("");

  const repoName = useMemo(() => {
    if (!blueprint?.repository) return "Repository";
    return `${blueprint.repository.owner}/${blueprint.repository.repo}`;
  }, [blueprint]);

  useEffect(() => {
    let ignore = false;

    async function loadEvaluations() {
      try {
        const response = await fetch("/api/evaluations");
        const data = await response.json();

        if (!ignore && response.ok) {
          setEvaluations(data.evaluations || []);
        }
      } catch {
        if (!ignore) setEvaluations([]);
      }
    }

    loadEvaluations();

    return () => {
      ignore = true;
    };
  }, []);

  async function runAnalysis(targetUrl, options = {}) {
    const normalizedUrl = targetUrl.trim();

    if (!normalizedUrl) return;

    setRepoUrl(normalizedUrl);
    setError("");
    setScriptBundle(null);
    setCopied(false);
    setReportCopied(false);
    setAskQuestion("");
    setAskMessages([]);
    setAskError("");
    setIsAnalyzing(true);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: normalizedUrl, useDemo: Boolean(options.useDemo) })
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Analysis failed.");

      setBlueprint(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function analyzeRepository(event) {
    event.preventDefault();
    await runAnalysis(repoUrl);
  }

  async function generateScript() {
    if (!blueprint) return;
    setIsGeneratingScript(true);
    setCopied(false);

    try {
      const response = await fetch("/api/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blueprint })
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Script generation failed.");

      setScriptBundle(
        data.scripts
          ? data
          : {
              scripts: {
                unix: {
                  label: "macOS / Linux",
                  fileName: "setup.sh",
                  content: data.script || ""
                }
              },
              warnings: []
            }
      );
      setActiveScript(data.scripts?.[activeScript] ? activeScript : "unix");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsGeneratingScript(false);
    }
  }

  async function runEvaluationChecks() {
    setIsRunningEvaluations(true);

    try {
      const response = await fetch("/api/evaluations/run", { method: "POST" });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Evaluation run failed.");

      setEvaluationRun(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsRunningEvaluations(false);
    }
  }

  async function askRepo(customQuestion) {
    const text = String(customQuestion || askQuestion).trim();

    if (!blueprint?.analysisId || !text || isAsking) return;

    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setAskMessages((current) => [...current, { id: `user-${stamp}`, role: "user", content: text }]);
    setAskQuestion("");
    setAskError("");
    setIsAsking(true);

    try {
      const response = await fetch("/api/ask-repo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId: blueprint.analysisId, question: text })
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Ask Repo failed.");

      setAskMessages((current) => [
        ...current,
        {
          id: `assistant-${stamp}`,
          role: "assistant",
          answer: data.answer,
          confidence: data.confidence,
          mode: data.mode,
          citations: data.citations || [],
          followUps: data.followUps || []
        }
      ]);
    } catch (err) {
      setAskError(err.message);
    } finally {
      setIsAsking(false);
    }
  }

  async function copyScript() {
    const selectedScript = scriptBundle?.scripts?.[activeScript];
    if (!selectedScript?.content) return;
    await navigator.clipboard.writeText(selectedScript.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  async function copyReport() {
    if (!blueprint) return;
    await navigator.clipboard.writeText(buildMarkdownReport(blueprint));
    setReportCopied(true);
    window.setTimeout(() => setReportCopied(false), 1400);
  }

  function downloadReport() {
    if (!blueprint) return;

    const report = buildMarkdownReport(blueprint);
    const slug = `${blueprint.repository?.owner || "repo"}-${blueprint.repository?.repo || "report"}`.toLowerCase();
    const blob = new Blob([report], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${slug}-onboarding-report.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const selectedScript = scriptBundle?.scripts?.[activeScript];

  return (
    <main className="min-h-screen bg-[#080b10] text-slate-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 border-b border-slate-800 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-lg border border-teal-400/30 bg-teal-400/10 text-teal-200 shadow-glow">
                <Radar size={23} />
              </div>
              <span className="text-sm font-semibold uppercase tracking-[0.24em] text-teal-200">RepoPilot</span>
            </div>
            <h1 className="max-w-3xl text-3xl font-semibold tracking-normal text-white sm:text-4xl">
              Autonomous repository onboarding agent
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Pill tone="teal">Parallel Agents</Pill>
            <Pill tone="cyan">Confidence Score</Pill>
            <Pill tone="amber">Setup Script</Pill>
          </div>
        </header>

        <Section icon={Github} title="Repository Input">
          <form onSubmit={analyzeRepository} className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <div className="relative">
              <Github className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input
                value={repoUrl}
                onChange={(event) => setRepoUrl(event.target.value)}
                className="h-12 w-full rounded-md border border-slate-700 bg-slate-900 pl-11 pr-4 text-sm text-white outline-none transition focus:border-teal-300 focus:ring-2 focus:ring-teal-300/20"
                placeholder="https://github.com/owner/repository"
              />
            </div>
            <button
              type="submit"
              disabled={isAnalyzing || !repoUrl.trim()}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-teal-300 px-5 text-sm font-semibold text-slate-950 transition hover:bg-teal-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isAnalyzing ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
              Analyze
            </button>
          </form>

          <div className="mt-3 flex flex-wrap gap-2">
            {(evaluations.length ? evaluations.map((item) => item.repoUrl) : sampleRepos).map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => setRepoUrl(sample)}
                className="rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-300 transition hover:border-slate-600 hover:text-white"
              >
                {sample.replace("https://github.com/", "")}
              </button>
            ))}
          </div>

          {evaluations.length > 0 && (
            <div className="mt-4 rounded-md border border-slate-800 bg-slate-900/45 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setIsEvaluationSetOpen((value) => !value)}
                  className="flex min-w-0 items-center gap-3 text-left"
                  aria-expanded={isEvaluationSetOpen}
                >
                  <ChevronDown
                    size={16}
                    className={classNames("shrink-0 text-slate-500 transition", isEvaluationSetOpen ? "rotate-0" : "-rotate-90")}
                  />
                  <span>
                    <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Evaluation Set</span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {evaluations.length} demo-safe repos
                      {evaluationRun ? `, ${evaluationRun.passed}/${evaluationRun.total} checks passed` : ""}
                    </span>
                  </span>
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={runEvaluationChecks}
                    disabled={isRunningEvaluations}
                    className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-xs text-slate-200 transition hover:border-teal-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isRunningEvaluations ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
                    Run Checks
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEvaluationSetOpen((value) => !value)}
                    className="rounded-md border border-slate-800 px-3 py-2 text-xs text-slate-300 transition hover:border-slate-600 hover:text-white"
                  >
                    {isEvaluationSetOpen ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              {evaluationRun && (
                <div className="mt-3 rounded-md border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300">
                  <span className={evaluationRun.failed ? "text-amber-200" : "text-teal-200"}>
                    {evaluationRun.passed}/{evaluationRun.total} checks passed
                  </span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {evaluationRun.results.map((result) => (
                      <Pill key={result.slug} tone={result.pass ? "teal" : "amber"}>
                        {result.slug}: {result.score}%
                      </Pill>
                    ))}
                  </div>
                </div>
              )}
              {isEvaluationSetOpen && (
                <div className="mt-3 grid gap-2 lg:grid-cols-2">
                  {evaluations.map((item) => (
                    <div key={item.slug} className="rounded-md border border-slate-800 bg-slate-950/60 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-100">{item.slug}</p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>
                        </div>
                        <Pill tone="cyan">
                          {item.expectedScoreRange[0]}-{item.expectedScoreRange[1]}%
                        </Pill>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => runAnalysis(item.repoUrl)}
                          disabled={isAnalyzing}
                          className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 transition hover:border-teal-300 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Live
                        </button>
                        <button
                          type="button"
                          onClick={() => runAnalysis(item.repoUrl, { useDemo: true })}
                          disabled={isAnalyzing}
                          className="rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs text-amber-100 transition hover:border-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Fixture
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="mt-4 flex items-start gap-3 rounded-md border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-100">
              <ShieldAlert className="mt-0.5 shrink-0" size={18} />
              <span>{error}</span>
            </div>
          )}
        </Section>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="grid gap-6">
            <Section icon={FileText} title="Repository Overview">
              {blueprint ? (
                <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
                  {blueprint.analysisMode === "demo-fixture" && (
                    <div className="md:col-span-2 rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
                      <div className="flex items-start gap-3">
                        <Sparkles className="mt-0.5 shrink-0" size={17} />
                        <div>
                          <p className="font-medium">Demo fixture loaded</p>
                          <p className="mt-1 text-amber-100/80">{blueprint.fallbackReason || "RepoPilot used curated demo evidence for this analysis."}</p>
                        </div>
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="text-2xl font-semibold text-white">{repoName}</p>
                    <a
                      href={blueprint.repository.webUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-2 text-sm text-teal-200 hover:text-teal-100"
                    >
                      <Github size={15} />
                      {blueprint.repository.webUrl}
                    </a>
                  </div>
                  <div className="rounded-md border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm text-slate-300">
                    Branch: <span className="font-semibold text-white">{blueprint.repository.defaultBranch}</span>
                  </div>
                  {blueprint.repositoryInsights?.isMonorepo && (
                    <div className="md:col-span-2">
                      <Pill tone="amber">Monorepo detected</Pill>
                      <p className="mt-2 text-sm text-slate-500">
                        {blueprint.repositoryInsights.indicators?.join(" | ")}
                      </p>
                    </div>
                  )}
                  {blueprint.repositoryInsights?.kindLabel && (
                    <div className="md:col-span-2">
                      <Pill tone="cyan">{blueprint.repositoryInsights.kindLabel}</Pill>
                    </div>
                  )}
                  <SnapshotStrip blueprint={blueprint} />
                </div>
              ) : (
                <EmptyState text={isAnalyzing ? "Analyzing repository files and agent output." : "Waiting for analysis."} />
              )}
            </Section>

            <Section icon={MessageSquare} title="Ask Repo">
              <AskRepoPanel
                blueprint={blueprint}
                messages={askMessages}
                question={askQuestion}
                setQuestion={setAskQuestion}
                onAsk={askRepo}
                isAsking={isAsking}
                error={askError}
              />
            </Section>

            <div className="grid gap-6 lg:grid-cols-2">
              <Section icon={Code2} title="Detected Stack">
                <div className="space-y-4">
                  <ListBlock items={blueprint?.stack} tone="cyan" />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-md border border-slate-800 bg-slate-900/50 p-3">
                      <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Runtime</p>
                      <p className="mt-1 font-medium text-white">{blueprint?.runtime || "Unknown"}</p>
                    </div>
                    <div className="rounded-md border border-slate-800 bg-slate-900/50 p-3">
                      <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Package Manager</p>
                      <p className="mt-1 font-medium text-white">{blueprint?.packageManager || "Unknown"}</p>
                    </div>
                  </div>
                </div>
              </Section>

              <Section icon={Boxes} title="Dependencies">
                <ListBlock items={blueprint?.dependencies?.slice(0, 18)} tone="slate" empty="No dependencies detected." />
              </Section>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Section icon={Server} title="Services & Infrastructure">
                <div className="space-y-4">
                  <div>
                    <p className="mb-2 text-xs uppercase tracking-[0.14em] text-slate-500">Services</p>
                    <ListBlock items={blueprint?.services} tone="amber" />
                  </div>
                  <div>
                    <p className="mb-2 text-xs uppercase tracking-[0.14em] text-slate-500">Infrastructure</p>
                    <ListBlock items={blueprint?.infrastructure} tone="cyan" />
                  </div>
                </div>
              </Section>

              <Section icon={Database} title="Databases">
                <ListBlock items={blueprint?.databases} tone="teal" />
              </Section>
            </div>

            <Section icon={KeyRound} title="Environment Variables">
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs uppercase tracking-[0.14em] text-slate-500">Detected</p>
                  <ListBlock items={blueprint?.envVariables} tone="cyan" />
                </div>
                <div>
                  <p className="mb-2 text-xs uppercase tracking-[0.14em] text-slate-500">Secrets</p>
                  <ListBlock items={blueprint?.missingSecrets} tone="rose" empty="No secret variables detected." />
                </div>
              </div>
            </Section>

            <Section icon={AlertTriangle} title="Risks">
              {blueprint?.riskDetails?.length ? (
                <div className="space-y-3">
                  {blueprint.riskDetails.map((risk) => (
                    <div key={risk.message} className={classNames("flex gap-3 rounded-md border p-3 text-sm", severityClasses(risk.severity))}>
                      <AlertTriangle className="mt-0.5 shrink-0" size={17} />
                      <div>
                        <span>{risk.message}</span>
                        <p className="mt-1 text-xs uppercase tracking-[0.14em] opacity-75">{risk.severity} risk</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState text={blueprint ? "No major risks detected." : "Waiting for analysis."} />
              )}
            </Section>
          </div>

          <aside className="grid content-start gap-6">
            <Section icon={Gauge} title="Setup Confidence Score">
              {blueprint ? (
                <>
                  <ScoreRing score={blueprint.confidenceScore} summary={blueprint.scoreSummary} />
                  <ScoringMeta blueprint={blueprint} />
                  <ScoreFactors factors={blueprint.scoreFactors} />
                </>
              ) : (
                <EmptyState />
              )}
            </Section>

            <Section icon={Clock3} title="Time Saved">
              <TimeSaved timeSaved={blueprint?.timeSaved} />
            </Section>

            <Section icon={FileText} title="Onboarding Report">
              {blueprint ? (
                <div className="space-y-3">
                  <div className="rounded-md border border-slate-800 bg-slate-900/50 p-4 text-sm leading-6 text-slate-400">
                    Export the current blueprint as a Markdown handoff for a new contributor or judge.
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={copyReport}
                      className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-teal-300 hover:text-white"
                    >
                      {reportCopied ? <Check size={15} /> : <Copy size={15} />}
                      {reportCopied ? "Copied" : "Copy Report"}
                    </button>
                    <button
                      type="button"
                      onClick={downloadReport}
                      className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-teal-300 hover:text-white"
                    >
                      <Download size={15} />
                      Download .md
                    </button>
                  </div>
                </div>
              ) : (
                <EmptyState text="Analyze a repository to export its onboarding report." />
              )}
            </Section>

            <Section
              icon={TerminalSquare}
              title="Setup Script Generator"
              action={
                <button
                  type="button"
                  onClick={generateScript}
                  disabled={!blueprint || isGeneratingScript}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-teal-300 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isGeneratingScript ? <Loader2 className="animate-spin" size={15} /> : <Play size={15} />}
                  Generate
                </button>
              }
            >
              {scriptBundle ? (
                <div className="overflow-hidden rounded-md border border-slate-800 bg-slate-950">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
                    <div className="flex rounded-md border border-slate-800 bg-slate-900 p-1">
                      {Object.entries(scriptBundle.scripts).map(([key, item]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            setActiveScript(key);
                            setCopied(false);
                          }}
                          className={classNames(
                            "rounded px-3 py-1.5 text-xs font-medium transition",
                            activeScript === key
                              ? "bg-teal-300 text-slate-950"
                              : "text-slate-400 hover:bg-slate-800 hover:text-white"
                          )}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={copyScript}
                      className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-xs text-slate-300 transition hover:bg-slate-800 hover:text-white"
                    >
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                      {copied ? "Copied" : `Copy ${selectedScript?.label || "Script"}`}
                    </button>
                  </div>
                  {scriptBundle.warnings?.length > 0 && (
                    <div className="border-b border-amber-400/20 bg-amber-400/10 px-4 py-3">
                      <div className="flex items-start gap-2 text-xs leading-5 text-amber-100">
                        <AlertTriangle className="mt-0.5 shrink-0" size={15} />
                        <div>
                          <p className="font-semibold">Pre-flight warnings</p>
                          <ul className="mt-1 space-y-1">
                            {scriptBundle.warnings.map((warning) => (
                              <li key={warning}>{warning}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="border-b border-slate-800 px-3 py-2">
                    <span className="text-xs text-slate-500">{selectedScript?.fileName || "setup"}</span>
                  </div>
                  <pre className="max-h-80 overflow-auto p-4 text-xs leading-6 text-slate-200">
                    <code>{selectedScript?.content || ""}</code>
                  </pre>
                </div>
              ) : (
                <div className="rounded-md border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-500">
                  <Clipboard className="mb-3 text-slate-400" size={20} />
                  Generated commands will appear here.
                </div>
              )}
            </Section>

            <Section icon={Sparkles} title="Agent Trace">
              <AgentTrace traces={blueprint?.agentTrace} />
            </Section>

            <Section icon={FileText} title="Repository Files">
              <FileSummary coverage={blueprint?.fileCoverage} files={blueprint?.files} />
            </Section>
          </aside>
        </div>
      </div>
    </main>
  );
}
