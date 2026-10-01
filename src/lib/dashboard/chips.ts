import type { Evidence } from "@/lib/evidence/schema";
import { isProductRole } from "@/lib/scoring/years";
import { ROLE_LABEL, type SuggestedRole } from "@/lib/types";

export type ChipTone = "neutral" | "good" | "warn" | "bad";

export type Chip = { key: string; label: string; tone: ChipTone; evidence: string[] };

export type ChipInput = {
  evidence: Evidence;
  productYears: number;
  totalYears: number;
  tieBrokenBy: string | null;
  suggestedRole: SuggestedRole;
  suggestOther: boolean;
  flagCount: number;
  flagSummaries: string[];
  isMumbai: boolean | null;
};

const SUGGESTED: Record<SuggestedRole, string> = {
  below_band: "below both bands",
  pm: ROLE_LABEL.pm,
  pm_or_spm: "PM or Senior PM",
  spm: ROLE_LABEL.spm,
};

export function opsBeforeProduct(e: Evidence) {
  const product = e.roles.filter(isProductRole).map((role) => role.start).sort()[0];
  if (!product) return [];
  return e.roles.filter(
    (role) =>
      !isProductRole(role) &&
      (role.roleType === "operations" || role.opsDomain === "freight" || role.opsDomain === "adjacent_physical") &&
      role.start < product,
  );
}

export function bigCompanyOnly(e: Evidence) {
  const product = e.roles.filter(isProductRole);
  if (!product.length) return [];
  return product.every((role) => role.companySizeBand === "100_plus" && role.pmAbove === true) ? product : [];
}

export function chipsFor(input: ChipInput): Chip[] {
  const e = input.evidence;
  const chips: Chip[] = [
    {
      key: "years",
      label: `Product ${input.productYears.toFixed(1)} yrs · Total ${input.totalYears.toFixed(1)} yrs`,
      tone: "neutral",
      evidence: e.roles.map((r) => `${isProductRole(r) ? "Product" : "Other"}: ${r.title} (${r.start} – ${r.end})`),
    },
  ];

  const kills = e.killed.filter((item) => item.reason);
  chips.push(
    kills.length
      ? { key: "kills", label: "Kill evidence", tone: "good", evidence: kills.map((k) => (k.reason && !k.quote.includes(k.reason) ? `${k.quote} — ${k.reason}` : k.quote)) }
      : { key: "kills", label: "No kills", tone: "warn", evidence: ["No killed or retired work with a stated reason."] },
  );

  const ops = opsBeforeProduct(e);
  if (ops.length) chips.push({ key: "ops", label: "Ops → Product", tone: "good", evidence: ops.map((r) => r.quote) });

  const big = bigCompanyOnly(e);
  if (big.length) {
    chips.push({ key: "structure", label: "Big-company structure", tone: "warn", evidence: big.map((r) => r.quote) });
  }

  if (input.tieBrokenBy) {
    chips.push({
      key: "tie",
      label: `Tie broken by: ${input.tieBrokenBy}`,
      tone: "neutral",
      evidence: ["Shares its total with another candidate; order decided by this rule."],
    });
  }

  if (input.suggestOther) {
    chips.push({
      key: "suggest",
      label: `Suggest: ${SUGGESTED[input.suggestedRole]}`,
      tone: "warn",
      evidence: [`${input.productYears.toFixed(1)} product years fits ${SUGGESTED[input.suggestedRole]}.`],
    });
  }

  if (input.flagCount) {
    chips.push({ key: "flags", label: `Flags: ${input.flagCount}`, tone: "bad", evidence: input.flagSummaries });
  }

  if (input.isMumbai !== null) {
    chips.push({
      key: "location",
      label: input.isMumbai ? "Mumbai" : "Outside Mumbai",
      tone: "neutral",
      evidence: [input.isMumbai ? "Based in Mumbai." : `Based in ${e.location.text}; relocation unknown.`],
    });
  }
  return chips;
}

const TONE_ORDER: Record<ChipTone, number> = { bad: 0, warn: 1, good: 2, neutral: 3 };

// What to read first when space is short: problems, then cautions, then strengths, then context.
// Stable, so chips of the same tone keep their natural order.
export function prioritizeChips(chips: Chip[]): Chip[] {
  return chips
    .map((chip, index) => ({ chip, index }))
    .sort((a, b) => TONE_ORDER[a.chip.tone] - TONE_ORDER[b.chip.tone] || a.index - b.index)
    .map(({ chip }) => chip);
}

// Splits into the chips shown inline and the rest ("+N"). The years chip is dropped here
// because the table has its own years column.
export function visibleChips(chips: Chip[], max: number): { shown: Chip[]; hidden: Chip[] } {
  const ordered = prioritizeChips(chips.filter((chip) => chip.key !== "years"));
  return { shown: ordered.slice(0, max), hidden: ordered.slice(max) };
}
