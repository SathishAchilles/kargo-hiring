import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { parseGated, setParseForTests } from "@/lib/ai/client";
import { detectPii } from "@/lib/pii/detect";
import { PiiLeakError } from "@/lib/pii/gate";

const pii = detectPii("Priya Krishnan priya@example.com", "cv.pdf", "Priya Krishnan");

afterEach(() => setParseForTests(null));

describe("parseGated", () => {
  it("throws before the network call when the payload contains an email", async () => {
    const network = vi.fn();
    setParseForTests(network as never);
    await expect(
      parseGated({
        pii,
        model: "m",
        system: "extract",
        user: "contact priya@example.com",
        schema: z.object({ ok: z.boolean() }),
        effort: "low",
      }),
    ).rejects.toBeInstanceOf(PiiLeakError);
    expect(network).not.toHaveBeenCalled();
  });

  it("returns parsed output for a clean payload", async () => {
    const network = vi.fn(async () => ({ stop_reason: "end_turn", parsed_output: { ok: true } }));
    setParseForTests(network as never);
    const result = await parseGated({
      pii,
      model: "m",
      system: "extract",
      user: "[CANDIDATE] shipped 7 features",
      schema: z.object({ ok: z.boolean() }),
      effort: "low",
    });
    expect(result).toEqual({ ok: true });
    expect(network).toHaveBeenCalledTimes(1);
  });

  it("rejects a refusal", async () => {
    setParseForTests((async () => ({ stop_reason: "refusal", parsed_output: null })) as never);
    await expect(
      parseGated({ pii, model: "m", system: "s", user: "u", schema: z.object({}), effort: "low" }),
    ).rejects.toThrow("declined");
  });
});

describe("AI calls outside the gated client", () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = path.join(dir, entry);
      return statSync(full).isDirectory() ? sourceFiles(full) : /\.(ts|tsx)$/.test(entry) ? [full] : [];
    });
  }

  it("only src/lib/ai/client.ts talks to the Anthropic SDK", () => {
    const offenders = sourceFiles(path.resolve("src"))
      .filter((file) => !file.endsWith(path.join("lib", "ai", "client.ts")))
      .filter((file) => /@anthropic-ai\/sdk|messages\.(create|parse|stream)\(/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
