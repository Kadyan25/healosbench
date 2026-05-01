import { z } from "zod";

export const VitalsSchema = z.object({
  bp: z.string().nullable(),
  hr: z.number().int().nullable(),
  temp_f: z.number().nullable(),
  spo2: z.number().int().nullable(),
});

export const MedicationSchema = z.object({
  name: z.string().min(1),
  dose: z.string().nullable(),
  frequency: z.string().nullable(),
  route: z.string().nullable(),
});

export const DiagnosisSchema = z.object({
  description: z.string().min(1),
  icd10: z.string().optional(),
});

export const FollowUpSchema = z.object({
  interval_days: z.number().int().nullable(),
  reason: z.string().nullable(),
});

export const ClinicalExtractionSchema = z.object({
  chief_complaint: z.string().min(1),
  vitals: VitalsSchema,
  medications: z.array(MedicationSchema),
  diagnoses: z.array(DiagnosisSchema),
  plan: z.array(z.string().min(1)),
  follow_up: FollowUpSchema,
});

export type Vitals = z.infer<typeof VitalsSchema>;
export type Medication = z.infer<typeof MedicationSchema>;
export type Diagnosis = z.infer<typeof DiagnosisSchema>;
export type FollowUp = z.infer<typeof FollowUpSchema>;
export type ClinicalExtraction = z.infer<typeof ClinicalExtractionSchema>;
