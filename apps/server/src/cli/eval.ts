import "dotenv/config";
import { parseArgs } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { startRun, getRun } from "../services/runner.service.js";
import { runEvents } from "../utils/events.js";
import type { Strategy } from "@healosbench/shared";

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      strategy: { type: "string" },
      model: { type: "string", default: "claude-haiku-4-5-20251001" },
      limit: { type: "string" },
      force: { type: "boolean", default: false },
    },
  });

  const strategy = values.strategy as Strategy;
  if (!strategy) {
    console.error("Usage: bun run eval --strategy=<strategy> [--model=<model>] [--limit=<n>] [--force]");
    process.exit(1);
  }

  const limit = values.limit ? parseInt(values.limit, 10) : undefined;
  
  console.log(`Starting run: strategy=${strategy}, model=${values.model}, limit=${limit ?? "all"}`);

  const startTime = Date.now();
  const { run_id } = await startRun({
    strategy,
    model: values.model as string,
    limit,
    force: values.force,
  });

  console.log(`Run ID: ${run_id}`);
  console.log("Listening for case completion events...\n");

  let completedCases = 0;

  runEvents.on(`case_completed:${run_id}`, (data: any) => {
    completedCases++;
    if (data.status === "failed") {
      console.log(`[${completedCases}] Case ${data.caseId} FAILED. Error: ${data.error}`);
    } else if (data.status.includes("cached")) {
      console.log(`[${completedCases}] Case ${data.caseId} completed (cached).`);
    } else {
      let f1Sum = 0;
      let count = 0;
      for (const key in data.scores) {
        f1Sum += data.scores[key].score;
        count++;
      }
      const avgF1 = count > 0 ? (f1Sum / count).toFixed(2) : "0.00";
      console.log(`[${completedCases}] Case ${data.caseId} completed. Avg F1: ${avgF1}`);
    }
  });

  return new Promise<void>((_resolve) => {
    runEvents.on(`run_completed:${run_id}`, async () => {
      console.log(`\nRun ${run_id} completed. Fetching results...`);
      
      const runData = await getRun(run_id);
      
      // Calculate aggregates
      let totalCases = 0;
      let failedSchema = 0;
      let casesWithHallucination = 0;
      
      const fieldScores: Record<string, { sum: number; count: number }> = {};
      
      for (const cr of runData.case_results) {
        totalCases++;
        if (cr.schema_failed) failedSchema++;
        if (cr.hallucination_count > 0) casesWithHallucination++;
        
        for (const metric of cr.metrics) {
          if (!fieldScores[metric.field_name]) {
            fieldScores[metric.field_name] = { sum: 0, count: 0 };
          }
          fieldScores[metric.field_name]!.sum += metric.score;
          fieldScores[metric.field_name]!.count++;
        }
      }
      
      console.log("\n=== EVALUATION SUMMARY ===\n");
      
      const summaryTable: any[] = [];
      for (const [field, stats] of Object.entries(fieldScores)) {
        summaryTable.push({
          Field: field,
          "Avg F1": (stats.sum / stats.count).toFixed(4),
        });
      }
      
      console.table(summaryTable);
      
      const wallTime = ((Date.now() - startTime) / 1000).toFixed(2);
      
      console.log(`\nOverall Stats:`);
      console.log(`Total Cases:       ${totalCases}`);
      console.log(`Schema Fail Rate:  ${((failedSchema / totalCases) * 100).toFixed(2)}% (${failedSchema})`);
      console.log(`Hallucination:     ${((casesWithHallucination / totalCases) * 100).toFixed(2)}% (${casesWithHallucination})`);
      console.log(`Total Cost:        $${Number(runData.cost_usd || 0).toFixed(6)}`);
      console.log(`Wall Time:         ${wallTime}s`);
      
      // Write JSON dump
      try {
        const resultsDir = join(process.cwd(), "../../results");
        await mkdir(resultsDir, { recursive: true });
        
        const dumpPath = join(resultsDir, `${run_id}.json`);
        await writeFile(dumpPath, JSON.stringify(runData, null, 2));
        console.log(`\nFull results dumped to: results/${run_id}.json`);
      } catch (err: any) {
        console.error("Failed to write results dump:", err.message);
      }
      
      // We force exit here because we have DB connections hanging around
      process.exit(0);
    });
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
