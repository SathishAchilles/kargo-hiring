import { readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { extractText } from "@/lib/intake/extract";

export const RESUME_DIR = path.join(homedir(), "ws/resumes");

export const resumeFiles = () => readdirSync(RESUME_DIR).filter((file) => file.endsWith(".pdf")).sort();

const cache = new Map<string, string>();

export async function resumeText(file: string): Promise<string> {
  const hit = cache.get(file);
  if (hit) return hit;
  const { text } = await extractText(new Uint8Array(readFileSync(path.join(RESUME_DIR, file))), "pdf");
  cache.set(file, text);
  return text;
}
