"use client";

import { useEffect, useRef, useState } from "react";
import type { CaseResultRow } from "@/lib/api";

type Props = {
  runId: string;
  initialStatus: string;
  initialCases: CaseResultRow[];
};

export default function RunDetailClient({ runId, initialStatus, initialCases }: Props) {
  const [cases, setCases] = useState<CaseResultRow[]>(initialCases);
  const [selectedCase, setSelectedCase] = useState<CaseResultRow | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (initialStatus !== "running") return;
    const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
    const es = new EventSource(`${base}/api/v1/runs/${runId}/events`);
    esRef.current = es;

    es.addEventListener("case_completed", (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setCases((prev) =>
        prev.map((c) =>
          c.id === data.caseId
            ? { ...c, status: data.status === "done (cached)" ? "done" : data.status, scores: data.scores ?? c.scores }
            : c
        )
      );
    });

    es.addEventListener("run_completed", () => {
      es.close();
    });

    return () => es.close();
  }, [runId, initialStatus]);

  return (
    <>
      {/* Case table */}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Case ID</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
              {["chief_complaint","vitals","medications","diagnoses","plan","follow_up"].map((f) => (
                <th key={f} className="text-right px-3 py-2 font-medium text-xs">{f.replace("_"," ")}</th>
              ))}
              <th className="text-right px-3 py-2 font-medium">Halluc.</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {cases.map((cr) => (
              <tr
                key={cr.id}
                className="hover:bg-muted/30 cursor-pointer transition-colors"
                onClick={() => setSelectedCase(cr)}
              >
                <td className="px-4 py-2 font-mono text-xs">{cr.transcript_id}</td>
                <td className="px-4 py-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    cr.status === "done" ? "bg-green-100 text-green-800" :
                    cr.status === "failed" ? "bg-red-100 text-red-800" :
                    "bg-yellow-100 text-yellow-800"
                  }`}>{cr.status}</span>
                </td>
                {["chief_complaint","vitals","medications","diagnoses","plan","follow_up"].map((f) => {
                  const s = cr.scores?.[f];
                  return (
                    <td key={f} className="px-3 py-2 text-right tabular-nums text-xs">
                      {s != null ? (
                        <span className={s.score >= 0.8 ? "text-green-700" : s.score >= 0.5 ? "text-yellow-700" : "text-red-600"}>
                          {s.score.toFixed(2)}
                        </span>
                      ) : "—"}
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-right text-xs">
                  {cr.hallucination_count > 0
                    ? <span className="text-red-600 font-semibold">{cr.hallucination_count}</span>
                    : <span className="text-muted-foreground">0</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Drawer */}
      {selectedCase && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setSelectedCase(null)} />
          <div className="w-[780px] bg-background shadow-2xl overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-semibold text-sm">Case: {selectedCase.transcript_id}</h2>
              <button
                onClick={() => setSelectedCase(null)}
                className="text-muted-foreground hover:text-foreground text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 p-6 space-y-6">
              {/* Hallucination flags */}
              {selectedCase.hallucination_flags.length > 0 && (
                <section>
                  <h3 className="font-medium text-sm mb-2 text-red-600">Hallucination Flags</h3>
                  <div className="space-y-1">
                    {selectedCase.hallucination_flags.map((f, i) => (
                      <div key={i} className="text-xs rounded bg-red-50 border border-red-200 px-3 py-2">
                        <span className="font-mono font-medium">{f.field_path}</span>: {f.value}
                        <span className="text-red-500 ml-2">— {f.reason}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Gold vs Predicted diff */}
              <section>
                <h3 className="font-medium text-sm mb-2">Gold vs Predicted</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-medium">Gold</p>
                    <pre className="text-xs bg-muted rounded p-3 overflow-auto max-h-80 leading-relaxed">
                      {JSON.stringify(selectedCase.gold, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-medium">Predicted</p>
                    <pre className="text-xs bg-muted rounded p-3 overflow-auto max-h-80 leading-relaxed">
                      {selectedCase.prediction
                        ? JSON.stringify(selectedCase.prediction, null, 2)
                        : <span className="text-red-500">Schema failed — no extraction</span>}
                    </pre>
                  </div>
                </div>

                {/* Field-level delta */}
                {selectedCase.scores && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {Object.entries(selectedCase.scores).map(([field, metric]) => (
                      <div key={field} className="rounded border px-3 py-2 text-xs">
                        <p className="font-mono text-muted-foreground mb-0.5">{field}</p>
                        <p className={`font-semibold text-base ${metric.score >= 0.8 ? "text-green-600" : metric.score >= 0.5 ? "text-yellow-600" : "text-red-600"}`}>
                          {metric.score.toFixed(3)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Attempts trace */}
              {selectedCase.attempts?.length > 0 && (
                <section>
                  <h3 className="font-medium text-sm mb-2">Attempts ({selectedCase.attempts.length})</h3>
                  <div className="space-y-2">
                    {selectedCase.attempts.map((a) => (
                      <details key={a.id} className="rounded border text-xs">
                        <summary className="px-3 py-2 cursor-pointer font-medium select-none">
                          Attempt #{a.attempt_no}
                          {a.validation_errors?.length
                            ? <span className="ml-2 text-red-500">({a.validation_errors.length} validation errors)</span>
                            : <span className="ml-2 text-green-600">✓ success</span>}
                        </summary>
                        <div className="border-t px-3 py-2 space-y-2">
                          {a.validation_errors && a.validation_errors.length > 0 && (
                            <div>
                              <p className="font-medium text-red-600 mb-1">Validation errors:</p>
                              {a.validation_errors.map((e, i) => (
                                <p key={i} className="font-mono text-red-500">{e}</p>
                              ))}
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-muted-foreground mb-1">Tokens:</p>
                            <pre className="bg-muted rounded p-2 overflow-auto">{JSON.stringify(a.tokens, null, 2)}</pre>
                          </div>
                        </div>
                      </details>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
