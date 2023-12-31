import type { RoleKey } from "@/lib/types";
import { detectKind } from "./extract";
import { MAX_FILE_BYTES } from "./limits";

export { MAX_FILE_BYTES };

export type UploadFileMeta = { name: string; type: string; size: number };

export type FileVerdict =
  | { name: string; ok: true; kind: "pdf" | "docx" }
  | { name: string; ok: false; reason: string };

export function parseRole(value: unknown): RoleKey | null {
  return value === "pm" || value === "spm" ? value : null;
}

export function validateFile(file: UploadFileMeta): FileVerdict {
  const kind = detectKind(file.name, file.type);
  if (!kind) return { name: file.name, ok: false, reason: "Only PDF and DOCX files are accepted." };
  if (file.size > MAX_FILE_BYTES) return { name: file.name, ok: false, reason: "File is larger than 5 MB." };
  if (file.size === 0) return { name: file.name, ok: false, reason: "File is empty." };
  return { name: file.name, ok: true, kind };
}

export type BatchVerdict =
  | { ok: false; error: string }
  | { ok: true; role: RoleKey; files: FileVerdict[] };

// A missing role refuses the whole upload; bad files are rejected one by one.
export function validateBatch(role: unknown, files: UploadFileMeta[]): BatchVerdict {
  const parsed = parseRole(role);
  if (!parsed) return { ok: false, error: "Select the role these CVs applied for." };
  if (files.length === 0) return { ok: false, error: "Choose at least one CV file." };
  return { ok: true, role: parsed, files: files.map(validateFile) };
}

// An optional "as of" date for CVs written some time ago, so roles ending "Present" are dated
// correctly. Must be a real calendar date, from 2000 up to today.
export function parseAsOfDate(value: unknown, today = new Date()): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  if (date.getUTCFullYear() < 2000) return null;
  if (value > today.toISOString().slice(0, 10)) return null;
  return value;
}
