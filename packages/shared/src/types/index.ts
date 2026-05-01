import type { ClinicalExtraction } from "../schemas/extraction.js";

export type Strategy = "zero_shot" | "few_shot" | "cot";

export type RunStatus = "pending" | "running" | "done" | "failed" | "paused";
export type CaseStatus = "pending" | "running" | "done" | "failed";

export interface FieldScore {
  score: number;
  details?: Record<string, unknown>;
}

export interface Metrics {
  chief_complaint: FieldScore;
  vitals: FieldScore;
  medications: FieldScore;
  diagnoses: FieldScore;
  plan: FieldScore;
  follow_up: FieldScore;
}

export interface HallucinationFlag {
  field_path: string;
  value: string;
  reason: string;
}

export interface TokenCounts {
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
}

export interface Attempt {
  id: string;
  case_result_id: string;
  attempt_no: number;
  request: Record<string, unknown>;
  response: Record<string, unknown> | null;
  validation_errors: string[] | null;
  tokens: TokenCounts | null;
  created_at: string;
}

export interface CaseResult {
  id: string;
  run_id: string;
  transcript_id: string;
  status: CaseStatus;
  prediction: ClinicalExtraction | null;
  gold: ClinicalExtraction;
  scores: Metrics | null;
  hallucination_flags: HallucinationFlag[];
  hallucination_count: number;
  schema_failed: boolean;
  attempts?: Attempt[];
}

export interface Run {
  id: string;
  strategy: Strategy;
  model: string;
  prompt_hash: string;
  status: RunStatus;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  cost_usd: number | null;
  started_at: string;
  finished_at: string | null;
  error: string | null;
  case_results?: CaseResult[];
}

export interface RunSummary {
  run: Omit<Run, "case_results">;
  case_count: number;
  done_count: number;
  failed_count: number;
  schema_fail_rate: number;
  hallucination_rate: number;
  cache_hit_rate: number;
  aggregate_scores: Partial<Record<keyof Metrics, number>>;
  total_cost_usd: number | null;
  wall_time_ms: number | null;
}

export interface DatasetCase {
  id: string;
  transcript: string;
  gold: ClinicalExtraction;
}
