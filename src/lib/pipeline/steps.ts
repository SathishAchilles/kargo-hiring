import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import {
  candidatePii,
  candidates,
  cvFiles,
  cvTexts,
  drafts,
  evidence as evidenceTable,
  flags as flagsTable,
  scores,
} from "@/db/schema";
import { evidenceWithCache, type EvidenceCache } from "@/lib/evidence/extract";
import { EVIDENCE_PROMPT_VERSION } from "@/lib/evidence/prompt";
import { detectKind, extractText } from "@/lib/intake/extract";
import {
  findDuplicates,
  findEducationOverlaps,
  findIdentityMismatch,
  findPlaceholders,
  findStatedVsDated,
  type Flag,
} from "@/lib/integrity/checks";
import { detectPii, type Pii } from "@/lib/pii/detect";
import { REDACTION_VERSION, redact } from "@/lib/pii/redact";
import { scoreCandidate, suggestsOther } from "@/lib/scoring/score";
import type { RoleKey } from "@/lib/types";
import type { StepOutcome, Steps } from "./runner";

async function candidate(id: string) {
  const [row] = await db.select().from(candidates).where(eq(candidates.id, id));
  if (!row) throw new Error("candidate not found");
  return row;
}

export async function loadPii(id: string): Promise<Pii> {
  const [row] = await db.select().from(candidatePii).where(eq(candidatePii.candidateId, id));
  if (!row) throw new Error("personal details not prepared");
  return {
    name: row.name,
    nameTokens: row.nameTokens,
    emails: row.emails,
    phones: row.phones,
    links: row.links,
    locationText: row.locationText,
  };
}

async function extracting(id: string): Promise<StepOutcome> {
  const row = await candidate(id);
  const [file] = await db.select().from(cvFiles).where(eq(cvFiles.candidateId, id));
  if (!file) throw new Error("failed: the CV file is missing");
  const kind = detectKind(row.fileName, row.fileMime);
  if (!kind) throw new Error("failed: unsupported file type");
  const { text, needsOcr } = await extractText(new Uint8Array(file.bytes), kind);
  await db
    .insert(cvTexts)
    .values({ candidateId: id, rawText: text })
    .onConflictDoUpdate({ target: cvTexts.candidateId, set: { rawText: text } });
  return needsOcr ? "needs_ocr" : "ok";
}

// Personal details: detected once, then the founder's corrections win.
async function preparing(id: string): Promise<StepOutcome> {
  const row = await candidate(id);
  const [text] = await db.select().from(cvTexts).where(eq(cvTexts.candidateId, id));
  if (!text) throw new Error("failed: no extracted text");
  const [existing] = await db.select().from(candidatePii).where(eq(candidatePii.candidateId, id));
  const detected = detectPii(text.rawText, row.fileName, existing?.name);
  const pii: Pii = existing
    ? {
        ...detected,
        emails: [...new Set([...existing.emails, ...detected.emails])],
        phones: [...new Set([...existing.phones, ...detected.phones])],
      }
    : detected;
  await db
    .insert(candidatePii)
    .values({ candidateId: id, ...pii })
    .onConflictDoUpdate({ target: candidatePii.candidateId, set: { ...pii } });
  await db
    .update(cvTexts)
    .set({ redactedText: redact(text.rawText, pii), redactionVersion: REDACTION_VERSION })
    .where(eq(cvTexts.candidateId, id));
  return "ok";
}

// Evidence is reused for identical redacted text, including a duplicate CV
// uploaded under another name.
const evidenceCache = (id: string): EvidenceCache => ({
  async get(inputHash) {
    const [hit] = await db.select().from(evidenceTable).where(eq(evidenceTable.inputHash, inputHash)).limit(1);
    return hit ? { record: hit.record, dropped: hit.droppedFactCount } : null;
  },
  async put(inputHash, value) {
    await db
      .insert(evidenceTable)
      .values({
        candidateId: id,
        record: value.record,
        promptVersion: EVIDENCE_PROMPT_VERSION,
        inputHash,
        droppedFactCount: value.dropped,
      })
      .onConflictDoUpdate({
        target: evidenceTable.candidateId,
        set: { record: value.record, promptVersion: EVIDENCE_PROMPT_VERSION, inputHash, droppedFactCount: value.dropped },
      });
  },
});

