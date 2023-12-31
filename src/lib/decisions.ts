import { DECISION_LABEL, DECISIONS, type Decision, type DraftKind, type Tier } from "@/lib/types";

// What each decision means for the email. Pure, so the page and the server enforce the same rule.

export function parseDecision(value: unknown): Decision | null {
  return DECISIONS.find((decision) => decision === value) ?? null;
}

// The email a decision calls for: an invite for a shortlist, a rejection for a decline, none on hold.
export function kindFor(decision: Decision | null): DraftKind | null {
  if (decision === "shortlisted") return "invite";
  if (decision === "declined") return "rejection";
  return null;
}

// Why an email of this kind cannot be sent yet, or null when it can. An email only goes out
// when the founder has decided and the draft matches that decision.
export function sendBlock(decision: Decision | null, kind: DraftKind): string | null {
  if (decision === null) return "Decide first: shortlist to send an invite, or decline to send a rejection.";
  if (decision === "on_hold") return "This candidate is on hold, so there is no email to send. Shortlist or decline to continue.";
  const wanted = kindFor(decision);
  if (wanted !== kind) {
    return `Your decision is ${DECISION_LABEL[decision]}. Switch the draft to ${wanted === "invite" ? "an invite" : "a rejection"} to send it.`;
  }
  return null;
}

// Whether the founder's decision departs from what the AI recommended; shown as an audit hint.
export function differsFromRecommendation(decision: Decision | null, tier: Tier): boolean {
  if (decision === null) return false;
  const recommendsYes = tier === "Strong" || tier === "Good";
  if (decision === "shortlisted") return !recommendsYes;
  if (decision === "declined") return recommendsYes;
  return false;
}
