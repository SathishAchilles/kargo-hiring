import { describe, expect, it } from "vitest";
import { MAX_FILE_BYTES, parseAsOfDate, validateBatch } from "@/lib/intake/validate";

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

describe("parseAsOfDate", () => {
  const today = new Date("2026-10-01T10:00:00Z");
  it("accepts a real date up to today", () => {
    expect(parseAsOfDate("2025-02-01", today)).toBe("2025-02-01");
    expect(parseAsOfDate("2026-10-01", today)).toBe("2026-10-01");
  });
  it("rejects the future, impossible dates, old dates and non-dates", () => {
    expect(parseAsOfDate("2026-10-02", today)).toBeNull();
    expect(parseAsOfDate("2025-02-30", today)).toBeNull();
    expect(parseAsOfDate("1999-12-31", today)).toBeNull();
    expect(parseAsOfDate("01/02/2025", today)).toBeNull();
    expect(parseAsOfDate("", today)).toBeNull();
    expect(parseAsOfDate(undefined, today)).toBeNull();
  });
});
