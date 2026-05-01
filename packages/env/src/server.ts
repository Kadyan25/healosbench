import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

// Synchronously load .env from apps/server using an absolute path so CWD doesn't matter.
// dotenvx v17 is async; we parse the file ourselves to guarantee synchronous availability.
try {
  // import.meta.dir = D:\Healosbench\packages\env\src — go up 3 to repo root
  const envPath = join(import.meta.dir, "../../..", "apps/server/.env");
  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    if (key && !process.env[key]) process.env[key] = val;
  }
} catch {
  // No .env file — rely on pre-set environment variables
}

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CORS_ORIGIN: z.url(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    ANTHROPIC_API_KEY: z.string().min(1),
    COST_CAP_USD: z.coerce.number().default(1.50),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
