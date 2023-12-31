import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { candidatePii, candidates, cvFiles, evidence } from "@/db/schema";
import { tokensOf } from "@/lib/pii/detect";
import { scoreAndCheck } from "@/lib/pipeline/steps";
import type { RoleKey } from "@/lib/types";

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export type CreateResult = { id: string; created: boolean };

// Idempotent by file content: the same bytes never create a second candidate.
export async function createCandidate(input: {
  bytes: Uint8Array;
  fileName: string;
  fileMime: string;
  appliedRole: RoleKey;
  asOfDate: string;
}): Promise<CreateResult> {
  const fileSha256 = sha256(input.bytes);
  const [existing] = await db.select({ id: candidates.id }).from(candidates).where(eq(candidates.fileSha256, fileSha256));
  if (existing) return { id: existing.id, created: false };
  const [row] = await db
    .insert(candidates)
    .values({
      appliedRole: input.appliedRole,
      asOfDate: input.asOfDate,
      fileSha256,
      fileName: input.fileName,
      fileMime: input.fileMime,
    })
    .returning({ id: candidates.id });
  await db.insert(cvFiles).values({ candidateId: row.id, bytes: Buffer.from(input.bytes) });
  return { id: row.id, created: true };
}

// Role or as-of changes rescore from stored evidence; no AI call.
export async function updateCandidateSettings(id: string, input: { appliedRole?: RoleKey; asOfDate?: string }) {
  await db.update(candidates).set(input).where(eq(candidates.id, id));
  const [row] = await db.select({ status: candidates.status }).from(candidates).where(eq(candidates.id, id));
  if (row?.status === "ready") await scoreAndCheck(id);
}

// A corrected name, email or phone clears evidence so the next AI call works
// from text re-redacted with the corrected details.
export async function correctPersonalDetails(id: string, input: { name?: string; email?: string; phone?: string }) {
  const [current] = await db.select().from(candidatePii).where(eq(candidatePii.candidateId, id));
  if (!current) throw new Error("personal details not prepared");
  const name = input.name?.trim() || current.name;
  const emails = input.email?.trim() ? [input.email.trim().toLowerCase(), ...current.emails.filter((e) => e !== input.email?.trim().toLowerCase())] : current.emails;
  const phones = input.phone?.trim() ? [input.phone.replace(/\D/g, "").slice(-10), ...current.phones] : current.phones;
  await db
    .update(candidatePii)
    .set({ name, nameTokens: tokensOf(name), emails: [...new Set(emails)], phones: [...new Set(phones)] })
    .where(eq(candidatePii.candidateId, id));
  await db.delete(evidence).where(eq(evidence.candidateId, id));
}
