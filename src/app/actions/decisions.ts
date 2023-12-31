"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireFounder } from "@/lib/auth/guard";
import { clearDecision, setDecision } from "@/lib/candidates/decisions";
import { parseDecision } from "@/lib/decisions";
import { alignDraftWithDecision } from "@/lib/drafts/service";
import { parseRole } from "@/lib/intake/validate";

function refresh(candidateId: string) {
  revalidatePath("/");
  revalidatePath(`/candidates/${candidateId}`);
}

// The founder's call on one candidate for one role. The AI only recommends; this is the decision.
export async function decide(candidateId: string, role: string, decision: string, note?: string) {
  await requireFounder();
  const parsedRole = parseRole(role);
  const parsedDecision = parseDecision(decision);
  if (!parsedRole) throw new Error("Unknown role");
  if (!parsedDecision) throw new Error("Unknown decision");
  await setDecision(candidateId, parsedRole, parsedDecision, note);
  // A drafted email of the wrong kind is redrafted in the background; the founder never waits.
  after(() => alignDraftWithDecision(candidateId, parsedRole).catch(() => undefined));
  refresh(candidateId);
}

export async function undecide(candidateId: string, role: string) {
  await requireFounder();
  const parsedRole = parseRole(role);
  if (!parsedRole) throw new Error("Unknown role");
  await clearDecision(candidateId, parsedRole);
  refresh(candidateId);
}
