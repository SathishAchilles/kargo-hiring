"use server";

import { revalidatePath } from "next/cache";
import { requireFounder } from "@/lib/auth/guard";
import { editDraft, ensureDraft, sendDraft, type SendOutcome } from "@/lib/drafts/service";
import { parseRole } from "@/lib/intake/validate";
import type { DraftKind } from "@/lib/types";

function roleOf(value: string) {
  const role = parseRole(value);
  if (!role) throw new Error("Unknown role");
  return role;
}

// Lazy: the brief and draft for a role are generated the first time it is opened.
export async function openDraft(candidateId: string, role: string) {
  await requireFounder();
  await ensureDraft(candidateId, roleOf(role));
  revalidatePath(`/candidates/${candidateId}`);
}

export async function regenerateDraft(candidateId: string, role: string, kind?: DraftKind) {
  await requireFounder();
  await ensureDraft(candidateId, roleOf(role), { kind, force: true });
  revalidatePath(`/candidates/${candidateId}`);
}

export async function saveDraft(candidateId: string, draftId: string, input: { subject: string; body: string }) {
  await requireFounder();
  await editDraft(draftId, input);
  revalidatePath(`/candidates/${candidateId}`);
}

export async function sendDraftAction(candidateId: string, draftId: string): Promise<SendOutcome> {
  await requireFounder();
  const outcome = await sendDraft(draftId);
  revalidatePath(`/candidates/${candidateId}`);
  revalidatePath("/");
  return outcome;
}
