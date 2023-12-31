import type { FlagType, RoleKey, SubScore, Tier } from "@/lib/types";

export type CohortRow = {
  id: string;
  total: number;
  tier: Tier;
  appliedRole: RoleKey;
  subScores: SubScore[];
  suggestOther: boolean;
  flagTypes: FlagType[];
};

export type Bucket = { from: number; to: number; count: number };

// Totals run 20–100; eight buckets of ten, with 90–100 as the last.
export const BUCKETS = [20, 30, 40, 50, 60, 70, 80, 90] as const;

export function histogram(totals: number[]): Bucket[] {
  const buckets: Bucket[] = BUCKETS.map((from, index) => ({ from, to: index === BUCKETS.length - 1 ? 100 : from + 9, count: 0 }));
  for (const total of totals) {
    const index = Math.min(BUCKETS.length - 1, Math.max(0, Math.floor((total - 20) / 10)));
    buckets[index].count += 1;
  }
  return buckets;
}

export type Cohort = {
  histogram: Bucket[];
  count: number;
  tiers: Record<Tier, number>;
  averageAll: number;
  averageApplicants: number | null;
  topTotal: number | null;
  tiedAtTop: number;
  scarcest: { criterion: string; fives: number } | null;
  suggestOther: number;
  flags: Partial<Record<FlagType, number>>;
};

const average = (values: number[]) =>
  values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : null;

export function cohortFor(rows: CohortRow[], role: RoleKey): Cohort {
  const tiers: Record<Tier, number> = { Shortlist: 0, Interview: 0, Hold: 0, Decline: 0 };
  for (const row of rows) tiers[row.tier] += 1;

  const topTotal = rows.length ? Math.max(...rows.map((row) => row.total)) : null;
  const criteria = rows[0]?.subScores.map((item) => item.criterion) ?? [];
  let scarcest: Cohort["scarcest"] = null;
  for (const criterion of criteria) {
    const fives = rows.filter((row) => row.subScores.find((item) => item.criterion === criterion)?.score === 5).length;
    if (!scarcest || fives < scarcest.fives) scarcest = { criterion, fives };
  }

  const flags: Cohort["flags"] = {};
  for (const row of rows) for (const type of new Set(row.flagTypes)) flags[type] = (flags[type] ?? 0) + 1;

  return {
    histogram: histogram(rows.map((row) => row.total)),
    count: rows.length,
    tiers,
    averageAll: average(rows.map((row) => row.total)) ?? 0,
    averageApplicants: average(rows.filter((row) => row.appliedRole === role).map((row) => row.total)),
    topTotal,
    tiedAtTop: topTotal === null ? 0 : rows.filter((row) => row.total === topTotal).length,
    scarcest,
    suggestOther: rows.filter((row) => row.suggestOther).length,
    flags,
  };
}
