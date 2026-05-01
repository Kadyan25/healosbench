import { getRuns, type RunRow } from "@/lib/api";
import Link from "next/link";

export const dynamic = "force-dynamic";

function statusBadge(status: string) {
  const map: Record<string, string> = {
    running: "bg-yellow-100 text-yellow-800",
    done: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
    pending: "bg-gray-100 text-gray-600",
    paused: "bg-blue-100 text-blue-800",
  };
  return map[status] ?? "bg-gray-100 text-gray-600";
}

function duration(run: RunRow) {
  if (!run.finished_at) return "—";
  const ms = new Date(run.finished_at).getTime() - new Date(run.started_at).getTime();
  return `${(ms / 1000).toFixed(1)}s`;
}

export default async function RunsPage() {
  let runs: RunRow[] = [];
  let error: string | null = null;
  try {
    runs = await getRuns();
  } catch (e: any) {
    error = e.message;
  }

  return (
    <main className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Evaluation Runs</h1>
        <Link
          href="/compare"
          className="text-sm px-3 py-1.5 rounded-md bg-slate-800 text-white hover:bg-slate-700 transition-colors"
        >
          Compare runs →
        </Link>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 mb-4">
          Could not fetch runs: {error}
        </div>
      )}

      {runs.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">No runs yet. Start one via the CLI:</p>
      )}

      {runs.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Started</th>
                <th className="text-left px-4 py-3 font-medium">Strategy</th>
                <th className="text-left px-4 py-3 font-medium">Model</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-right px-4 py-3 font-medium">Cost (USD)</th>
                <th className="text-right px-4 py-3 font-medium">Duration</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {runs.map((run) => (
                <tr key={run.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">
                    {new Date(run.started_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-mono font-medium">{run.strategy}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground truncate max-w-[180px]">
                    {run.model}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge(run.status)}`}>
                      {run.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {run.cost_usd ? `$${Number(run.cost_usd).toFixed(4)}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{duration(run)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/runs/${run.id}`}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      View →
                    </Link>
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
