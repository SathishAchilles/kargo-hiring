import { describe, expect, it } from "vitest";
import { createSessionToken, verifySessionToken } from "@/lib/auth/session";

const secret = "test-secret-that-is-at-least-32-characters-long";

describe("founder session", () => {
  it("accepts a fresh token", async () => {
    const token = await createSessionToken(new Date(), secret);
    expect(await verifySessionToken(token, new Date(), secret)).toBe(true);
  });

  it("rejects an expired token", async () => {
    const issued = new Date("2026-01-01T00:00:00Z");
    const token = await createSessionToken(issued, secret);
    const thirteenHoursLater = new Date(issued.getTime() + 13 * 3600 * 1000);
    expect(await verifySessionToken(token, thirteenHoursLater, secret)).toBe(false);
  });

  it("rejects a tampered token", async () => {
    const token = await createSessionToken(new Date(), secret);
    const [header, payload, signature] = token.split(".");
    const flipped = signature.slice(0, -2) + (signature.endsWith("AA") ? "BB" : "AA");
    expect(await verifySessionToken(`${header}.${payload}.${flipped}`, new Date(), secret)).toBe(false);
  });

  it("rejects a token signed with another secret", async () => {
    const token = await createSessionToken(new Date(), `${secret}-other`);
    expect(await verifySessionToken(token, new Date(), secret)).toBe(false);
  });

  it("rejects a missing token", async () => {
    expect(await verifySessionToken(undefined, new Date(), secret)).toBe(false);
  });
});
