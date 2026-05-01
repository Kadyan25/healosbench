const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    credentials: "include",
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

// ---- type-safe helpers ----

export type RunRow = {
  id: string;
  strategy: string;
  model: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  cost_usd: string | null;
  prompt_hash: string;
  error: string | null;
};

export type MetricRow = { id: string; field_name: string; score: number; details: unknown };

export type AttemptRow = {
  id: string;
  attempt_no: number;
  request: unknown;
  response: unknown;
  validation_errors: string[] | null;
  tokens: unknown;
};

export type CaseResultRow = {
  id: string;
  run_id: string;
  transcript_id: string;
  status: string;
  prediction: Record<string, unknown> | null;
  gold: Record<string, unknown>;
  scores: Record<string, { score: number; details?: unknown }> | null;
  hallucination_flags: Array<{ field_path: string; value: string; reason: string }>;
  hallucination_count: number;
  schema_failed: boolean;
  metrics: MetricRow[];
  attempts: AttemptRow[];
};

export type RunDetail = RunRow & { case_results: CaseResultRow[] };

export function getRuns(): Promise<RunRow[]> {
  return apiFetch<RunRow[]>("/api/v1/runs");
}

export function getRun(id: string): Promise<RunDetail> {
  return apiFetch<RunDetail>(`/api/v1/runs/${id}`);
}
