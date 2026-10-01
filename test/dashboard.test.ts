import { describe, expect, it } from "vitest";
import { chipsFor, prioritizeChips, trimChips, visibleChips, type Chip, type ChipInput } from "@/lib/dashboard/chips";
import { cohortFor, histogram, type CohortRow } from "@/lib/dashboard/cohort";
import type { SubScore } from "@/lib/types";
import { evidence, role } from "./helpers/evidence";

const base = (overrides: Partial<ChipInput> = {}): ChipInput => ({
  evidence: evidence(),
  productYears: 3,
  totalYears: 5,
  tieBrokenBy: null,
  suggestedRole: "pm",
  suggestOther: false,
  flagCount: 0,
  flagSummaries: [],
  isMumbai: null,
  ...overrides,
});

const labels = (input: ChipInput) => chipsFor(input).map((chip) => chip.label);

describe("insight chips", () => {
  it("shows product vs total years and Ops → Product for a senior applicant", () => {
    const e = evidence({
      roles: [
        role({ roleType: "operations", opsDomain: "freight", start: "2017-06", end: "2020-12", quote: "Terminal Operations" }),
        role({ start: "2021-01" }),
      ],
    });
    expect(labels(base({ evidence: e, productYears: 4, totalYears: 7 }))).toEqual(
      expect.arrayContaining(["Product 4.0 yrs · Total 7.0 yrs", "Ops → Product"]),
    );
  });

  it("shows Kill evidence with the quote, or No kills", () => {
    const withKill = evidence({ killed: [{ what: "portal", reason: "low adoption", sunkCost: false, quote: "Killed a supplier portal" }] });
    const chip = chipsFor(base({ evidence: withKill })).find((item) => item.key === "kills");
    expect(chip?.label).toBe("Kill evidence");
    expect(chip?.evidence[0]).toContain("Killed a supplier portal");
    expect(chip?.evidence[0]).toContain("low adoption");
    expect(labels(base())).toContain("No kills");
  });

  it("shows Big-company structure only when every product role is at 100+ with a PM above", () => {
    const big = evidence({ roles: [role({ companySizeBand: "100_plus", pmAbove: true })] });
    const mixed = evidence({
      roles: [role({ companySizeBand: "100_plus", pmAbove: true }), role({ companySizeBand: "under_100", pmAbove: false })],
    });
    expect(labels(base({ evidence: big }))).toContain("Big-company structure");
    expect(labels(base({ evidence: mixed }))).not.toContain("Big-company structure");
  });

  it("shows tie-break, suggestion, flags and location", () => {
    const all = labels(
      base({ tieBrokenBy: "kill evidence", suggestOther: true, suggestedRole: "spm", flagCount: 2, isMumbai: false, evidence: evidence({ location: { text: "Chennai", quote: "Chennai" } }) }),
    );
    expect(all).toEqual(expect.arrayContaining(["Tie broken by: kill evidence", "Suggest: Senior PM", "Flags: 2", "Outside Mumbai"]));
  });
});

describe("cohort panel", () => {
  const scores = (values: number[], prefix = "P"): SubScore[] =>
    values.map((score, index) => ({ criterion: `${prefix}${index + 1}`, score, anchor: "", quotes: [] }));
  const row = (id: string, total: number, sub: number[], extra: Partial<CohortRow> = {}): CohortRow => ({
    id,
    total,
    tier: total >= 80 ? "Strong" : total >= 65 ? "Good" : total >= 50 ? "Partial" : "Weak",
    appliedRole: "pm",
    subScores: scores(sub),
    suggestOther: false,
    flagTypes: [],
    ...extra,
  });

  it("counts ties at the top and finds the scarcest criterion", () => {
    const rows = [
      row("a", 100, [5, 5, 5, 5, 5]),
      row("b", 100, [5, 5, 5, 5, 5]),
      row("c", 100, [5, 5, 5, 5, 5]),
      row("d", 100, [5, 5, 5, 5, 5]),
      row("e", 60, [1, 5, 5, 5, 3], { appliedRole: "spm", suggestOther: true, flagTypes: ["duplicate"] }),
    ];
    const cohort = cohortFor(rows, "pm");
    expect(cohort.tiedAtTop).toBe(4);
    expect(cohort.topTotal).toBe(100);
    expect(cohort.scarcest).toEqual({ criterion: "P1", fives: 4 });
    expect(cohort.tiers).toEqual({ Strong: 4, Good: 0, Partial: 1, Weak: 0 });
    expect(cohort.averageApplicants).toBe(100);
    expect(cohort.suggestOther).toBe(1);
    expect(cohort.flags).toEqual({ duplicate: 1 });
  });
});

describe("chip priority and overflow", () => {
  const chip = (key: string, tone: Chip["tone"]): Chip => ({ key, label: key, tone, evidence: [] });
  const chips = [chip("years", "neutral"), chip("kills", "good"), chip("ops", "good"), chip("tie", "neutral"), chip("flags", "bad"), chip("suggest", "warn")];

  it("puts problems first, then cautions, strengths and context", () => {
    expect(prioritizeChips(chips).map((c) => c.key)).toEqual(["flags", "suggest", "kills", "ops", "years", "tie"]);
  });

  it("drops the years chip and moves the overflow into hidden", () => {
    const { shown, hidden } = visibleChips(chips, 3);
    expect(shown.map((c) => c.key)).toEqual(["flags", "suggest", "kills"]);
    expect(hidden.map((c) => c.key)).toEqual(["ops", "tie"]);
  });

  it("hides nothing when everything fits", () => {
    expect(visibleChips([chip("kills", "good")], 3)).toEqual({ shown: [chip("kills", "good")], hidden: [] });
  });
});

describe("score histogram", () => {
  it("buckets totals in tens, with 90–100 as the top bucket", () => {
    const buckets = histogram([20, 29, 30, 55, 79, 80, 89, 90, 100]);
    expect(buckets.map((b) => b.count)).toEqual([2, 1, 0, 1, 0, 1, 2, 2]);
    expect(buckets[0]).toMatchObject({ from: 20, to: 29 });
    expect(buckets.at(-1)).toMatchObject({ from: 90, to: 100 });
  });

  it("counts every candidate exactly once, even out-of-range totals", () => {
    const buckets = histogram([5, 150, 60]);
    expect(buckets.reduce((sum, b) => sum + b.count, 0)).toBe(3);
  });

  it("is carried on the cohort", () => {
    const row = { id: "a", total: 100, tier: "Strong" as const, appliedRole: "pm" as const, subScores: [], suggestOther: false, flagTypes: [] };
    expect(cohortFor([row], "pm").histogram.at(-1)?.count).toBe(1);
  });
});

describe("trimChips", () => {
  const chip = (key: string, evidence: string[]): Chip => ({ key, label: key, tone: "neutral", evidence });

  it("drops the years chip, which has its own column", () => {
    expect(trimChips([chip("years", ["x"]), chip("kills", ["y"])]).map((c) => c.key)).toEqual(["kills"]);
  });

  it("caps how many evidence lines and how long each is", () => {
    const long = "x".repeat(500);
    const [trimmed] = trimChips([chip("kills", [long, "b", "c", "d", "e", "f"])], 4, 100);
    expect(trimmed.evidence).toHaveLength(4);
    expect(trimmed.evidence[0]).toHaveLength(100);
    expect(trimmed.evidence[0].endsWith("…")).toBe(true);
    expect(trimmed.evidence[1]).toBe("b");
  });
});
