import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), "./apps/server/.env") });
import { extract } from "../src/index.js";
import { readFileSync } from "fs";

async function main() {
  const transcriptPath = resolve(process.cwd(), "./data/transcripts/case_001.txt");
  let transcript;
  try {
    transcript = readFileSync(transcriptPath, "utf-8");
  } catch (err) {
    console.error("Could not read case_001.txt:", err);
    process.exit(1);
  }

  console.log("Running zero_shot extraction...");
  const result1 = await extract(transcript, "zero_shot");
  console.log("Tokens 1:", result1.tokens);
  
  console.log("\nRunning zero_shot extraction again (to check cache)...");
  const result2 = await extract(transcript, "zero_shot");
  console.log("Tokens 2:", result2.tokens);
  
  console.log("\nCache read on run 2:", result2.tokens.cache_read_input_tokens);
  if (result2.tokens.cache_read_input_tokens! > 0) {
    console.log("✅ Caching is working correctly.");
  } else {
    console.error("❌ Caching is NOT working.");
  }

  console.log("\nExtraction result (run 2):");
  console.log(JSON.stringify(result2.extraction, null, 2));
}

main().catch(console.error);
