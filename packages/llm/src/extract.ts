import { Anthropic } from "@anthropic-ai/sdk";

import { ClinicalExtractionSchema } from "@healosbench/shared";
import type { ClinicalExtraction, Strategy } from "@healosbench/shared";
import type { TokenCounts } from "./cost.js";
import { getPromptHash } from "./hash.js";
import { zeroShotStrategy } from "./strategies/zero_shot.js";
import { fewShotStrategy } from "./strategies/few_shot.js";
import { cotStrategy } from "./strategies/cot.js";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface AttemptLog {
  request: any;
  response: any;
  validation_errors: string[] | null;
  tokens: TokenCounts | null;
}

export interface ExtractResult {
  extraction: ClinicalExtraction | null;
  attempts: AttemptLog[];
  tokens: TokenCounts;
  promptHash: string;
  wallTimeMs: number;
}

export const STRATEGIES: Record<string, any> = {
  zero_shot: zeroShotStrategy,
  few_shot: fewShotStrategy,
  cot: cotStrategy,
} as const;

export async function extract(
  transcript: string,
  strategyId: Strategy,
  opts?: { signal?: AbortSignal; model?: string }
): Promise<ExtractResult> {
  const startTime = Date.now();
  const strategy = STRATEGIES[strategyId];
  if (!strategy) throw new Error(`Unknown strategy: ${strategyId}`);

  const promptHash = getPromptHash(strategy);
  const model = opts?.model ?? "claude-3-haiku-20240307";

  // Prepare system prompt
  const systemBlocks: Array<Anthropic.TextBlockParam> = [];
  
  if (strategy.examples && strategy.examples.length > 0) {
    systemBlocks.push({
      type: "text",
      text: strategy.system,
    });
    
    // Format examples
    const examplesText = strategy.examples.map((ex: any) => 
      `<example>\n<transcript>\n${ex.transcript}\n</transcript>\n<extraction>\n${JSON.stringify(ex.extraction, null, 2)}\n</extraction>\n</example>`
    ).join("\n\n");
    
    systemBlocks.push({
      type: "text",
      text: `Here are some examples of correctly extracted data:\n\n${examplesText}`,
      cache_control: { type: "ephemeral" }
    });
  } else {
    systemBlocks.push({
      type: "text",
      text: strategy.system,
      cache_control: { type: "ephemeral" }
    });
  }

  const toolSchema = {
    type: "object",
    properties: {
      chief_complaint: { type: "string" },
      vitals: {
        type: "object",
        properties: {
          bp: { type: ["string", "null"] },
          hr: { type: ["integer", "null"] },
          temp_f: { type: ["number", "null"] },
          spo2: { type: ["integer", "null"] },
        },
        required: ["bp", "hr", "temp_f", "spo2"],
        additionalProperties: false,
      },
      medications: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            dose: { type: ["string", "null"] },
            frequency: { type: ["string", "null"] },
            route: { type: ["string", "null"] },
          },
          required: ["name", "dose", "frequency", "route"],
          additionalProperties: false,
        },
      },
      diagnoses: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            icd10: { type: "string" },
          },
          required: ["description"],
          additionalProperties: false,
        },
      },
      plan: {
        type: "array",
        items: { type: "string" },
      },
      follow_up: {
        type: "object",
        properties: {
          interval_days: { type: ["integer", "null"] },
          reason: { type: ["string", "null"] },
        },
        required: ["interval_days", "reason"],
        additionalProperties: false,
      },
    },
    required: ["chief_complaint", "vitals", "medications", "diagnoses", "plan", "follow_up"],
    additionalProperties: false,
  };
  
  // Create user message
  const userText = strategy.userTemplate
    ? strategy.userTemplate.replace("{{TRANSCRIPT}}", transcript)
    : `Extract the clinical data from the following transcript:\n\n<transcript>\n${transcript}\n</transcript>`;

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userText }
  ];

  const attempts: AttemptLog[] = [];
  const totalTokens: TokenCounts = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };

  let extraction: ClinicalExtraction | null = null;
  const maxAttempts = 3;

  for (let attemptNo = 1; attemptNo <= maxAttempts; attemptNo++) {
    const requestPayload: Anthropic.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: strategyId === "cot" ? 1024 : 1000,
      system: systemBlocks,
      messages,
      tools: [
        {
          name: "extract_clinical_data",
          description: "Extract structured clinical data from the transcript",
          input_schema: toolSchema as any,
        }
      ],
      tool_choice: { type: "tool", name: "extract_clinical_data" },
    };

    let response: Anthropic.Messages.Message;
    try {
      response = await client.messages.create(requestPayload, {
        signal: opts?.signal,
      });
    } catch (err) {
      // Collect basic failure info
      attempts.push({
        request: requestPayload,
        response: { error: err instanceof Error ? err.message : String(err) },
        validation_errors: null,
        tokens: null,
      });
      throw err; // e.g. 429, let caller handle
    }

    const usage = response.usage;
    const tokens: TokenCounts = {
      input_tokens: usage.input_tokens || 0,
      output_tokens: usage.output_tokens || 0,
      cache_creation_input_tokens: (usage as any).cache_creation_input_tokens || 0,
      cache_read_input_tokens: (usage as any).cache_read_input_tokens || 0,
    };

    totalTokens.input_tokens += tokens.input_tokens;
    totalTokens.output_tokens += tokens.output_tokens;
    totalTokens.cache_creation_input_tokens! += tokens.cache_creation_input_tokens || 0;
    totalTokens.cache_read_input_tokens! += tokens.cache_read_input_tokens || 0;

    const toolCall = response.content.find((c: any) => c.type === "tool_use") as Anthropic.ToolUseBlock;
    let validation_errors: string[] | null = null;

    if (toolCall) {
      const parseResult = ClinicalExtractionSchema.safeParse(toolCall.input);
      if (parseResult.success) {
        extraction = parseResult.data;
      } else {
        validation_errors = (parseResult.error as any).errors.map((e: any) => `${e.path.join('.')}: ${e.message}`);
      }
    } else {
      validation_errors = ["Model did not call the extract_clinical_data tool."];
    }

    attempts.push({
      request: requestPayload,
      response,
      validation_errors,
      tokens,
    });

    if (extraction) {
      break; // Success
    }

    // Prepare retry
    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: `Your previous output failed validation:\n${validation_errors?.join('\n')}\nPlease correct and call the tool again.`
    });
  }

  return {
    extraction,
    attempts,
    tokens: totalTokens,
    promptHash,
    wallTimeMs: Date.now() - startTime,
  };
}
