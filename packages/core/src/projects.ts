// ── Project + prompt-record types ────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface PromptRecord {
  id: string;
  projectId: string;
  createdAt: string;
  input: string;
  output: string;
  provider: string;
  model: string;
  agent: string;
  durationMs: number | null;
  tokensUsed: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
  hadImage: boolean;
  hadRepoContext: boolean;
  /** User feedback on the refinement quality. */
  feedback?: 'up' | 'down';
}

export interface FewShotExample {
  input: string;
  output: string;
}

// ── Constructors ──────────────────────────────────────────────────────────────

export function createProject(name: string, description = ''): Project {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), name: name.trim(), description: description.trim(), createdAt: now, updatedAt: now };
}

export function createPromptRecord(
  projectId: string,
  fields: Omit<PromptRecord, 'id' | 'projectId' | 'createdAt'>
): PromptRecord {
  return { id: crypto.randomUUID(), projectId, createdAt: new Date().toISOString(), ...fields };
}

// ── Few-shot helpers ──────────────────────────────────────────────────────────

const MAX_EXAMPLE_CHARS = 600;

function truncate(text: string): string {
  return text.length > MAX_EXAMPLE_CHARS ? text.slice(0, MAX_EXAMPLE_CHARS) + '…' : text;
}

/** Take the most recent records and prepare them as few-shot examples.
 *  Capped at 3 to keep system prompt token cost manageable. */
export function buildFewShotExamples(records: PromptRecord[]): FewShotExample[] {
  return records.slice(0, 3).map((r) => ({
    input: truncate(r.input),
    output: truncate(r.output),
  }));
}

// ── Display helpers ───────────────────────────────────────────────────────────

export function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}
