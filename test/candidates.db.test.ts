import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { cvTexts, evidence, scores } from "@/db/schema";
import { setParseForTests } from "@/lib/ai/client";
import { correctPersonalDetails, createCandidate, updateCandidateSettings } from "@/lib/candidates/service";
import { pipelineSteps } from "@/lib/pipeline/steps";
import { cleanup, created, scoredCandidate, uniqueCv } from "./helpers/db";

afterAll(async () => {
  await cleanup();
  setParseForTests(null);
});

const preparedCandidate = (asOfDate: string) => scoredCandidate(asOfDate);

describe("createCandidate", () => {
  it("does not create a second candidate for the same file", async () => {
    const bytes = uniqueCv("pm_02_kabir_mehta.pdf");
    const input = { bytes, fileName: "cv.pdf", fileMime: "application/pdf", appliedRole: "pm" as const, asOfDate: "2026-01-01" };
    const first = await createCandidate(input);
    created.push(first.id);
    const second = await createCandidate(input);
    expect(first.created).toBe(true);
    expect(second).toEqual({ id: first.id, created: false });
  });
});

describe("editing the as-of date", () => {
  it("rescores from stored evidence without calling AI", async () => {
    const network = vi.fn(async () => {
      throw new Error("AI must not be called");
    });
    setParseForTests(network as never);
    const id = await preparedCandidate("2027-03-01");
    const before = await db.select().from(scores).where(eq(scores.candidateId, id));
    expect(before.find((row) => row.role === "pm")?.productYears).toBe(4.6);

    await updateCandidateSettings(id, { asOfDate: "2025-02-01" });
    const after = await db.select().from(scores).where(eq(scores.candidateId, id));
    expect(after.find((row) => row.role === "pm")?.productYears).toBe(2.5);
    expect(network).not.toHaveBeenCalled();
  });
});

describe("correcting personal details", () => {
  it("re-runs redaction with the corrected name and clears evidence", async () => {
    const id = await preparedCandidate("2025-02-01");
    await correctPersonalDetails(id, { name: "Portzen Technologies" });
    expect(await db.select().from(evidence).where(eq(evidence.candidateId, id))).toHaveLength(0);
    await pipelineSteps.preparing(id);
    const [text] = await db.select().from(cvTexts).where(eq(cvTexts.candidateId, id));
    expect(text.redactedText?.toLowerCase()).not.toContain("portzen");
  });
});
