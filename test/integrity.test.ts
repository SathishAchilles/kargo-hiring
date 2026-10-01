import { describe, expect, it } from "vitest";
import {
  findDuplicates,
  findEducationOverlaps,
  findIdentityMismatch,
  findPlaceholders,
  findStatedVsDated,
  jaccard,
  shingles,
} from "@/lib/integrity/checks";
import { detectPii } from "@/lib/pii/detect";
import { redact } from "@/lib/pii/redact";
import { scoreCandidate } from "@/lib/scoring/score";
import { rank } from "@/lib/scoring/rank";
import { evidence, role } from "./helpers/evidence";
import { resumeFiles, resumeText } from "./helpers/resumes";

async function redactedOf(file: string) {
  const text = await resumeText(file);
  const pii = detectPii(text, file);
  return { text, pii, redacted: redact(text, pii) };
}

describe("duplicates", () => {
  it("flags #14 and #21 as the same CV", async () => {
    const a = await redactedOf("14_sneha_kulkarni.pdf");
    const b = await redactedOf("21_aryan_kulkarni.pdf");
    expect(jaccard(shingles(a.redacted), shingles(b.redacted))).toBeGreaterThanOrEqual(0.9);
    const flags = findDuplicates({ id: "14", redacted: a.redacted }, [{ id: "21", redacted: b.redacted }]);
    expect(flags).toEqual([expect.objectContaining({ type: "duplicate", relatedId: "21" })]);
  });

  it("does not flag two different freight PMs", async () => {
    const a = await redactedOf("pm_01_priya_krishnan.pdf");
    const b = await redactedOf("pm_04_virat_patel.pdf");
    expect(jaccard(shingles(a.redacted), shingles(b.redacted))).toBeLessThan(0.9);
  });

  it("finds exactly one duplicate pair across all 50 CVs", async () => {
    const all = await Promise.all(resumeFiles().map(async (file) => ({ id: file, redacted: (await redactedOf(file)).redacted })));
    const flagged = all.filter((item) => findDuplicates(item, all).length > 0).map((item) => item.id);
    expect(flagged).toEqual(["14_sneha_kulkarni.pdf", "21_aryan_kulkarni.pdf"]);
  });
});

describe("placeholders", () => {
  it("flags INR XXL with its quote", async () => {
    const { text } = await redactedOf("11_tarun_joseph.pdf");
    const flags = findPlaceholders(text);
    expect(flags).toHaveLength(1);
    expect(String(flags[0].detail.quote)).toContain("INR XXL/year");
  });

  it("ignores XL inside ordinary words and sizes", () => {
    expect(findPlaceholders("XLRI alumnus; sold XL T-shirts; used Excel")).toEqual([]);
  });

  it("flags only #11 across all 50 CVs", async () => {
    const flagged = [];
    for (const file of resumeFiles()) if (findPlaceholders(await resumeText(file)).length) flagged.push(file);
    expect(flagged).toEqual(["11_tarun_joseph.pdf"]);
  });
});

describe("identity mismatch", () => {
  const tokens = (name: string) => name.toLowerCase().split(" ");

  it("flags a LinkedIn handle that names someone else", () => {
    const flags = findIdentityMismatch(["https://www.linkedin.com/in/aniket-borikar-1as116a"], tokens("Aman Borkar"));
    expect(flags).toHaveLength(1);
  });

  it("accepts handles built from the candidate's own name", () => {
    expect(findIdentityMismatch(["linkedin.com/in/priyakrishnan-pm"], tokens("Priya Krishnan"))).toEqual([]);
    expect(findIdentityMismatch(["linkedin.com/in/arjun-verma-pmin"], tokens("Arjun Verma"))).toEqual([]);
    expect(findIdentityMismatch(["linkedin.com/in/tarun-joseph-pm"], tokens("Tarun Joseph"))).toEqual([]);
  });

  it("flags only #30 across all 50 CVs", async () => {
    const flagged = [];
    for (const file of resumeFiles()) {
      const { pii } = await redactedOf(file);
      if (findIdentityMismatch(pii.links, pii.nameTokens).length) flagged.push(file);
    }
    expect(flagged).toEqual(["30_aman_borkar.pdf"]);
  });
});

