import "server-only";
import { desc, eq, inArray, notInArray } from "drizzle-orm";
import { db } from "@/db/client";
import { candidatePii, candidates, drafts, evidence, flags, scores } from "@/db/schema";
import { verificationQuestion } from "@/lib/drafts/brief";
import { rank } from "@/lib/scoring/rank";
import { isMumbai } from "@/lib/scoring/score";
import type { DraftStatus, FlagType, RoleKey, Tier } from "@/lib/types";
import { chipsFor, type Chip } from "./chips";
import { cohortFor, type Cohort } from "./cohort";

export type DashboardRow = {
  id: string;
  rank: number;
  name: string;
  appliedRole: RoleKey;
  total: number;
  tier: Tier;
  subScores: { criterion: string; score: number }[];
  productYears: number;
  totalYears: number;
  chips: Chip[];
  flagTypes: FlagType[];
  emailStatus: DraftStatus | "none";
  suggestOther: boolean;
};

export type Filters = { tier?: Tier; applied?: RoleKey; flag?: FlagType; suggest?: boolean; top?: boolean };

export type PendingRow = { id: string; fileName: string; status: string; reason: string | null };

export type Dashboard = { rows: DashboardRow[]; all: number; cohort: Cohort; pending: PendingRow[] };

export async function loadDashboard(role: RoleKey, filters: Filters = {}): Promise<Dashboard> {
  const scored = await db
    .select({
      id: candidates.id,
      appliedRole: candidates.appliedRole,
      uploadedAt: candidates.uploadedAt,
      name: candidatePii.name,
      score: scores,
      record: evidence.record,
    })
    .from(scores)
    .innerJoin(candidates, eq(candidates.id, scores.candidateId))
    .innerJoin(candidatePii, eq(candidatePii.candidateId, scores.candidateId))
    .innerJoin(evidence, eq(evidence.candidateId, scores.candidateId))
    .where(eq(scores.role, role));

  const ids = scored.map((row) => row.id);
  const flagRows = ids.length ? await db.select().from(flags).where(inArray(flags.candidateId, ids)) : [];
  const draftRows = ids.length
    ? await db
        .select({ candidateId: drafts.candidateId, status: drafts.status })
        .from(drafts)
        .where(eq(drafts.role, role))
        .orderBy(desc(drafts.createdAt))
    : [];
  const emailStatus = new Map<string, DraftStatus>();
  for (const draft of draftRows) if (!emailStatus.has(draft.candidateId)) emailStatus.set(draft.candidateId, draft.status);

  const ranked = rank(
    scored.map((row) => ({ ...row, total: row.score.total, tieKey: row.score.tieKey })),
    role,
  );

  const all: DashboardRow[] = ranked.map((row) => {
    const mine = flagRows.filter((flag) => flag.candidateId === row.id);
    return {
      id: row.id,
      rank: row.rank,
      name: row.name,
      appliedRole: row.appliedRole,
      total: row.score.total,
      tier: row.score.tier,
      subScores: row.score.subScores.map((item) => ({ criterion: item.criterion, score: item.score })),
      productYears: row.score.productYears,
      totalYears: row.score.totalYears,
      flagTypes: mine.map((flag) => flag.type),
      emailStatus: emailStatus.get(row.id) ?? "none",
      suggestOther: row.score.suggestOther,
      chips: chipsFor({
        evidence: row.record,
        productYears: row.score.productYears,
        totalYears: row.score.totalYears,
        tieBrokenBy: row.tieBrokenBy,
        suggestedRole: row.score.suggestedRole,
        suggestOther: row.score.suggestOther,
        flagCount: mine.length,
        flagSummaries: mine.map((flag) => verificationQuestion({ type: flag.type, detail: flag.detail })),
        isMumbai: isMumbai(row.record.location.text),
      }),
    };
  });

  const cohort = cohortFor(
    ranked.map((row) => ({
      id: row.id,
      total: row.score.total,
      tier: row.score.tier,
      appliedRole: row.appliedRole,
      subScores: row.score.subScores,
      suggestOther: row.score.suggestOther,
      flagTypes: flagRows.filter((flag) => flag.candidateId === row.id).map((flag) => flag.type),
    })),
    role,
  );

  const rows = all.filter(
    (row) =>
      (!filters.tier || row.tier === filters.tier) &&
      (!filters.applied || row.appliedRole === filters.applied) &&
      (!filters.flag || row.flagTypes.includes(filters.flag)) &&
      (!filters.suggest || row.suggestOther) &&
      (!filters.top || row.total === cohort.topTotal),
  );

  const pending = await db
    .select({ id: candidates.id, fileName: candidates.fileName, status: candidates.status, reason: candidates.statusReason })
    .from(candidates)
    .where(notInArray(candidates.status, ["ready"]))
    .orderBy(candidates.uploadedAt);

  return { rows, all: all.length, cohort, pending };
}

export async function loadCandidate(id: string) {
  const [candidate] = await db.select().from(candidates).where(eq(candidates.id, id));
  if (!candidate) return null;
  const [pii] = await db.select().from(candidatePii).where(eq(candidatePii.candidateId, id));
  const [ev] = await db.select().from(evidence).where(eq(evidence.candidateId, id));
  const scoreRows = await db.select().from(scores).where(eq(scores.candidateId, id));
  const flagRows = await db.select().from(flags).where(eq(flags.candidateId, id));
  const related = flagRows.map((flag) => flag.relatedCandidateId).filter((value): value is string => Boolean(value));
  const relatedNames = related.length
    ? await db.select({ id: candidatePii.candidateId, name: candidatePii.name }).from(candidatePii).where(inArray(candidatePii.candidateId, related))
    : [];
  const draftRows = await db.select().from(drafts).where(eq(drafts.candidateId, id)).orderBy(desc(drafts.createdAt));
  return {
    candidate,
    pii: pii ?? null,
    evidence: ev?.record ?? null,
    scores: Object.fromEntries(scoreRows.map((row) => [row.role, row])) as Partial<Record<RoleKey, (typeof scoreRows)[number]>>,
    flags: flagRows.map((flag) => ({
      ...flag,
      question: verificationQuestion({ type: flag.type, detail: flag.detail }),
      relatedName: relatedNames.find((item) => item.id === flag.relatedCandidateId)?.name ?? null,
    })),
    drafts: {
      pm: draftRows.find((row) => row.role === "pm") ?? null,
      spm: draftRows.find((row) => row.role === "spm") ?? null,
    },
  };
}

export type CandidateView = NonNullable<Awaited<ReturnType<typeof loadCandidate>>>;
