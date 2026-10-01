import { z } from "zod";

// The evidence record is the only thing scoring reads. The AI fills it from
// redacted CV text; every fact carries a verbatim quote so it can be checked.

export const ROLE_TYPES = [
  "product",
  "founder",
  "operations",
  "consulting",
  "engineering",
  "analytics",
  "design",
  "marketing",
  "sales",
  "program",
  "other",
] as const;

export const OPS_DOMAINS = ["freight", "adjacent_physical", "desk", "none"] as const;

export const INTEGRATION_CATEGORIES = [
  "carrier",
  "customs_port",
  "erp",
  "payment",
  "data_platform",
  "other",
] as const;

// Kept to plain types: structured outputs support a subset of JSON Schema, so
// month format and quote support are enforced in code after parsing (verify.ts).
export const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const month = z.string().describe('"YYYY-MM"; a year alone is "YYYY-01" for a start and "YYYY-12" for an end');
const quote = z.string().describe("verbatim text copied from the CV that supports this fact");

export const roleSchema = z.object({
  title: z.string(),
  company: z.string().nullable(),
  start: month,
  end: z.union([month, z.literal("present")]),
  internship: z.boolean(),
  roleType: z.enum(ROLE_TYPES),
  opsDomain: z.enum(OPS_DOMAINS),
  companyHeadcount: z.number().int().nullable(),
  companySizeBand: z.enum(["under_100", "100_plus", "unknown"]),
  companyStage: z.string().nullable(),
  soleOrFirstPm: z.boolean(),
  pmAbove: z.boolean().nullable(),
  pmsManaged: z.number().int(),
  productOwnership: z.boolean(),
  onsiteOpsImmersion: z.boolean(),
  builtProductPractice: z.boolean(),
  committeeDecisions: z.boolean(),
  quote,
});

export const educationSchema = z.object({
  degree: z.string(),
  startYear: z.number().int().nullable(),
  endYear: z.number().int().nullable(),
  mode: z.enum(["full_time", "part_time", "executive", "online", "unknown"]),
  quote,
});

export const shippedSchema = z.object({
  what: z.string(),
  outcome: z.string().nullable(),
  iterated: z.boolean(),
  roleIndex: z.number().int().nullable(),
  quote,
});

export const killedSchema = z.object({
  what: z.string(),
  reason: z.string().nullable(),
  sunkCost: z.boolean(),
  quote,
});

export const discoverySchema = z.object({
  cadence: z.enum(["recurring", "occasional", "none"]),
  onsite: z.boolean(),
  withOpsUsers: z.boolean(),
  viaOtherTeamsOnly: z.boolean(),
  quote,
});

export const integrationSchema = z.object({
  system: z.string(),
  category: z.enum(INTEGRATION_CATEGORIES),
  involvement: z.enum(["owned", "led", "contributed"]),
  commercialOutcome: z.string().nullable(),
  quote,
});

export const platformSchema = z.object({
  what: z.string(),
  quote,
});

export const decisionSchema = z.object({
  what: z.string(),
  irreversible: z.boolean(),
  quote,
});

export const statedFigureSchema = z.object({
  about: z.enum(["product_experience", "total_experience", "role"]),
  roleIndex: z.number().int().nullable(),
  years: z.number(),
  quote,
});

export const evidenceSchema = z.object({
  roles: z.array(roleSchema),
  education: z.array(educationSchema),
  shipped: z.array(shippedSchema),
  killed: z.array(killedSchema),
  discovery: z.array(discoverySchema),
  integrations: z.array(integrationSchema),
  platforms: z.array(platformSchema),
  decisions: z.array(decisionSchema),
  statedFigures: z.array(statedFigureSchema),
  location: z.object({ text: z.string().nullable(), quote: z.string().nullable() }),
});

export type Evidence = z.infer<typeof evidenceSchema>;
export type Role = z.infer<typeof roleSchema>;
export type Education = z.infer<typeof educationSchema>;
