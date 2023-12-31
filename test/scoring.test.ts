import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Evidence } from "@/lib/evidence/schema";
import { rank } from "@/lib/scoring/rank";
import { scoreCandidate, suggestsOther, tierFor } from "@/lib/scoring/score";
import { productYears, totalYears } from "@/lib/scoring/years";
import { evidence, role } from "./helpers/evidence";

const sub = (scores: ReturnType<typeof scoreCandidate>, key: "pm" | "spm") =>
  Object.fromEntries(scores.byRole[key].subScores.map((item) => [item.criterion, item.score]));

describe("product and total years", () => {
  it("excludes ops years from product years", () => {
    const roles = [
      role({ roleType: "operations", opsDomain: "freight", start: "2017-01", end: "2019-12" }),
      role({ start: "2020-01", end: "2023-12" }),
    ];
    expect(productYears(roles, "2025-01-01")).toBe(4);
    expect(totalYears(roles, "2025-01-01")).toBe(7);
  });

  it("counts overlapping product roles once", () => {
    const roles = [role({ start: "2020-01", end: "2021-12" }), role({ start: "2021-01", end: "2022-12" })];
    expect(productYears(roles, "2025-01-01")).toBe(3);
  });

  it("counts APM as product and consulting as not", () => {
    const roles = [
      role({ title: "Associate Product Manager", start: "2020-01", end: "2020-12" }),
      role({ roleType: "consulting", opsDomain: "desk", start: "2021-01", end: "2021-12" }),
    ];
    expect(productYears(roles, "2025-01-01")).toBe(1);
    expect(totalYears(roles, "2025-01-01")).toBe(2);
  });

  it("ends 'present' at the as-of date", () => {
    const roles = [role({ start: "2022-08", end: "present" })];
    expect(productYears(roles, "2027-03-01")).toBe(4.6);
    expect(productYears(roles, "2025-02-01")).toBe(2.5);
  });
});

describe("PM rubric", () => {
  it("scores the freight operator turned sole PM at 100", () => {
    const e = evidence({
      roles: [
        role({ roleType: "operations", opsDomain: "freight", start: "2020-01", end: "2022-02", title: "3PL ops" }),
        role({ start: "2022-03", soleOrFirstPm: true, pmAbove: false, companySizeBand: "under_100", onsiteOpsImmersion: true }),
      ],
      shipped: [{ what: "alerts", outcome: "-34% exceptions", iterated: false, roleIndex: 1, quote: "shipped alerts" }],
      killed: [{ what: "3 features", reason: "<8% adoption", sunkCost: false, quote: "killed 3" }],
      discovery: [{ cadence: "recurring", onsite: true, withOpsUsers: true, viaOtherTeamsOnly: false, quote: "fortnightly on site" }],
    });
    const scores = scoreCandidate(e, "2025-01-01");
    expect(sub(scores, "pm")).toEqual({ P1: 5, P2: 5, P3: 5, P4: 5, P5: 5 });
    expect(scores.byRole.pm.total).toBe(100);
  });

  it("scores a big-company PM with no ops background", () => {
    const e = evidence({
      roles: [role({ start: "2022-01", end: "2024-12", pmAbove: true, companySizeBand: "100_plus" })],
      shipped: [{ what: "bulk upload", outcome: "-40% tickets", iterated: false, roleIndex: 0, quote: "bulk upload" }],
    });
    expect(sub(scoreCandidate(e, "2025-06-01"), "pm")).toMatchObject({ P1: 1, P3: 2, P5: 5 });
  });

  it("gives committee-driven product work P3 = 1", () => {
    const e = evidence({ roles: [role({ committeeDecisions: true, pmAbove: true, companySizeBand: "100_plus" })] });
    expect(sub(scoreCandidate(e, "2025-01-01"), "pm").P3).toBe(1);
  });
});

describe("P1 and S3 ladder", () => {
  const ops = (e: Parameters<typeof scoreCandidate>[0]) => sub(scoreCandidate(e, "2025-06-01"), "pm").P1;
  const disc = (over: Partial<Evidence["discovery"][number]>): Evidence["discovery"][number] => ({
    cadence: "recurring",
    onsite: false,
    withOpsUsers: true,
    viaOtherTeamsOnly: false,
    quote: "interviews with brand operations managers",
    ...over,
  });

  it("gives 2 to a PM who only interviewed ops users off site (Rohan Sane's case)", () => {
    const e = evidence({ roles: [role()], discovery: [disc({})] });
    expect(ops(e)).toBe(2);
    expect(sub(scoreCandidate(e, "2025-06-01"), "spm").S3).toBe(2);
  });

  it("gives 3 to on-site immersion with ops users in a product role, with no ops job", () => {
    const viaRole = evidence({ roles: [role({ onsiteOpsImmersion: true })] });
    const viaDiscovery = evidence({ roles: [role()], discovery: [disc({ onsite: true })] });
    expect(ops(viaRole)).toBe(3);
    expect(ops(viaDiscovery)).toBe(3);
  });

  it("does not count on-site discovery with consumers as immersion with ops users", () => {
    const e = evidence({ roles: [role()], discovery: [disc({ onsite: true, withOpsUsers: false })] });
    expect(ops(e)).toBe(1);
  });

  it("keeps an ops job above immersion alone: freight job → 4, plus immersion → 5", () => {
    const job = role({ roleType: "operations", opsDomain: "freight", start: "2018-01", end: "2020-12", title: "Terminal ops" });
    expect(ops(evidence({ roles: [job, role()] }))).toBe(4);
    expect(ops(evidence({ roles: [job, role({ onsiteOpsImmersion: true })] }))).toBe(5);
  });

  it("still gives 1 with no ops exposure at all", () => {
    expect(ops(evidence({ roles: [role()] }))).toBe(1);
  });
});

