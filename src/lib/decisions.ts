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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2 Oct 2026", in UTC so the server and the browser print the same text.
export function formatDay(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

// One sentence on where the candidate stands and what happens next, shown above the decision buttons.
export function decisionStatus(decision: Decision | null, decidedAt?: Date | string | null): string {
  if (decision === null) return "Not decided. No email will be sent until you decide and click Send.";
  const when = decidedAt ? ` on ${formatDay(decidedAt)}` : "";
  if (decision === "shortlisted") return `You shortlisted this candidate${when}. An interview invite is ready to review and send.`;
  if (decision === "declined") return `You declined this candidate${when}. A respectful rejection is ready to review and send.`;
  return `You put this candidate on hold${when}. No email is sent while they are on hold.`;
}