async function evidenceStep(id: string): Promise<StepOutcome> {
  const [text] = await db.select().from(cvTexts).where(eq(cvTexts.candidateId, id));
  if (!text?.redactedText) throw new Error("failed: no redacted text");
  const pii = await loadPii(id);
  const result = await evidenceWithCache(text.redactedText, pii, evidenceCache(id));
  if (result.cached) {
    // A cache hit from another candidate still needs this candidate's own row.
    await evidenceCache(id).put(result.inputHash, result);
  }
  return "ok";
}

async function replaceFlags(id: string, flags: Flag[], types: Flag["type"][]) {
  for (const type of types) {
    await db.delete(flagsTable).where(and(eq(flagsTable.candidateId, id), eq(flagsTable.type, type)));
  }
  if (flags.length) {
    await db.insert(flagsTable).values(
      flags.map((flag) => ({
        candidateId: id,
        type: flag.type,
        detail: flag.detail,
        relatedCandidateId: flag.relatedId ?? null,
      })),
    );
  }
}

// Duplicates are symmetric, so both sides are refreshed.
async function refreshDuplicates(id: string, redacted: string) {
  const others = await db
    .select({ id: cvTexts.candidateId, redacted: cvTexts.redactedText })
    .from(cvTexts)
    .where(ne(cvTexts.candidateId, id));
  const pool = others.filter((other): other is { id: string; redacted: string } => Boolean(other.redacted));
  const mine = findDuplicates({ id, redacted }, pool);
  await replaceFlags(id, mine, ["duplicate"]);
  for (const flag of mine) {
    const relatedId = flag.relatedId as string;
    await db
      .delete(flagsTable)
      .where(and(eq(flagsTable.candidateId, relatedId), eq(flagsTable.type, "duplicate"), eq(flagsTable.relatedCandidateId, id)));
    await db.insert(flagsTable).values({ candidateId: relatedId, type: "duplicate", detail: flag.detail, relatedCandidateId: id });
  }
}

export async function scoreAndCheck(id: string): Promise<StepOutcome> {
  const row = await candidate(id);
  const [ev] = await db.select().from(evidenceTable).where(eq(evidenceTable.candidateId, id));
  const [text] = await db.select().from(cvTexts).where(eq(cvTexts.candidateId, id));
  if (!ev || !text?.redactedText) throw new Error("failed: evidence missing");
  const pii = await loadPii(id);
  const result = scoreCandidate(ev.record, row.asOfDate);

  for (const role of ["pm", "spm"] as RoleKey[]) {
    const scored = result.byRole[role];
    const values = {
      subScores: scored.subScores,
      total: scored.total,
      tier: scored.tier,
      productYears: result.productYears,
      totalYears: result.totalYears,
      suggestedRole: result.suggestedRole,
      suggestOther: suggestsOther(row.appliedRole, result.suggestedRole),
      tieKey: { ...scored.tieKey, uploadedAt: row.uploadedAt.toISOString() },
      computedAt: new Date(),
    };
    const [previous] = await db
      .select({ total: scores.total })
      .from(scores)
      .where(and(eq(scores.candidateId, id), eq(scores.role, role)));
    await db
      .insert(scores)
      .values({ candidateId: id, role, ...values })
      .onConflictDoUpdate({ target: [scores.candidateId, scores.role], set: values });
    if (previous && previous.total !== scored.total) {
      await db
        .update(drafts)
        .set({ scoresChanged: true })
        .where(and(eq(drafts.candidateId, id), eq(drafts.role, role), ne(drafts.status, "sent")));
    }
  }

  await replaceFlags(
    id,
    [
      ...findPlaceholders(text.rawText),
      ...findIdentityMismatch(pii.links, pii.nameTokens),
      ...findEducationOverlaps(ev.record, row.asOfDate),
      ...findStatedVsDated(ev.record, row.asOfDate, result.productYears),
    ],
    ["placeholder", "identity_mismatch", "education_overlap", "stated_vs_dated"],
  );
  await refreshDuplicates(id, text.redactedText);
  return "ok";
}

export const pipelineSteps: Steps = {
  extracting,
  preparing,
  evidence: evidenceStep,
  scoring: scoreAndCheck,
};
