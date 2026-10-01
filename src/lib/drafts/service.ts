import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import { db } from "@/db/client";
import { candidatePii, drafts, evidence, flags as flagsTable, scores } from "@/db/schema";
import { emailMode, fromAddress, route, sender } from "@/lib/email/send";
import { loadPii } from "@/lib/pipeline/steps";
import { tierFor } from "@/lib/scoring/score";
import type { DraftKind, RoleKey } from "@/lib/types";
import { defaultKind } from "./brief";
import { generateDraft } from "./generate";

type DraftRow = typeof drafts.$inferSelect;

export async function latestDraft(candidateId: string, role: RoleKey): Promise<DraftRow | null> {
  const [row] = await db
    .select()
    .from(drafts)
    .where(and(eq(drafts.candidateId, candidateId), eq(drafts.role, role)))
    .orderBy(desc(drafts.createdAt))
    .limit(1);
  return row ?? null;
}

// Generates (or regenerates) the draft for one role. An edited, unsent draft is
// only replaced when the founder explicitly asks (force).
export async function ensureDraft(
  candidateId: string,
  role: RoleKey,
  options: { kind?: DraftKind; force?: boolean } = {},
): Promise<DraftRow> {
  const existing = await latestDraft(candidateId, role);
  if (existing && !options.force && (!options.kind || options.kind === existing.kind)) return existing;
  if (existing && existing.status === "sent") return existing;

  const [score] = await db.select().from(scores).where(and(eq(scores.candidateId, candidateId), eq(scores.role, role)));
  const [ev] = await db.select().from(evidence).where(eq(evidence.candidateId, candidateId));
  if (!score || !ev) throw new Error("Candidate is not scored yet");
  const flagRows = await db.select().from(flagsTable).where(eq(flagsTable.candidateId, candidateId));
  const pii = await loadPii(candidateId);

  const generated = await generateDraft({
    role,
    kind: options.kind ?? existing?.kind ?? defaultKind(tierFor(score.total)),
    pii,
    evidence: ev.record,
    subScores: score.subScores,
    flags: flagRows.map((flag) => ({ type: flag.type, detail: flag.detail })),
  });

  if (existing && existing.status !== "sent") {
    await db.delete(drafts).where(eq(drafts.id, existing.id));
  }
  const [row] = await db
    .insert(drafts)
    .values({
      candidateId,
      role,
      kind: generated.kind,
      subject: generated.subject,
      body: generated.body,
      brief: generated.brief,
      status: generated.needsManualEdit ? "needs_manual_edit" : "drafted",
    })
    .returning();
  return row;
}

export async function editDraft(id: string, input: { subject: string; body: string }) {
  const [row] = await db
    .update(drafts)
    .set({ subject: input.subject, body: input.body, editedByFounder: true, status: "drafted" })
    .where(and(eq(drafts.id, id), inArray(drafts.status, ["drafted", "needs_manual_edit", "failed"])))
    .returning();
  if (!row) throw new Error("This draft can no longer be edited");
  return row;
}

export type SendOutcome = { status: "sent" | "failed" | "skipped"; detail?: string };

const STALE_SENDING_MS = 10 * 60 * 1000;

// Exactly once: only the request that moves the row to "sending" goes on to
// call Resend, and the draft id doubles as Resend's idempotency key.
export async function sendDraft(id: string): Promise<SendOutcome> {
  const mode = emailMode();
  const staleBefore = new Date(Date.now() - STALE_SENDING_MS);
  const [claimed] = await db
    .update(drafts)
    .set({ status: "sending", sendingSince: new Date(), error: null })
    .where(
      and(
        eq(drafts.id, id),
        or(
          eq(drafts.status, "drafted"),
          eq(drafts.status, "failed"),
          and(eq(drafts.status, "sending"), lt(drafts.sendingSince, staleBefore)),
        ),
      ),
    )
    .returning();
  if (!claimed) return { status: "skipped", detail: "already sent or being sent" };

  const [pii] = await db.select().from(candidatePii).where(eq(candidatePii.candidateId, claimed.candidateId));
  const to = pii?.emails[0];
  if (!to) {
    await db.update(drafts).set({ status: "drafted", sendingSince: null }).where(eq(drafts.id, id));
    return { status: "failed", detail: "add an email address to send" };
  }

  try {
    const routed = route({ to, subject: claimed.subject }, mode);
    const result = await sender()({
      from: fromAddress(),
      to: routed.to,
      subject: routed.subject,
      text: claimed.body,
      idempotencyKey: `kargo-draft-${claimed.id}`,
    });
    await db
      .update(drafts)
      .set({ status: "sent", sentAt: new Date(), resendMessageId: result.id, sentTo: routed.to })
      .where(eq(drafts.id, id));
    return { status: "sent" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.update(drafts).set({ status: "failed", error: message }).where(eq(drafts.id, id));
    return { status: "failed", detail: message };
  }
}
