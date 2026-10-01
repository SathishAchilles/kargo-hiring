export type RoleKey = "pm" | "spm";

export const ROLE_LABEL: Record<RoleKey, string> = { pm: "PM", spm: "Senior PM" };

export type CandidateStatus =
  | "uploaded"
  | "extracting"
  | "preparing"
  | "evidence"
  | "scoring"
  | "ready"
  | "needs_ocr"
  | "failed";

// The AI's recommendation band for a total. Shortlisting itself is the founder's decision, so these
// are deliberately not worded as actions.
export type Tier = "Strong" | "Good" | "Partial" | "Weak";

export const TIERS: Tier[] = ["Strong", "Good", "Partial", "Weak"];

export const TIER_LABEL: Record<Tier, string> = {
  Strong: "Strong match",
  Good: "Good match",
  Partial: "Partial match",
  Weak: "Weak match",
};

export type SuggestedRole = "below_band" | "pm" | "pm_or_spm" | "spm";

export type SubScore = {
  criterion: string;
  score: number;
  anchor: string;
  quotes: string[];
};

// Ordered components compared after total; see rubric-scoring spec.
export type TieKey = {
  kills: number;
  first: number;
  second: number;
  evidenceCount: number;
  uploadedAt: string;
};

export type FlagType =
  | "duplicate"
  | "placeholder"
  | "identity_mismatch"
  | "education_overlap"
  | "stated_vs_dated";

export type DraftKind = "invite" | "rejection";

export type DraftStatus = "drafted" | "needs_manual_edit" | "sending" | "sent" | "failed";

export type Brief = {
  summary: string;
  strengths: { criterion: string; evidence: string }[];
  probes: { criterion: string; question: string }[];
  verification: string[];
};
