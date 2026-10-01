import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { detectPii } from "@/lib/pii/detect";

// The real client module with only the network call replaced, so the request we build and the
// way we read the answer are both tested.
const generateContent = vi.fn();

vi.mock("@google/genai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@google/genai")>();
  return {
    ...actual,
    GoogleGenAI: class {
      models = { generateContent };
    },
  };
});

const pii = detectPii("", "cv.pdf");
const schema = z.object({ ok: z.boolean(), items: z.array(z.string()) });
const reply = (extra: Record<string, unknown> = {}) => ({
  text: JSON.stringify({ ok: true, items: ["a"] }),
  candidates: [{ finishReason: "STOP" }],
  ...extra,
});

async function load() {
  vi.resetModules();
  return import("@/lib/ai/client");
}

beforeEach(() => {
  generateContent.mockReset();
  vi.stubEnv("GEMINI_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("Gemini client", () => {
  it("asks for JSON that follows the schema, with the system prompt, and returns the parsed answer", async () => {
    generateContent.mockResolvedValue(reply());
    const { parseGated } = await load();
    const result = await parseGated({ pii, model: "gemini-3.1-pro-preview", system: "SYS", user: "USER", schema, effort: "high", maxTokens: 1234 });
    expect(result).toEqual({ ok: true, items: ["a"] });

    const call = generateContent.mock.calls[0][0];
    expect(call.model).toBe("gemini-3.1-pro-preview");
    expect(call.contents).toBe("USER");
    expect(call.config.systemInstruction).toBe("SYS");
    expect(call.config.responseMimeType).toBe("application/json");
    expect(call.config.maxOutputTokens).toBe(1234);
    expect(call.config.responseJsonSchema.type).toBe("object");
    expect(call.config.responseJsonSchema.required).toEqual(["ok", "items"]);
    expect(call.config.responseJsonSchema).not.toHaveProperty("$schema");
  });

  it("uses a thinking level for Gemini 3 and a budget for earlier models", async () => {
    generateContent.mockResolvedValue(reply());
    const { parseGated } = await load();
    await parseGated({ pii, model: "gemini-3.8-flash", system: "s", user: "u", schema, effort: "low" });
    await parseGated({ pii, model: "gemini-2.5-flash", system: "s", user: "u", schema, effort: "high" });
    expect(generateContent.mock.calls[0][0].config.thinkingConfig).toEqual({ thinkingLevel: "LOW" });
    expect(generateContent.mock.calls[1][0].config.thinkingConfig).toEqual({ thinkingBudget: -1 });
  });

  it("reports a truncated answer as hitting the output limit", async () => {
    generateContent.mockResolvedValue({ text: '{"ok":', candidates: [{ finishReason: "MAX_TOKENS" }] });
    const { parseGated } = await load();
    await expect(parseGated({ pii, model: "m", system: "s", user: "u", schema, effort: "low" })).rejects.toThrow("hit the output limit");
  });

  it.each(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION"])("reports %s as declined", async (reason) => {
    generateContent.mockResolvedValue({ text: "", candidates: [{ finishReason: reason }] });
    const { parseGated } = await load();
    await expect(parseGated({ pii, model: "m", system: "s", user: "u", schema, effort: "low" })).rejects.toThrow("declined");
  });

  it("reports a blocked prompt as declined", async () => {
    generateContent.mockResolvedValue({ promptFeedback: { blockReason: "SAFETY" }, candidates: [] });
    const { parseGated } = await load();
    await expect(parseGated({ pii, model: "m", system: "s", user: "u", schema, effort: "low" })).rejects.toThrow("declined");
  });

  it("rejects text that is not JSON, and JSON that does not match the schema", async () => {
    const { parseGated } = await load();
    generateContent.mockResolvedValueOnce(reply({ text: "not json" }));
    await expect(parseGated({ pii, model: "m", system: "s", user: "u", schema, effort: "low" })).rejects.toThrow("did not match the schema");
    generateContent.mockResolvedValueOnce(reply({ text: JSON.stringify({ ok: "yes" }) }));
    await expect(parseGated({ pii, model: "m", system: "s", user: "u", schema, effort: "low" })).rejects.toThrow("did not match the schema");
  });

  it("retries a busy service and then succeeds, but not a bad request", async () => {
    vi.useFakeTimers();
    const { parseGated } = await load();
    const { ApiError } = await import("@google/genai");
    generateContent.mockRejectedValueOnce(new ApiError({ message: "busy", status: 503 })).mockResolvedValueOnce(reply());
    const pending = parseGated({ pii, model: "m", system: "s", user: "u", schema, effort: "low" });
    await vi.advanceTimersByTimeAsync(2_500);
    await expect(pending).resolves.toEqual({ ok: true, items: ["a"] });
    expect(generateContent).toHaveBeenCalledTimes(2);

    generateContent.mockReset();
    generateContent.mockRejectedValue(new ApiError({ message: "bad", status: 400 }));
    await expect(parseGated({ pii, model: "m", system: "s", user: "u", schema, effort: "low" })).rejects.toThrow("bad");
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("says what is missing when no key is set", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const { parseGated } = await load();
    await expect(parseGated({ pii, model: "m", system: "s", user: "u", schema, effort: "low" })).rejects.toThrow("GEMINI_API_KEY");
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("still blocks personal details before any network call", async () => {
    const { parseGated } = await load();
    const withPii = detectPii("Priya Krishnan priya@example.com", "cv.pdf", "Priya Krishnan");
    await expect(parseGated({ pii: withPii, model: "m", system: "s", user: "contact priya@example.com", schema, effort: "low" })).rejects.toThrow();
    expect(generateContent).not.toHaveBeenCalled();
  });
});
