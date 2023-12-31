import { z } from "zod";
import { DRAFT_MODEL, parseGated } from "@/lib/ai/client";
import type { Evidence } from "@/lib/evidence/schema";
import type { Pii } from "@/lib/pii/detect";
import { ROLE_LABEL, type Brief, type DraftKind, type RoleKey, type SubScore } from "@/lib/types";
import { assembleBrief, ruleBrief, type FlagSummary } from "./brief";

export const NAME_TOKEN = "{{first_name}}";

const draftSchema = z.object({
  summary: z.string().describe("two sentences on fit for the role, for the founder only"),
  probes: z.array(z.object({ criterion: z.string().describe("criterion id, e.g. P1"), question: z.string() })),
  subject: z.string(),
  body: z.string().describe(`plain-text email body that starts "Hi ${NAME_TOKEN}," and has no signature`),
  referencedFactIds: z.array(z.string()).describe("ids of the facts the email mentions, e.g. F3"),
});

const SYSTEM = `You help the founder of Kargo, a Series A freight-software company in Mumbai, hire product managers. You write two things for one candidate: private interview notes for the founder, and an email to the candidate.

Interview notes:
- summary: two plain sentences on how the candidate fits the role, based only on the facts given.
- probes: for each criterion listed under "Probe these", one open interview question that would test it with a concrete past example.

Email:
- Start with "Hi ${NAME_TOKEN}," and use ${NAME_TOKEN} for their name everywhere. End without a signature; it is added later.
- Mention at least one specific item from the candidate's own facts and list its id in referencedFactIds.
- invite: name the role, say what caught our attention, ask for their availability for a first conversation this week or next. Never promise an offer.
- rejection: thank them, say we are moving ahead with candidates whose experience is closer to what this role needs right now, wish them well, and be final. Never mention scores, tiers, rankings, other candidates, verification concerns, age, gender or education. Give no reason other than fit with the role's needs.
- Warm, direct, under 140 words. Plain text only.`;

export type DraftInput = {
  role: RoleKey;
  kind: DraftKind;
  pii: Pii;
  evidence: Evidence;
  subScores: SubScore[];
  flags: FlagSummary[];
};

export function factsFor(evidence: Evidence): { id: string; text: string }[] {
  const facts: string[] = [
    ...evidence.roles.map((role) => `Role: ${role.title}${role.company ? ` at ${role.company}` : ""} (${role.start} – ${role.end})`),
    ...evidence.shipped.map((item) => `Shipped: ${item.what}${item.outcome ? ` — ${item.outcome}` : ""}`),
    ...evidence.killed.map((item) => `Killed: ${item.what}${item.reason ? ` — ${item.reason}` : ""}`),
    ...evidence.integrations.map((item) => `Integration: ${item.system}${item.commercialOutcome ? ` — ${item.commercialOutcome}` : ""}`),
    ...evidence.discovery.map((item) => `Discovery: ${item.quote}`),
  ];
  return facts.map((text, index) => ({ id: `F${index + 1}`, text }));
}

export function buildUserMessage(input: DraftInput, rule: ReturnType<typeof ruleBrief>) {
  const facts = factsFor(input.evidence);
  return [
    `Role: ${ROLE_LABEL[input.role]}`,
    `Email type: ${input.kind}`,
    "",
    "Facts from the candidate's CV:",
    ...facts.map((fact) => `${fact.id}. ${fact.text}`),
    "",
    "Strongest criteria:",
    ...rule.strengths.map((item) => `- ${item.criterion}: ${item.evidence}`),
    "",
    "Probe these:",
    ...rule.weak.map((item) => `- ${item.id} ${item.name} (currently: ${item.anchor})`),
  ].join("\n");
}

// ---- content rules ------------------------------------------------------------------

const FORBIDDEN_IN_REJECTION = [
  /\d+\s*\/\s*100/,
  /\bscor(e|es|ed|ing)\b/i,
  /\btier\b/i,
  /\brank(ed|ing)?\b/i,
  /\bshortlist/i,
  /\bduplicate\b/i,
  /\bplaceholder\b/i,
  /\boverlap/i,
  /\bmismatch/i,
  /\b(university|college|institute|IIT|IIM|NIT|MBA|degree)\b/i,
  /\b(age|gender|young|old)\b/i,
];

export function draftProblems(
  kind: DraftKind,
  draft: { subject: string; body: string; referencedFactIds: string[] },
  factIds: Set<string>,
  flags: FlagSummary[] = [],
) {
  const problems: string[] = [];
  const text = `${draft.subject}\n${draft.body}`;
  if (!draft.body.trimStart().startsWith(`Hi ${NAME_TOKEN}`)) problems.push("does not open with the name placeholder");
  if (!draft.referencedFactIds.some((id) => factIds.has(id))) problems.push("does not reference the candidate's own facts");
  if (kind === "rejection") {
    for (const pattern of FORBIDDEN_IN_REJECTION) if (pattern.test(text)) problems.push(`mentions ${pattern.source}`);
    for (const flag of flags) {
      const quote = typeof flag.detail.quote === "string" ? flag.detail.quote : null;
      if (quote && text.toLowerCase().includes(quote.toLowerCase().slice(0, 30))) problems.push("repeats flagged text");
    }
  }
  return problems;
}

export function firstName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

export function fillName(text: string, name: string): string {
  return text.split(NAME_TOKEN).join(firstName(name));
}

export type GeneratedDraft = {
  kind: DraftKind;
  subject: string;
  body: string;
  brief: Brief;
  needsManualEdit: boolean;
};

export async function generateDraft(input: DraftInput, signature = process.env.FOUNDER_SIGNATURE ?? "Kargo"): Promise<GeneratedDraft> {
  const rule = ruleBrief(input.role, input.subScores, input.flags, input.evidence);
  const factIds = new Set(factsFor(input.evidence).map((fact) => fact.id));
  const user = buildUserMessage(input, rule);

  let draft = await parseGated({ pii: input.pii, model: DRAFT_MODEL, system: SYSTEM, user, schema: draftSchema, effort: "medium", maxTokens: 8000 });
  let problems = draftProblems(input.kind, draft, factIds, input.flags);
  if (problems.length) {
    const retryUser = `${user}\n\nYour previous email broke these rules: ${problems.join("; ")}. Write it again.`;
    draft = await parseGated({ pii: input.pii, model: DRAFT_MODEL, system: SYSTEM, user: retryUser, schema: draftSchema, effort: "medium", maxTokens: 8000 });
    problems = draftProblems(input.kind, draft, factIds, input.flags);
  }

  return {
    kind: input.kind,
    subject: fillName(draft.subject, input.pii.name),
    body: `${fillName(draft.body, input.pii.name).trimEnd()}\n\n${signature}`,
    brief: assembleBrief(rule, draft),
    needsManualEdit: problems.length > 0,
  };
}
