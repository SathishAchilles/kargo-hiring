import type { Evidence } from "@/lib/evidence/schema";
import { RUBRICS } from "@/lib/scoring/rubric";
import type { Brief, DraftKind, FlagType, RoleKey, SubScore, Tier } from "@/lib/types";

// The parts of the brief decided by rules, not by AI (interview-brief-and-email spec).

export const KILL_QUESTION = "Tell me about something you shipped and then killed.";

export type FlagSummary = { type: FlagType; detail: Record<string, unknown> };

export function defaultKind(tier: Tier): DraftKind {
  return tier === "Strong" || tier === "Good" ? "invite" : "rejection";
}

const criterionName = (role: RoleKey, id: string) =>
  RUBRICS[role].find((criterion) => criterion.id === id)?.name ?? id;

// Highest scores first; ties keep rubric order, so heavier criteria win.
export function strongest(subScores: SubScore[], count = 2): SubScore[] {
  return subScores
    .map((item, index) => ({ item, index }))
    .sort((a, b) => b.item.score - a.item.score || a.index - b.index)
    .slice(0, count)
    .map(({ item }) => item);
}

export function weakest(subScores: SubScore[], count = 2): SubScore[] {
  return subScores
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.score - b.item.score || a.index - b.index)
    .slice(0, count)
    .map(({ item }) => item);
}

// Neutral wording: a flag is a question to ask, never an accusation.
export function verificationQuestion(flag: FlagSummary): string {
  const detail = flag.detail;
  switch (flag.type) {
    case "duplicate":
      return "Another CV we received is almost identical to this one. Please confirm this CV was written for you and walk us through your own roles.";
    case "placeholder":
      return `The CV contains what looks like an unfinished figure ("${String(detail.quote ?? "")}"). What is the actual number?`;
    case "identity_mismatch":
      return "The profile link on the CV appears to belong to a different name. Can you share your current profile link?";
    case "education_overlap":
      return `Walk me through the dates of ${String(detail.role ?? "this role")} alongside ${String(detail.degree ?? "your degree")}.`;
    case "stated_vs_dated":
      return `The CV says ${String(detail.stated)} years in one place and the dates show ${String(detail.dated)} years. Which is right?`;
  }
}

export function ruleBrief(role: RoleKey, subScores: SubScore[], flags: FlagSummary[], evidence: Evidence) {
  const strengths = strongest(subScores).map((item) => ({
    criterion: `${item.criterion} ${criterionName(role, item.criterion)}`,
    evidence: item.quotes[0] ?? item.anchor,
  }));
  const weak = weakest(subScores).map((item) => ({
    id: item.criterion,
    name: criterionName(role, item.criterion),
    anchor: item.anchor,
  }));
  const verification = flags.map(verificationQuestion);
  if (!evidence.killed.length) verification.push(KILL_QUESTION);
  return { strengths, weak, verification };
}

export function assembleBrief(
  rule: ReturnType<typeof ruleBrief>,
  ai: { summary: string; probes: { criterion: string; question: string }[] },
): Brief {
  const probes = rule.weak.map((item) => ({
    criterion: `${item.id} ${item.name}`,
    question:
      ai.probes.find((probe) => probe.criterion.startsWith(item.id))?.question ??
      `What is your strongest example for "${item.name.toLowerCase()}"?`,
  }));
  return { summary: ai.summary, strengths: rule.strengths, probes, verification: rule.verification };
}
