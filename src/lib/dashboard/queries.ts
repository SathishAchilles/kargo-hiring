import "server-only";
import { desc, eq, inArray, notInArray } from "drizzle-orm";
import { db } from "@/db/client";
import { candidatePii, candidates, decisions, drafts, evidence, flags, scores } from "@/db/schema";
import { verificationQuestion } from "@/lib/drafts/brief";
import { rank } from "@/lib/scoring/rank";
import { isMumbai, tierFor } from "@/lib/scoring/score";
import type { Decision, DraftStatus, FlagType, RoleKey, Tier } from "@/lib/types";
import { chipsFor, trimChips, type Chip } from "./chips";
import { parseSort, sortRows, type SortDir, type SortKey } from "./sort";
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
  // The founder's call for this role; null until they decide.
  decision: Decision | null;
  decisionNote: string | null;
};

export type DecisionFilter = Decision | "undecided";
export type ReviewProgress = Record<DecisionFilter, number>;

export type Filters = {
  tier?: Tier;
  decision?: DecisionFilter;
  applied?: RoleKey;
  flag?: FlagType;
  suggest?: boolean;
  top?: boolean;
  sort?: SortKey;
  dir?: SortDir;
};

export type PendingRow = { id: string; fileName: string; status: string; reason: string | null };

export type Dashboard = { rows: DashboardRow[]; all: number; cohort: Cohort; progress: ReviewProgress; pending: PendingRow[] };

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
  const decisionRows = ids.length
    ? await db
        .select({ candidateId: decisions.candidateId, decision: decisions.decision, note: decisions.note })
        .from(decisions)
        .where(eq(decisions.role, role))
    : [];
  const decided = new Map(decisionRows.map((row) => [row.candidateId, row]));
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
      tier: tierFor(row.score.total),
      subScores: row.score.subScores.map((item) => ({ criterion: item.criterion, score: item.score })),
      productYears: row.score.productYears,
      totalYears: row.score.totalYears,
      flagTypes: mine.map((flag) => flag.type),
      emailStatus: emailStatus.get(row.id) ?? "none",
      suggestOther: row.score.suggestOther,
      decision: decided.get(row.id)?.decision ?? null,
      decisionNote: decided.get(row.id)?.note ?? null,
      chips: trimChips(
        chipsFor({
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
      ),
    };
  });

  const cohort = cohortFor(
    ranked.map((row) => ({
      id: row.id,
      total: row.score.total,
      tier: tierFor(row.score.total),
      appliedRole: row.appliedRole,
      subScores: row.score.subScores,
      suggestOther: row.score.suggestOther,
      flagTypes: flagRows.filter((flag) => flag.candidateId === row.id).map((flag) => flag.type),
    })),
    role,
  );

  const progress: ReviewProgress = { undecided: 0, shortlisted: 0, on_hold: 0, declined: 0 };
  for (const row of all) progress[row.decision ?? "undecided"] += 1;

  const sort = parseSort(filters.sort, filters.dir);
  const filtered = all.filter(
    (row) =>
      (!filters.tier || row.tier === filters.tier) &&
      (!filters.decision || (row.decision ?? "undecided") === filters.decision) &&
      (!filters.applied || row.appliedRole === filters.applied) &&
      (!filters.flag || row.flagTypes.includes(filters.flag)) &&
      (!filters.suggest || row.suggestOther) &&
      (!filters.top || row.total === cohort.topTotal),
  );
  const rows = sortRows(filtered, sort.key, sort.dir);

  const pending = await db
    .select({ id: candidates.id, fileName: candidates.fileName, status: candidates.status, reason: candidates.statusReason })
    .from(candidates)
    .where(notInArray(candidates.status, ["ready"]))
    .orderBy(candidates.uploadedAt);

  return { rows, all: all.length, cohort, progress, pending };
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
  const decisionRows = await db.select().from(decisions).where(eq(decisions.candidateId, id));
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
    decisions: Object.fromEntries(decisionRows.map((row) => [row.role, row])) as Partial<
      Record<RoleKey, (typeof decisionRows)[number]>
    >,
    drafts: {
      pm: draftRows.find((row) => row.role === "pm") ?? null,
      spm: draftRows.find((row) => row.role === "spm") ?? null,
    },
  };
}

export type CandidateView = NonNullable<Awaited<ReturnType<typeof loadCandidate>>>;

export type Neighbour = { id: string; name: string };
export type Neighbours = { position: number; of: number; prev: Neighbour | null; next: Neighbour | null };

// Where this candidate sits in the ranking for a role, and who is either side, so the
// founder can step through the list without going back to it.
export async function neighbours(id: string, role: RoleKey): Promise<Neighbours | null> {
  const rows = await db
    .select({ id: scores.candidateId, total: scores.total, tieKey: scores.tieKey })
    .from(scores)
    .where(eq(scores.role, role));
  const ordered = rank(rows, role).map((row) => row.id);
  const index = ordered.indexOf(id);
  if (index === -1) return null;
  const wanted = [ordered[index - 1], ordered[index + 1]].filter((value): value is string => Boolean(value));
  const names = wanted.length
    ? await db.select({ id: candidatePii.candidateId, name: candidatePii.name }).from(candidatePii).where(inArray(candidatePii.candidateId, wanted))
    : [];
  const pick = (target: string | undefined): Neighbour | null =>
    target ? { id: target, name: names.find((row) => row.id === target)?.name ?? "Candidate" } : null;
  return { position: index + 1, of: ordered.length, prev: pick(ordered[index - 1]), next: pick(ordered[index + 1]) };
}
