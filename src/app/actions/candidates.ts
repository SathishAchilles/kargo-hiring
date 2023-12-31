"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireFounder } from "@/lib/auth/guard";
import { correctPersonalDetails, createCandidate, updateCandidateSettings } from "@/lib/candidates/service";
import { processCandidate, reprocessFrom } from "@/lib/pipeline";
import { parseAsOfDate, parseRole, validateFile } from "@/lib/intake/validate";

export type UploadResult =
  | { ok: true; name: string; id: string; duplicate: boolean }
  | { ok: false; name: string; reason: string };

const today = () => new Date().toISOString().slice(0, 10);

// One file per call: the client loops over a batch so one bad file never
// blocks the others, and each request stays under the 6 MB action limit.
export async function uploadCv(formData: FormData): Promise<UploadResult> {
  await requireFounder();
  const file = formData.get("file");
  const role = parseRole(formData.get("role"));
  const name = file instanceof File ? file.name : "file";
  if (!role) return { ok: false, name, reason: "Select the role these CVs applied for." };
  if (!(file instanceof File)) return { ok: false, name, reason: "No file received." };
  const verdict = validateFile({ name: file.name, type: file.type, size: file.size });
  if (!verdict.ok) return { ok: false, name, reason: verdict.reason };
  // Optional: the date the CV was written, for CVs whose "Present" is not today.
  const asOfRaw = String(formData.get("asOf") ?? "").trim();
  const asOfDate = asOfRaw === "" ? today() : parseAsOfDate(asOfRaw);
  if (!asOfDate) return { ok: false, name, reason: "Enter a valid as-of date (not in the future)." };

  const { id, created } = await createCandidate({
    bytes: new Uint8Array(await file.arrayBuffer()),
    fileName: file.name,
    fileMime: file.type || (verdict.kind === "pdf" ? "application/pdf" : "application/octet-stream"),
    appliedRole: role,
    asOfDate,
  });
  if (created) after(() => processCandidate(id));
  revalidatePath("/");
  return { ok: true, name, id, duplicate: !created };
}

export async function retryCandidate(id: string) {
  await requireFounder();
  after(() => processCandidate(id));
  revalidatePath("/");
}

export async function updateSettings(id: string, input: { appliedRole?: string; asOfDate?: string }) {
  await requireFounder();
  const appliedRole = input.appliedRole === undefined ? undefined : parseRole(input.appliedRole);
  if (input.appliedRole !== undefined && !appliedRole) throw new Error("Unknown role");
  if (input.asOfDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(input.asOfDate)) throw new Error("Invalid date");
  await updateCandidateSettings(id, { appliedRole: appliedRole ?? undefined, asOfDate: input.asOfDate });
  revalidatePath("/");
  revalidatePath(`/candidates/${id}`);
}

export async function correctDetails(id: string, input: { name?: string; email?: string; phone?: string }) {
  await requireFounder();
  await correctPersonalDetails(id, input);
  after(() => reprocessFrom(id, "preparing"));
  revalidatePath(`/candidates/${id}`);
}
