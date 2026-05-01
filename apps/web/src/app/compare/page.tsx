"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getRun, type RunDetail, type CaseResultRow } from "@/lib/api";
import Link from "next/link";

const FIELDS = ["chief_complaint","vitals","medications","diagnoses","plan","follow_up"] as const;

function avgF1(cases: CaseResultRow[], field: string): number | null {
  const scores = cases.map((c) => c.scores?.[field]?.score).filter((s): s is number => s != null);
  if (scores.length === 0) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

function hallucinationRate(cases: CaseResultRow[]): number {
  if (cases.length === 0) return 0;
  return cases.filter((c) => c.hallucination_count > 0).length / cases.length;
}

function schemaFailRate(cases: CaseResultRow[]): number {
  if (cases.length === 0) return 0;
  return cases.filter((c) => c.schema_failed).length / cases.length;
}

function CompareInner() {
  const params = useSearchParams();
  const aId = params.get("a");
  const bId = params.get("b");

  const [runA, setRunA] = useState<RunDetail | null>(null);
  const [runB, setRunB] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!aId || !bId) { setLoading(false); return; }
    Promise.all([getRun(aId), getRun(bId)])
      .then(([a, b]) => { setRunA(a); setRunB(b); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [aId, bId]);

  if (!aId || !bId) {
    return (
      <main className="p-6 max-w-7xl mx-auto">
        <h1 className="text-2xl font-semibold mb-3">Compare Runs</h1>
        <p className="text-sm text-muted-foreground mb-4">
          Pick two runs from the list, then navigate to{" "}
          <code className="bg-muted px-1 rounded">/compare?a=&lt;id&gt;&amp;b=&lt;id&gt;</code>.
        </p>
        <Link href="/runs" className="text-sm text-blue-600 hover:underline">← Go to runs</Link>
      </main>
    );
  }

  if (loading) return <main className="p-6"><p className="text-sm text-muted-foreground">Loading…</p></main>;
  if (error) return <main className="p-6"><p className="text-sm text-red-600">{error}</p></main>;
  if (!runA || !runB) return null;

  const labelA = `${runA.strategy} / ${runA.model.split("-").slice(0,3).join("-")}`;
  const labelB = `${runB.strategy} / ${runB.model.split("-").slice(0,3).join("-")}`;

  const fieldRows = FIELDS.map((f) => {
    const a = avgF1(runA.case_results, f);
    const b = avgF1(runB.case_results, f);
    const delta = a != null && b != null ? a - b : null;
    let winner: "A" | "B" | "tie" | null = null;
    if (delta != null) {
      if (Math.abs(delta) < 0.005) winner = "tie";
      else winner = delta > 0 ? "A" : "B";
    }
    return { field: f, a, b, delta, winner };
  });

  type CaseDiff = { id: string; aScore: number; bScore: number; diff: number; winner: "A"|"B"|"tie" };
  const caseDiffs: CaseDiff[] = [];
  const bCaseMap = new Map(runB.case_results.map((c) => [c.transcript_id, c]));
  for (const ca of runA.case_results) {
    const cb = bCaseMap.get(ca.transcript_id);
    if (!cb) continue;
    const aScore = ca.scores ? Object.values(ca.scores).reduce((s, m) => s + m.score, 0) / Object.values(ca.scores).length : 0;
    const bScore = cb.scores ? Object.values(cb.scores).reduce((s, m) => s + m.score, 0) / Object.values(cb.scores).length : 0;
    const diff = Math.abs(aScore - bScore);
    const winner: "A"|"B"|"tie" = diff < 0.005 ? "tie" : aScore > bScore ? "A" : "B";
    caseDiffs.push({ id: ca.transcript_id, aScore, bScore, diff, winner });
  }
  caseDiffs.sort((a, b) => b.diff - a.diff);

  return (
    <main className="p-6 max-w-7xl mx-auto space-y-8">
      <div>
        <Link href="/runs" className="text-xs text-muted-foreground hover:underline">← All runs</Link>
        <h1 className="text-2xl font-semibold mt-1">Compare Runs</h1>
        <div className="flex gap-6 mt-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full bg-blue-500" />
            <span className="font-mono font-medium">Run A</span>
            <span className="text-muted-foreground">— {labelA}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full bg-orange-500" />
            <span className="font-mono font-medium">Run B</span>
            <span className="text-muted-foreground">— {labelB}</span>
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Hallucination rate", a: `${(hallucinationRate(runA.case_results)*100).toFixed(1)}%`, b: `${(hallucinationRate(runB.case_results)*100).toFixed(1)}%` },
          { label: "Schema fail rate", a: `${(schemaFailRate(runA.case_results)*100).toFixed(1)}%`, b: `${(schemaFailRate(runB.case_results)*100).toFixed(1)}%` },
          { label: "Total cost", a: runA.cost_usd ? `$${Number(runA.cost_usd).toFixed(4)}` : "—", b: runB.cost_usd ? `$${Number(runB.cost_usd).toFixed(4)}` : "—" },
        ].map(({ label, a, b }) => (
          <div key={label} className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground mb-2">{label}</p>
            <div className="flex gap-4">
              <div><span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1.5" /><span className="font-semibold">{a}</span></div>
              <div><span className="inline-block w-2 h-2 rounded-full bg-orange-500 mr-1.5" /><span className="font-semibold">{b}</span></div>
            </div>
          </div>
        ))}
      </div>

      {/* Per-field paired bars */}
      <div className="rounded-lg border p-5">
        <h2 className="text-sm font-semibold mb-4">Per-field F1 — Run A vs Run B</h2>
        <div className="space-y-4">
          {fieldRows.map(({ field, a, b, delta, winner }) => (
            <div key={field}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono text-muted-foreground">{field}</span>
                <div className="flex items-center gap-2">
                  {winner && (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      winner === "A" ? "bg-blue-100 text-blue-700" :
                      winner === "B" ? "bg-orange-100 text-orange-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {winner === "tie" ? "tie" : `Run ${winner} wins`}
                    </span>
                  )}
                  {delta != null && (
                    <span className={`text-xs tabular-nums font-medium ${delta > 0 ? "text-blue-600" : delta < 0 ? "text-orange-600" : "text-gray-500"}`}>
                      {delta > 0 ? "+" : ""}{delta.toFixed(3)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-12 text-right text-xs tabular-nums text-blue-700 font-medium">{a?.toFixed(3) ?? "—"}</span>
                <div className="flex-1 bg-muted rounded-full h-2.5 overflow-hidden">
                  <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${((a ?? 0) * 100).toFixed(1)}%` }} />
                </div>
                <span className="text-xs text-muted-foreground w-4">A</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-12 text-right text-xs tabular-nums text-orange-700 font-medium">{b?.toFixed(3) ?? "—"}</span>
                <div className="flex-1 bg-muted rounded-full h-2.5 overflow-hidden">
                  <div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${((b ?? 0) * 100).toFixed(1)}%` }} />
                </div>
                <span className="text-xs text-muted-foreground w-4">B</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Case ranking */}
      {caseDiffs.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/50">
            <h2 className="text-sm font-semibold">Cases ranked by score difference</h2>
            <p className="text-xs text-muted-foreground">Highest divergence first</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-xs">Case</th>
                <th className="text-right px-4 py-2 font-medium text-xs text-blue-700">Run A avg F1</th>
                <th className="text-right px-4 py-2 font-medium text-xs text-orange-700">Run B avg F1</th>
                <th className="text-right px-4 py-2 font-medium text-xs">Δ</th>
                <th className="text-center px-4 py-2 font-medium text-xs">Winner</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {caseDiffs.map((cd) => (
                <tr key={cd.id} className="hover:bg-muted/20">
                  <td className="px-4 py-2 font-mono text-xs">{cd.id}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-xs text-blue-700 font-medium">{cd.aScore.toFixed(3)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-xs text-orange-700 font-medium">{cd.bScore.toFixed(3)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-xs font-medium">{cd.diff.toFixed(3)}</td>
                  <td className="px-4 py-2 text-center">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      cd.winner === "A" ? "bg-blue-100 text-blue-700" :
                      cd.winner === "B" ? "bg-orange-100 text-orange-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {cd.winner === "tie" ? "tie" : `Run ${cd.winner}`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<main className="p-6"><p className="text-sm text-muted-foreground">Loading…</p></main>}>
      <CompareInner />
    </Suspense>
  );
}
