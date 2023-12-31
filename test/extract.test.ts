import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectKind, extractText } from "@/lib/intake/extract";

const resumes = path.join(homedir(), "ws/resumes");
const jds = path.join(homedir(), "ws/jds");

// A valid one-page PDF with no text layer, standing in for a scanned CV.
function blankPdf(): Uint8Array {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

describe("extractText", () => {
  it("reads a text PDF CV", async () => {
    const bytes = new Uint8Array(readFileSync(path.join(resumes, "pm_01_priya_krishnan.pdf")));
    const result = await extractText(bytes, "pdf");
    expect(result.needsOcr).toBe(false);
    expect(result.text).toContain("Portzen Technologies");
  });

  it("reads a DOCX file", async () => {
    const bytes = new Uint8Array(readFileSync(path.join(jds, "MESA_Kargo_JD_Product Manager.docx")));
    const result = await extractText(bytes, "docx");
    expect(result.needsOcr).toBe(false);
    expect(result.text).toContain("freight forwarders");
  });

  it("marks an image-only PDF as needing OCR", async () => {
    const result = await extractText(blankPdf(), "pdf");
    expect(result.needsOcr).toBe(true);
  });
});

describe("detectKind", () => {
  it("accepts PDF and DOCX and rejects images", () => {
    expect(detectKind("cv.PDF", "")).toBe("pdf");
    expect(detectKind("cv.docx", "")).toBe("docx");
    expect(detectKind("photo.png", "image/png")).toBeNull();
  });
});

describe("cleanText", () => {
  it("removes NUL and control characters but keeps line breaks and tabs", async () => {
    const { cleanText } = await import("@/lib/intake/extract");
    expect(cleanText("a\u0000b\u0007c\nd\te")).toBe("a b c\nd\te");
  });

  it("leaves no NUL in the text of #23, whose PDF contains 51", async () => {
    const bytes = new Uint8Array(readFileSync(path.join(resumes, "23_karan_das.pdf")));
    const result = await extractText(bytes, "pdf");
    expect(result.text.includes("\u0000")).toBe(false);
  });
});
