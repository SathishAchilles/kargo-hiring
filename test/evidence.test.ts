import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { evidenceWithCache, type EvidenceCache } from "@/lib/evidence/extract";
import { evidenceSchema, type Evidence } from "@/lib/evidence/schema";
import { verifyEvidence } from "@/lib/evidence/verify";
import { detectPii } from "@/lib/pii/detect";

const fixtureDir = path.resolve("test/fixtures/evidence");
const fixtures = readdirSync(fixtureDir).map((file) => JSON.parse(readFileSync(path.join(fixtureDir, file), "utf8")));

describe("recorded evidence fixtures", () => {
  it("parse into the evidence schema", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(3);
    for (const fixture of fixtures) expect(() => evidenceSchema.parse(fixture.record), fixture.file).not.toThrow();
  });

  it("have every quote present in the redacted text", () => {
    for (const fixture of fixtures) {
      expect(verifyEvidence(fixture.record, fixture.redacted).dropped, fixture.file).toBe(0);
    }
  });
});

describe("verifyEvidence", () => {
  const base = fixtures.find((fixture) => fixture.file === "pm_01_priya_krishnan.pdf");

  it("drops an invented quote and counts it", () => {
    const record: Evidence = structuredClone(base.record);
    record.shipped.push({ what: "AI copilot", outcome: "3x revenue", iterated: false, roleIndex: 2, quote: "launched an AI copilot that tripled revenue" });
    const result = verifyEvidence(record, base.redacted);
    expect(result.dropped).toBe(1);
    expect(result.record.shipped.map((item) => item.what)).not.toContain("AI copilot");
  });

  it("drops a role with an unusable date and remaps role indexes", () => {
    const record: Evidence = structuredClone(base.record);
    record.roles[0] = { ...record.roles[0], start: "Feb 2020" };
    const lastIndex = record.roles.length - 1;
    record.shipped = record.shipped.map((item) => ({ ...item, roleIndex: lastIndex }));
    const result = verifyEvidence(record, base.redacted);
    expect(result.record.roles).toHaveLength(record.roles.length - 1);
    expect(result.record.shipped.every((item) => item.roleIndex === lastIndex - 1)).toBe(true);
  });
});

describe("evidenceWithCache", () => {
  it("makes no AI call the second time for the same input", async () => {
    const store = new Map<string, Awaited<ReturnType<EvidenceCache["get"]>>>();
    const cache: EvidenceCache = {
      get: async (hash) => store.get(hash) ?? null,
      put: async (hash, value) => void store.set(hash, value),
    };
    const extract = vi.fn(async () => ({ record: fixtures[0].record as Evidence, dropped: 0 }));
    const pii = detectPii("x", "pm_01_priya_krishnan.pdf");
    const first = await evidenceWithCache("same text", pii, cache, extract);
    const second = await evidenceWithCache("same text", pii, cache, extract);
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(extract).toHaveBeenCalledTimes(1);
  });
});