describe("Senior PM rubric", () => {
  it("gives S1 = 3 for owning a platform module that runs inside customers' systems", () => {
    const e = evidence({ platforms: [{ what: "TMS dispatch and carrier-rate modules", quote: "built the TMS product" }] });
    expect(sub(scoreCandidate(e, "2025-01-01"), "spm").S1).toBe(3);
  });

  it("keeps S1 levels 4 and 5 for integrations only, even with a platform", () => {
    const e = evidence({
      platforms: [{ what: "TMS", quote: "TMS" }],
      integrations: [{ system: "CargoWise", category: "erp", involvement: "owned", commercialOutcome: "unblocked 5 deals", quote: "CargoWise" }],
    });
    expect(sub(scoreCandidate(e, "2025-01-01"), "spm").S1).toBe(5);
  });

  it("gives S1 = 5 for an owned CargoWise integration that unstalled accounts", () => {
    const e = evidence({
      integrations: [
        {
          system: "CargoWise One",
          category: "erp",
          involvement: "owned",
          commercialOutcome: "opened up 5 freight forwarder accounts that had been stalled",
          quote: "integration with CargoWise One",
        },
      ],
    });
    expect(sub(scoreCandidate(e, "2025-01-01"), "spm").S1).toBe(5);
  });

  it("gives S1 = 2 for contributed integrations only", () => {
    const e = evidence({
      integrations: [{ system: "SAP", category: "erp", involvement: "contributed", commercialOutcome: null, quote: "SAP" }],
    });
    expect(sub(scoreCandidate(e, "2025-01-01"), "spm").S1).toBe(2);
  });
});

describe("tiers and routing", () => {
  it("maps 80 to Strong and 79 to Good", () => {
    expect(tierFor(80)).toBe("Strong");
    expect(tierFor(79)).toBe("Good");
    expect(tierFor(50)).toBe("Partial");
    expect(tierFor(49)).toBe("Weak");
  });

  it("does not mark a Senior PM applicant with 4.0 product years", () => {
    const e = evidence({ roles: [role({ start: "2021-01", end: "2024-12" })] });
    const scores = scoreCandidate(e, "2025-01-01");
    expect(scores.suggestedRole).toBe("pm_or_spm");
    expect(suggestsOther("spm", scores.suggestedRole)).toBe(false);
  });

  it("marks a PM applicant with 6.0 product years", () => {
    const e = evidence({ roles: [role({ start: "2019-01", end: "2024-12" })] });
    const scores = scoreCandidate(e, "2025-01-01");
    expect(scores.suggestedRole).toBe("spm");
    expect(suggestsOther("pm", scores.suggestedRole)).toBe(true);
  });

  it("records Mumbai as an unscored flag", () => {
    const base = evidence({ roles: [role()] });
    const inChennai = scoreCandidate({ ...base, location: { text: "Chennai", quote: "Chennai" } }, "2025-01-01");
    const nowhere = scoreCandidate(base, "2025-01-01");
    expect(inChennai.isMumbai).toBe(false);
    expect(inChennai.byRole.pm.total).toBe(nowhere.byRole.pm.total);
  });
});

describe("ranking", () => {
  const key = (kills: number, uploadedAt = "2026-01-01T00:00:00Z") => ({
    kills,
    first: 5,
    second: 5,
    evidenceCount: 10,
    uploadedAt,
  });

  it("breaks a tie at 100 on kill evidence and labels both", () => {
    const ranked = rank(
      [
        { id: "b", total: 100, tieKey: key(2) },
        { id: "a", total: 100, tieKey: key(3) },
        { id: "c", total: 90, tieKey: key(0) },
      ],
      "pm",
    );
    expect(ranked.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(ranked[0].tieBrokenBy).toBe("kill evidence");
    expect(ranked[1].tieBrokenBy).toBe("kill evidence");
    expect(ranked[2].tieBrokenBy).toBeNull();
  });

  it("falls back to upload time", () => {
    const ranked = rank(
      [
        { id: "late", total: 70, tieKey: key(1, "2026-02-01T00:00:00Z") },
        { id: "early", total: 70, tieKey: key(1, "2026-01-01T00:00:00Z") },
      ],
      "spm",
    );
    expect(ranked.map((item) => item.id)).toEqual(["early", "late"]);
    expect(ranked[0].tieBrokenBy).toBe("upload time");
  });
});

describe("recorded fixtures against the manual pass", () => {
  const load = (stem: string): Evidence =>
    JSON.parse(readFileSync(path.resolve(`test/fixtures/evidence/${stem}.json`), "utf8")).record;

  it("keeps the three fixtures within the manual pass's bands", () => {
    const priya = scoreCandidate(load("pm_01_priya_krishnan"), "2025-02-01");
    const siddharth = scoreCandidate(load("spm_16_siddharth_rao"), "2025-02-01");
    const tarun = scoreCandidate(load("11_tarun_joseph"), "2026-09-28");
    expect(priya.byRole.pm.total).toBeGreaterThanOrEqual(85);
    expect(siddharth.byRole.spm.total).toBeGreaterThanOrEqual(80);
    expect(tarun.byRole.spm.total).toBeGreaterThanOrEqual(65);
  });
});
