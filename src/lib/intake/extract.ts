import mammoth from "mammoth";
import { extractText as extractPdfText, getDocumentProxy } from "unpdf";

export const MIN_TEXT_CHARS = 300;

export const MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

export type Extraction = { text: string; needsOcr: boolean };

// Postgres text cannot hold NUL, and other control characters are PDF noise.
export function cleanText(text: string): string {
  return text.replace(/\u0000/g, " ").replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ");
}

export function detectKind(fileName: string, mime: string): "pdf" | "docx" | null {
  const lower = fileName.toLowerCase();
  if (mime === MIME.pdf || lower.endsWith(".pdf")) return "pdf";
  if (mime === MIME.docx || lower.endsWith(".docx")) return "docx";
  return null;
}

export async function extractText(bytes: Uint8Array, kind: "pdf" | "docx"): Promise<Extraction> {
  let text: string;
  if (kind === "pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const result = await extractPdfText(pdf, { mergePages: false });
    text = result.text.join("\n");
  } else {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    text = result.value;
  }
  text = cleanText(text);
  const visible = text.replace(/\s/g, "").length;
  return { text, needsOcr: visible < MIN_TEXT_CHARS };
}
