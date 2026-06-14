const sessions = new Map();
const MAX_SESSIONS = 25;

function sessionId(repository) {
  const slug = `${repository?.owner || "repo"}-${repository?.repo || "analysis"}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `${slug}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function trimSessions() {
  while (sessions.size > MAX_SESSIONS) {
    const oldest = [...sessions.entries()].sort(([, a], [, b]) => a.createdAt - b.createdAt)[0]?.[0];

    if (!oldest) return;
    sessions.delete(oldest);
  }
}

export function saveAnalysisSession(context, blueprint) {
  const id = sessionId(context.repository);
  const storedBlueprint = {
    ...blueprint,
    analysisId: id
  };

  sessions.set(id, {
    id,
    context,
    blueprint: storedBlueprint,
    createdAt: Date.now()
  });
  trimSessions();

  return storedBlueprint;
}

export function getAnalysisSession(id) {
  if (!id || typeof id !== "string") {
    return null;
  }

  return sessions.get(id) || null;
}
