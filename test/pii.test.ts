import { describe, expect, it } from "vitest";
import { detectPii, nameFromFilename } from "@/lib/pii/detect";
import { assertNoPii, PiiLeakError } from "@/lib/pii/gate";
import { redact } from "@/lib/pii/redact";
import { resumeFiles, resumeText } from "./helpers/resumes";

describe("detectPii over the 50 CVs", () => {
  it("finds the filename's name and at least one email in every CV", async () => {
    const files = resumeFiles();
    expect(files).toHaveLength(50);
    for (const file of files) {
      const pii = detectPii(await resumeText(file), file);
      expect(pii.name, file).toBe(nameFromFilename(file));
      expect(pii.emails.length, file).toBeGreaterThan(0);
      expect(pii.emails[0], file).toMatch(/^squad_\d@pg27\.mesaschool\.co$/);
    }
  });

  it("separates an email from a phone number glued to it", async () => {
    const pii = detectPii(await resumeText("05_ishaan_roy.pdf"), "05_ishaan_roy.pdf");
    expect(pii.emails).toEqual(["squad_1@pg27.mesaschool.co"]);
    expect(pii.phones).toContain("9049153824");
  });

  it("finds the name from text when the filename has no pattern", async () => {
    const pii = detectPii(await resumeText("pm_02_kabir_mehta.pdf"), "cv.pdf");
    expect(pii.name).toBe("Kabir Mehta");
  });

  it("uses a founder correction over detection", async () => {
    const pii = detectPii(await resumeText("pm_02_kabir_mehta.pdf"), "cv.pdf", "Kabir A. Mehta");
    expect(pii.nameTokens).toEqual(["kabir", "mehta"]);
  });
});

describe("redact", () => {
  it("removes every form of the name, including run-together forms", async () => {
    const text = await resumeText("01_rohan_mehta.pdf");
    const redacted = redact(text, detectPii(text, "01_rohan_mehta.pdf"));
    expect(redacted.toLowerCase()).not.toContain("rohan");
    expect(redacted.toLowerCase()).not.toContain("mehta");
  });

  it("removes short name tokens glued to other words", async () => {
    const text = await resumeText("05_ishaan_roy.pdf");
    const redacted = redact(text, detectPii(text, "05_ishaan_roy.pdf"));
    expect(redacted).not.toMatch(/(?<![A-Za-z])roy(?![a-z])/i);
  });

  it("keeps degree and years but drops the institution", async () => {
    const file = "spm_17_nalini_iyer.pdf";
    const text = await resumeText(file);
    const redacted = redact(text, detectPii(text, file));
    expect(redacted).toContain("MBA, Operations & Logistics");
    expect(redacted).toContain("2015–2017");
    expect(redacted).not.toContain("IIM Calcutta");
  });

  it("leaves every one of the 50 redacted CVs clean for the leak gate", async () => {
    for (const file of resumeFiles()) {
      const text = await resumeText(file);
      const pii = detectPii(text, file);
      const redacted = redact(text, pii);
      expect(() => assertNoPii(redacted, pii), file).not.toThrow();
      for (const email of pii.emails) expect(redacted, file).not.toContain(email);
    }
  });
});

describe("assertNoPii", () => {
  const pii = detectPii("Priya Krishnan\npriya@example.com +91 98442 31075", "cv.pdf", "Priya Krishnan");

  it("throws on an email before anything is sent", () => {
    const send = () => {
      assertNoPii("Candidate wrote to priya@example.com", pii);
      return "sent";
    };
    expect(send).toThrow(PiiLeakError);
  });

  it("throws on a phone written with different spacing", () => {
    expect(() => assertNoPii("call 9844231075", pii)).toThrow(/phone/);
  });

  it("passes redacted text", () => {
    expect(() => assertNoPii("[CANDIDATE] shipped 7 features at [EMAIL]", pii)).not.toThrow();
  });
});
