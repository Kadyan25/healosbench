import { Hono } from "hono";
import { stream } from "hono/streaming";
import { startRun, resumeRun, getRun } from "../services/runner.service.js";
import { runEvents } from "../utils/events.js";
import type { Strategy } from "@healosbench/shared";

export const runsRouter = new Hono();

runsRouter.post("/", async (c) => {
  const body = await c.req.json();
  const opts = {
    strategy: body.strategy as Strategy,
    model: body.model || "claude-haiku-4-5-20251001",
    limit: body.limit ? parseInt(body.limit, 10) : undefined,
    force: !!body.force,
  };

  const result = await startRun(opts);
  return c.json(result);
});

runsRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  try {
    const run = await getRun(id);
    return c.json(run);
  } catch (err: any) {
    return c.json({ error: err.message }, 404);
  }
});

runsRouter.post("/:id/resume", async (c) => {
  const id = c.req.param("id");
  try {
    await resumeRun(id);
    return c.json({ status: "resumed" });
  } catch (err: any) {
    return c.json({ error: err.message }, 404);
  }
});

runsRouter.get("/:id/events", (c) => {
  const id = c.req.param("id");
  c.header("Content-Type", "text/event-stream");
  c.header("Cache-Control", "no-cache");
  c.header("Connection", "keep-alive");

  return stream(c, async (stream) => {
    // We must listen for events
    let isConnected = true;

    const onCaseComplete = async (data: any) => {
      if (!isConnected) return;
      await stream.write(`event: case_completed\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const onRunComplete = async (data: any) => {
      if (!isConnected) return;
      await stream.write(`event: run_completed\ndata: ${JSON.stringify(data)}\n\n`);
      isConnected = false;
      await stream.close();
    };

    runEvents.on(`case_completed:${id}`, onCaseComplete);
    runEvents.on(`run_completed:${id}`, onRunComplete);

    // Keep connection open
    stream.onAbort(() => {
      isConnected = false;
      runEvents.off(`case_completed:${id}`, onCaseComplete);
      runEvents.off(`run_completed:${id}`, onRunComplete);
    });

    while (isConnected) {
      await stream.sleep(1000);
    }
  });
});
