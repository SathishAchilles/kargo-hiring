import { z } from "zod";
import {
  INTEGRATION_CATEGORIES,
  OPS_DOMAINS,
  ROLE_TYPES,
  type Evidence,
} from "./schema";

// The schema sent to the API. Structured outputs compile it into a grammar, and
// every nullable or union multiplies its size, so this shape is flat: "" means
// "not stated" for strings, -1 for numbers, "unknown" for tri-state flags.
// toEvidence() turns it into the domain Evidence type.

const quote = z.string().describe("verbatim text copied from the CV that supports this fact");
const optionalText = (what: string) => z.string().describe(`${what}; "" if not stated`);
const optionalInt = (what: string) => z.number().int().describe(`${what}; -1 if not stated`);

export const wireSchema = z.object({
  roles: z.array(
    z.object({
      title: z.string(),
      company: optionalText("company name"),
      start: z.string().describe('"YYYY-MM"'),
      end: z.string().describe('"YYYY-MM", or "present" for a current role'),
      internship: z.boolean(),
      roleType: z.enum(ROLE_TYPES),
      opsDomain: z.enum(OPS_DOMAINS),
      companySizeBand: z.enum(["under_100", "100_plus", "unknown"]),
      soleOrFirstPm: z.boolean(),
      pmAbove: z.enum(["yes", "no", "unknown"]),
      pmsManaged: z.number().int(),
      productOwnership: z.boolean(),
      onsiteOpsImmersion: z.boolean(),
      builtProductPractice: z.boolean(),
      committeeDecisions: z.boolean(),
      quote,
    }),
  ),
  education: z.array(
    z.object({
      degree: z.string(),
      startYear: optionalInt("start year"),
      endYear: optionalInt("end year"),
      mode: z.enum(["full_time", "part_time", "executive", "online", "unknown"]),
      quote,
    }),
  ),
  shipped: z.array(
    z.object({
      what: z.string(),
      outcome: optionalText("stated result"),
      iterated: z.boolean(),
      roleIndex: optionalInt("index in roles"),
      quote,
    }),
  ),
  killed: z.array(
    z.object({ what: z.string(), reason: optionalText("stated reason"), sunkCost: z.boolean(), quote }),
  ),
  discovery: z.array(
    z.object({
      cadence: z.enum(["recurring", "occasional", "none"]),
      onsite: z.boolean(),
      withOpsUsers: z.boolean(),
      viaOtherTeamsOnly: z.boolean(),
      quote,
    }),
  ),
  integrations: z.array(
    z.object({
      system: z.string(),
      // platform_module = a product/module that runs inside customers' own systems (split out below)
      category: z.enum([...INTEGRATION_CATEGORIES, "platform_module"]),
      involvement: z.enum(["owned", "led", "contributed"]),
      commercialOutcome: optionalText("customers, deals, revenue or savings it unlocked"),
      quote,
    }),
  ),
  decisions: z.array(z.object({ what: z.string(), irreversible: z.boolean(), quote })),
  statedFigures: z.array(
    z.object({
      about: z.enum(["product_experience", "total_experience", "role"]),
      roleIndex: optionalInt("index in roles when about a role"),
      years: z.number(),
      quote,
    }),
  ),
  location: z.object({ text: optionalText("city"), quote: optionalText("supporting quote") }),
});

export type Wire = z.infer<typeof wireSchema>;

const text = (value: string) => (value.trim() === "" ? null : value);
const int = (value: number) => (value < 0 ? null : value);

export function toEvidence(wire: Wire): Evidence {
  return {
    roles: wire.roles.map((role) => ({
      ...role,
      company: text(role.company),
      end: role.end.trim().toLowerCase() === "present" ? "present" : role.end,
      companyHeadcount: null,
      companyStage: null,
      pmAbove: role.pmAbove === "unknown" ? null : role.pmAbove === "yes",
      pmsManaged: Math.max(0, role.pmsManaged),
    })),
    education: wire.education.map((item) => ({
      ...item,
      startYear: int(item.startYear),
      endYear: int(item.endYear),
    })),
    shipped: wire.shipped.map((item) => ({ ...item, outcome: text(item.outcome), roleIndex: int(item.roleIndex) })),
    killed: wire.killed.map((item) => ({ ...item, reason: text(item.reason) })),
    discovery: wire.discovery,
    integrations: wire.integrations
      .filter((item) => item.category !== "platform_module")
      .map((item) => ({
        ...item,
        category: item.category as Exclude<typeof item.category, "platform_module">,
        commercialOutcome: text(item.commercialOutcome),
      })),
    platforms: wire.integrations
      .filter((item) => item.category === "platform_module")
      .map((item) => ({ what: item.system, quote: item.quote })),
    decisions: wire.decisions,
    statedFigures: wire.statedFigures.map((item) => ({ ...item, roleIndex: int(item.roleIndex) })),
    location: { text: text(wire.location.text), quote: text(wire.location.quote) },
  };
}
