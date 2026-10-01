import { describe, expect, it, vi } from "vitest";
import { runPipeline, type PipelineState, type PipelineStore, type Steps } from "@/lib/pipeline/runner";

function memoryStore(initial: PipelineState) {
  const state = { ...initial, reason: null as string | null };
  const history: string[] = [];
  const store: PipelineStore = {
    get: async () => ({ status: state.status, failedStep: state.failedStep }),
    set: async (_id, status, detail) => {
      state.status = status;
      if (detail?.failedStep !== undefined) state.failedStep = detail.failedStep;
      if (detail?.reason !== undefined) state.reason = detail.reason;
      history.push(status);
    },
  };
  return { store, state, history };
}

function steps(overrides: Partial<Steps> = {}): Steps {
  return {
    extracting: vi.fn(async () => "ok" as const),
    preparing: vi.fn(async () => "ok" as const),
    evidence: vi.fn(async () => "ok" as const),
    scoring: vi.fn(async () => "ok" as const),
    ...overrides,
  };
}

describe("runPipeline", () => {
  it("fails at the AI step, then a retry resumes there and ends ready", async () => {
    const { store, state, history } = memoryStore({ status: "uploaded", failedStep: null });
    let calls = 0;
    const evidence = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error("timed out");
      return "ok" as const;
    });
    const s = steps({ evidence });

    expect(await runPipeline("c1", store, s)).toBe("failed");
    expect(state.reason).toBe("evidence extraction timed out");
    expect(state.failedStep).toBe("evidence");

    expect(await runPipeline("c1", store, s)).toBe("ready");
    expect(s.extracting).toHaveBeenCalledTimes(1);
    expect(s.preparing).toHaveBeenCalledTimes(1);
    expect(evidence).toHaveBeenCalledTimes(2);
    expect(history).toEqual([
      "extracting",
      "preparing",
      "evidence",
      "failed",
      "evidence",
      "scoring",
      "ready",
    ]);
  });

  it("stops at needs_ocr without scoring", async () => {
    const { store } = memoryStore({ status: "uploaded", failedStep: null });
    const s = steps({ extracting: vi.fn(async () => "needs_ocr" as const) });
    expect(await runPipeline("c2", store, s)).toBe("needs_ocr");
    expect(s.scoring).not.toHaveBeenCalled();
  });

  it("does nothing for a ready candidate", async () => {
    const { store } = memoryStore({ status: "ready", failedStep: null });
    const s = steps();
    expect(await runPipeline("c3", store, s)).toBe("ready");
    expect(s.extracting).not.toHaveBeenCalled();
  });
});

describe("failure reasons", () => {
  it("are short and free of control characters", async () => {
    const { describe: reasonOf } = await import("@/lib/pipeline/runner");
    const huge = new Error(`Failed query: insert ... params: ${"x\u0000".repeat(500)}`);
    const reason = reasonOf(huge);
    expect(reason.length).toBeLessThanOrEqual(200);
    expect(reason.includes("\u0000")).toBe(false);
  });

  it("prefer the underlying cause", async () => {
    const { describe: reasonOf } = await import("@/lib/pipeline/runner");
    expect(reasonOf(new Error("Failed query: ...", { cause: new Error("invalid byte sequence") }))).toBe("invalid byte sequence");
  });
});