describe("dates", () => {
  it("flags a job overlapping a full-time MBA", () => {
    const e = evidence({
      roles: [role({ roleType: "operations", title: "Documentation Executive", start: "2014-08", end: "2017-04" })],
      education: [{ degree: "MBA, Operations & Logistics", startYear: 2015, endYear: 2017, mode: "full_time", quote: "MBA" }],
    });
    expect(findEducationOverlaps(e, "2025-02-01")).toEqual([expect.objectContaining({ type: "education_overlap" })]);
  });

  it("does not flag an executive programme", () => {
    const e = evidence({
      roles: [role({ start: "2024-01", end: "present" })],
      education: [{ degree: "Product Management and Gen AI — Executive Program", startYear: 2024, endYear: 2025, mode: "executive", quote: "Executive Program" }],
    });
    expect(findEducationOverlaps(e, "2026-01-01")).toEqual([]);
  });

  it("flags a stated tenure a year longer than the dates", () => {
    const e = evidence({
      roles: [role({ roleType: "operations", start: "2016-06", end: "2018-03" })],
      statedFigures: [{ about: "role", roleIndex: 0, years: 3, quote: "spent 3 years there" }],
    });
    expect(findStatedVsDated(e, "2025-01-01", 0)).toEqual([
      expect.objectContaining({ detail: expect.objectContaining({ stated: 3, dated: 1.8 }) }),
    ]);
  });
});

describe("flags never change scores", () => {
  it("leaves totals, tiers and rank unchanged", () => {
    const e = evidence({
      roles: [role({ start: "2021-01", soleOrFirstPm: true, pmAbove: false, companySizeBand: "under_100" })],
      shipped: [{ what: "x", outcome: "y", iterated: true, roleIndex: 0, quote: "x" }],
    });
    const before = scoreCandidate(e, "2025-01-01");
    const flags = [...findPlaceholders("INR XXL"), ...findIdentityMismatch(["linkedin.com/in/someone-else"], ["a", "b"])];
    expect(flags.length).toBeGreaterThan(0);
    const after = scoreCandidate(e, "2025-01-01");
    expect(after).toEqual(before);
    const key = { ...before.byRole.pm.tieKey, uploadedAt: "2026-01-01" };
    expect(rank([{ id: "c", total: after.byRole.pm.total, tieKey: key }], "pm")[0].rank).toBe(1);
  });
});

describe("stated vs dated on a running role", () => {
  it("is not compared, because 'present' depends on the as-of date", () => {
    const e = evidence({
      roles: [role({ start: "2023-01", end: "present" })],
      statedFigures: [{ about: "role", roleIndex: 0, years: 1.2, quote: "for the next 14 months" }],
    });
    expect(findStatedVsDated(e, "2026-09-28", 0)).toEqual([]);
  });
});

describe("date flag noise", () => {
  it("treats '2.5+ years' as a lower bound", () => {
    const e = evidence({ statedFigures: [{ about: "product_experience", roleIndex: null, years: 2.5, quote: "PM with 2.5+ years of experience" }] });
    expect(findStatedVsDated(e, "2026-01-01", 3.9)).toEqual([]);
    expect(findStatedVsDated(e, "2026-01-01", 1.2)).toHaveLength(1);
  });

  it("ignores extracurricular roles during a degree", () => {
    const e = evidence({
      roles: [role({ roleType: "other", title: "General Secretary, NSS", start: "2016-04", end: "2017-03" })],
      education: [{ degree: "B.Tech", startYear: 2013, endYear: 2017, mode: "full_time", quote: "B.Tech" }],
    });
    expect(findEducationOverlaps(e, "2026-01-01")).toEqual([]);
  });
});
