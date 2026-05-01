import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const runs = pgTable("runs", {
  id: text("id").primaryKey(),
  strategy: text("strategy").notNull(),
  model: text("model").notNull(),
  prompt_hash: text("prompt_hash").notNull(),
  status: text("status").notNull().default("pending"),
  input_tokens: integer("input_tokens"),
  output_tokens: integer("output_tokens"),
  cache_read_tokens: integer("cache_read_tokens"),
  cache_write_tokens: integer("cache_write_tokens"),
  cost_usd: numeric("cost_usd", { precision: 10, scale: 6 }),
  started_at: timestamp("started_at").defaultNow().notNull(),
  finished_at: timestamp("finished_at"),
  error: text("error"),
});

export const caseResults = pgTable(
  "case_results",
  {
    id: text("id").primaryKey(),
    run_id: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    transcript_id: text("transcript_id").notNull(),
    // SHA-256(strategy:model:prompt_hash) — idempotency key component
    strategy_hash: text("strategy_hash").notNull(),
    status: text("status").notNull().default("pending"),
    prediction: jsonb("prediction"),
    gold: jsonb("gold").notNull(),
    scores: jsonb("scores"),
    hallucination_flags: jsonb("hallucination_flags").notNull().default("[]"),
    hallucination_count: integer("hallucination_count").notNull().default(0),
    schema_failed: boolean("schema_failed").notNull().default(false),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("case_results_run_transcript_idx").on(
      table.run_id,
      table.transcript_id,
    ),
    index("case_results_idempotency_idx").on(
      table.strategy_hash,
      table.transcript_id,
    ),
    index("case_results_run_id_idx").on(table.run_id),
  ],
);

export const attempts = pgTable(
  "attempts",
  {
    id: text("id").primaryKey(),
    case_result_id: text("case_result_id")
      .notNull()
      .references(() => caseResults.id, { onDelete: "cascade" }),
    attempt_no: integer("attempt_no").notNull(),
    request: jsonb("request").notNull(),
    response: jsonb("response"),
    validation_errors: jsonb("validation_errors"),
    tokens: jsonb("tokens"),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("attempts_case_result_id_idx").on(table.case_result_id)],
);

export const metricsPerField = pgTable(
  "metrics_per_field",
  {
    id: text("id").primaryKey(),
    case_result_id: text("case_result_id")
      .notNull()
      .references(() => caseResults.id, { onDelete: "cascade" }),
    field_name: text("field_name").notNull(),
    score: real("score").notNull(),
    details: jsonb("details"),
  },
  (table) => [
    index("metrics_per_field_case_result_id_idx").on(table.case_result_id),
  ],
);

export const runsRelations = relations(runs, ({ many }) => ({
  case_results: many(caseResults),
}));

export const caseResultsRelations = relations(caseResults, ({ one, many }) => ({
  run: one(runs, {
    fields: [caseResults.run_id],
    references: [runs.id],
  }),
  attempts: many(attempts),
  metrics: many(metricsPerField),
}));

export const attemptsRelations = relations(attempts, ({ one }) => ({
  case_result: one(caseResults, {
    fields: [attempts.case_result_id],
    references: [caseResults.id],
  }),
}));

export const metricsPerFieldRelations = relations(metricsPerField, ({ one }) => ({
  case_result: one(caseResults, {
    fields: [metricsPerField.case_result_id],
    references: [caseResults.id],
  }),
}));
