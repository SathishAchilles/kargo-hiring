import { describe, expect, it } from "vitest";
import { MAX_FILE_BYTES, validateBatch } from "@/lib/intake/validate";

const pdf = { name: "cv.pdf", type: "application/pdf", size: 120_000 };

describe("validateBatch", () => {
  it("refuses an upload without a role", () => {
    expect(validateBatch(undefined, [pdf])).toEqual({
      ok: false,
      error: "Select the role these CVs applied for.",
    });
  });

  it("rejects a PNG", () => {
    const result = validateBatch("pm", [{ name: "photo.png", type: "image/png", size: 1000 }]);
    expect(result.ok && result.files[0]).toMatchObject({ ok: false, reason: "Only PDF and DOCX files are accepted." });
  });

  it("rejects a 6 MB PDF", () => {
    const result = validateBatch("spm", [{ ...pdf, size: 6 * 1024 * 1024 }]);
    expect(result.ok && result.files[0]).toMatchObject({ ok: false, reason: "File is larger than 5 MB." });
  });

  it("accepts the valid files in a mixed batch", () => {
    const result = validateBatch("pm", [
      pdf,
      { name: "photo.png", type: "image/png", size: 1000 },
      { name: "cv.docx", type: "", size: MAX_FILE_BYTES },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.role).toBe("pm");
    expect(result.files.map((file) => file.ok)).toEqual([true, false, true]);
  });
});
