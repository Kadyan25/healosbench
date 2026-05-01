import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ClinicalExtractionSchema } from "@healosbench/shared";
import type { DatasetCase } from "@healosbench/shared";

const DATA_DIR = join(
  fileURLToPath(import.meta.url),
  "../../../../../data",
);

const TRANSCRIPTS_DIR = join(DATA_DIR, "transcripts");
const GOLD_DIR = join(DATA_DIR, "gold");

let _cache: DatasetCase[] | null = null;

async function loadAll(): Promise<DatasetCase[]> {
  if (_cache) return _cache;

  const files = await readdir(TRANSCRIPTS_DIR);
  const txtFiles = files.filter((f) => f.endsWith(".txt")).sort();

  const cases = await Promise.all(
    txtFiles.map(async (file) => {
      const id = file.replace(".txt", "");
      const transcriptPath = join(TRANSCRIPTS_DIR, file);
      const goldPath = join(GOLD_DIR, `${id}.json`);

      const [transcript, goldRaw] = await Promise.all([
        readFile(transcriptPath, "utf-8"),
        readFile(goldPath, "utf-8"),
      ]);

      const parsed = ClinicalExtractionSchema.safeParse(JSON.parse(goldRaw));
      if (!parsed.success) {
        throw new Error(
          `Gold file ${goldPath} failed schema validation: ${parsed.error.message}`,
        );
      }

      return { id, transcript, gold: parsed.data } satisfies DatasetCase;
    }),
  );

  _cache = cases;
  return cases;
}

export async function listCases(): Promise<DatasetCase[]> {
  return loadAll();
}

export async function getCase(id: string): Promise<DatasetCase> {
  const cases = await loadAll();
  const found = cases.find((c) => c.id === id);
  if (!found) throw new Error(`Case not found: ${id}`);
  return found;
}
