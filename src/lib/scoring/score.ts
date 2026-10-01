import type { Evidence } from "@/lib/evidence/schema";
import { factCount } from "@/lib/evidence/verify";
import type { RoleKey, SubScore, SuggestedRole, TieKey, Tier } from "@/lib/types";
import { RUBRICS, type Facts } from "./rubric";
import { productYears, totalYears } from "./years";

export type RoleScore = {
  role: RoleKey;
  subScores: SubScore[];
  total: number;
  tier: Tier;
  tieKey: Omit<TieKey, "uploadedAt">;
};

export type CandidateScores = {
  productYears: number;
  totalYears: number;
  suggestedRole: SuggestedRole;
  isMumbai: boolean | null;
  byRole: Record<RoleKey, RoleScore>;
};

export function tierFor(total: number): Tier {
  if (total >= 80) return "Shortlist";
  if (total >= 65) return "Interview";
  if (total >= 50) return "Hold";
  return "Decline";
}

export function suggestedRoleFor(years: number): SuggestedRole {
  if (years < 2) return "below_band";
  if (years < 4) return "pm";
  if (years <= 5) return "pm_or_spm";
  return "spm";
}

export function suggestsOther(applied: RoleKey, suggested: SuggestedRole): boolean {
  if (suggested === "pm_or_spm") return false;
  if (suggested === "below_band") return applied === "spm";
  return suggested !== applied;
}

export function isMumbai(location: string | null): boolean | null {
  if (!location) return null;
  return /mumbai|thane/i.test(location);
}

function scoreRole(role: RoleKey, facts: Facts): RoleScore {
  const subScores: SubScore[] = RUBRICS[role].map((criterion) => {
    for (const anchor of criterion.anchors) {
      const hit = anchor.test(facts);
      if (hit) {
        return {
          criterion: criterion.id,
          score: anchor.score,
          anchor: anchor.text,
          quotes: [...new Set(hit)].slice(0, 4),
        };
      }
    }
    throw new Error(`No anchor matched for ${criterion.id}`);
  });
  const weighted = RUBRICS[role].reduce((sum, criterion, index) => sum + criterion.weight * subScores[index].score, 0);
  const total = Math.round(20 * weighted);
  return {
    role,
    subScores,
    total,
    tier: tierFor(total),
    tieKey: {
      kills: facts.evidence.killed.filter((item) => item.reason).length,
      first: subScores[0].score,
      second: subScores[1].score,
      evidenceCount: factCount(facts.evidence),
    },
  };
}

export function scoreCandidate(evidence: Evidence, asOf: string): CandidateScores {
  const years = productYears(evidence.roles, asOf);
  const facts: Facts = { evidence, productYears: years };
  return {
    productYears: years,
    totalYears: totalYears(evidence.roles, asOf),
    suggestedRole: suggestedRoleFor(years),
    isMumbai: isMumbai(evidence.location.text),
    byRole: { pm: scoreRole("pm", facts), spm: scoreRole("spm", facts) },
  };
}
