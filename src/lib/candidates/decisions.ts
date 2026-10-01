import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { decisions } from "@/db/schema";
import type { Decision, RoleKey } from "@/lib/types";

export type DecisionRow = { decision: Decision; note: string | null; decidedAt: Date };

const MAX_NOTE = 500;

export async function getDecision(candidateId: string, role: RoleKey): Promise<DecisionRow | null> {
  const [row] = await db
    .select({ decision: decisions.decision, note: decisions.note, decidedAt: decisions.decidedAt })
    .from(decisions)
    .where(and(eq(decisions.candidateId, candidateId), eq(decisions.role, role)));
  return row ?? null;
}

// Records (or changes) the founder's decision. The latest decision wins; clearing returns the
// candidate to "not decided".
export async function setDecision(candidateId: string, role: RoleKey, decision: Decision, note?: string | null) {
  const trimmed = note?.trim().slice(0, MAX_NOTE) || null;
  const values = { decision, note: trimmed, decidedAt: new Date() };
  await db
    .insert(decisions)
    .values({ candidateId, role, ...values })
    .onConflictDoUpdate({ target: [decisions.candidateId, decisions.role], set: values });
}

export async function clearDecision(candidateId: string, role: RoleKey) {
  await db.delete(decisions).where(and(eq(decisions.candidateId, candidateId), eq(decisions.role, role)));
}
