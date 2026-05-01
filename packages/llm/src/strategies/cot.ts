import type { Strategy } from "@healosbench/shared";

export const cotStrategy = {
  id: "cot" as Strategy,
  system: `You are an expert clinical data extractor. Your task is to extract structured information from a medical transcript into a specific JSON schema.
  
Follow these instructions:
1. Extract the patient's chief complaint.
2. Extract any vitals taken during the visit.
3. Extract all medications prescribed or advised (including over-the-counter).
4. Extract all diagnoses made or discussed.
5. Extract the treatment plan items.
6. Extract follow-up instructions, if any.

Only extract information explicitly stated in the transcript. Do not invent or guess any details.
If a piece of information is missing, use null or omit it according to the schema.`,
  userTemplate: `Extract the clinical data from the following transcript. Before calling the extraction tool, please think step-by-step in a <scratchpad> about what information you need to extract from each section of the transcript to ensure no details are missed and the mapping is exact.

<transcript>
{{TRANSCRIPT}}
</transcript>`,
};
