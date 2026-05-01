import { getRun } from "@/lib/api";
import Link from "next/link";
import { notFound } from "next/navigation";
import RunDetailClient from "./RunDetailClient";

export const dynamic = "force-dynamic";

const FIELDS = ["chief_complaint","vitals","medications","diagnoses","plan","follow_up"] as const;

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let run;
  try {
    run = await getRun(id);
  } catch {
    notFound();
  }

  // Aggregate per-field F1
  const fieldTotals: Record<string, { sum: number; count: number }> = {};
  let totalInputTokens = 0;
  let totalCacheRead = 0;

  for (const cr of run.case_results) {
    for (const m of cr.metrics) {
      if (!fieldTotals[m.field_name]) fieldTotals[m.field_name] = { sum: 0, count: 0 };
      fieldTotals[m.field_name]!.sum += m.score;
      fieldTotals[m.field_name]!.count++;
    }
  }

  totalInputTokens = run.input_tokens ?? 0;
  totalCacheRead = run.cache_read_tokens ?? 0;
  const cacheHitRate = totalInputTokens > 0
    ? ((totalCacheRead / (totalInputTokens + totalCacheRead)) * 100).toFixed(1)
    : "0.0";

  const doneCount = run.case_results.filter((c) => c.status === "done").length;
  const hallucinatedCount = run.case_results.filter((c) => c.hallucination_count > 0).length;
  const schemaFailCount = run.case_results.filter((c) => c.schema_failed).length;
  const total = run.case_results.length;

  return (
    <main className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/runs" className="text-xs text-muted-foreground hover:underline">← All runs</Link>
          <h1 className="text-xl font-semibold mt-1 font-mono">{run.strategy} / {run.model}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{run.id}</p>
        </div>
        <span className={`text-sm px-3 py-1 rounded-full font-medium ${
          run.status === "done" ? "bg-green-100 text-green-800" :
          run.status === "running" ? "bg-yellow-100 text-yellow-800" :
          "bg-red-100 text-red-800"
        }`}>{run.status}</span>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        {[
          { label: "Cases", value: `${doneCount}/${total}` },
          { label: "Schema fails", value: schemaFailCount.toString() },
          { label: "Hallucinations", value: `${hallucinatedCount} cases` },
          { label: "Cache hit rate", value: `${cacheHitRate}%`, highlight: true },
          { label: "Cost", value: run.cost_usd ? `$${Number(run.cost_usd).toFixed(4)}` : "—" },
          { label: "Tokens in", value: run.input_tokens?.toLocaleString() ?? "—" },
        ].map(({ label, value, highlight }) => (
          <div key={label} className={`rounded-lg border p-3 ${highlight ? "border-blue-300 bg-blue-50" : ""}`}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-lg font-semibold tabular-nums ${highlight ? "text-blue-700" : ""}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Per-field aggregate bars */}
      <div className="rounded-lg border p-4">
        <h2 className="text-sm font-medium mb-3">Aggregate F1 per field</h2>
        <div className="space-y-2">
          {FIELDS.map((f) => {
            const t = fieldTotals[f];
            const avg = t ? t.sum / t.count : 0;
            return (
              <div key={f} className="flex items-center gap-3">
                <span className="w-36 text-xs font-mono text-muted-foreground shrink-0">{f}</span>
                <div className="flex-1 bg-muted rounded-full h-2.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${avg >= 0.8 ? "bg-green-500" : avg >= 0.5 ? "bg-yellow-500" : "bg-red-500"}`}
                    style={{ width: `${(avg * 100).toFixed(1)}%` }}
                  />
                </div>
                <span className="w-12 text-right text-xs tabular-nums font-medium">
                  {t ? avg.toFixed(3) : "—"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Case table (client — handles SSE + drawer) */}
      <RunDetailClient
        runId={run.id}
        initialStatus={run.status}
        initialCases={run.case_results as any}
      />
    </main>
  );
}
