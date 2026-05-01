import { zodToJsonSchema } from "zod-to-json-schema";
import { z } from "zod";

const VitalsSchema = z.object({
  bp: z.string().nullable(),
  hr: z.number().int().nullable(),
  temp_f: z.number().nullable(),
  spo2: z.number().int().nullable(),
});

const MedicationSchema = z.object({
  name: z.string().min(1),
  dose: z.string().nullable(),
  frequency: z.string().nullable(),
  route: z.string().nullable(),
});

const DiagnosisSchema = z.object({
  description: z.string().min(1),
  icd10: z.string().optional(),
});

const FollowUpSchema = z.object({
  interval_days: z.number().int().nullable(),
  reason: z.string().nullable(),
});

const ClinicalExtractionSchema = z.object({
  chief_complaint: z.string().min(1),
  vitals: VitalsSchema,
  medications: z.array(MedicationSchema),
  diagnoses: z.array(DiagnosisSchema),
  plan: z.array(z.string().min(1)),
  follow_up: FollowUpSchema,
});

console.log(JSON.stringify(zodToJsonSchema(ClinicalExtractionSchema), null, 2));
