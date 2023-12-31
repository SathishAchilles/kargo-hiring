import type { CandidateStatus } from "@/lib/types";

export const STEPS = ["extracting", "preparing", "evidence", "scoring"] as const;
export type Step = (typeof STEPS)[number];

export const STEP_LABEL: Record<Step, string> = {
  extracting: "text extraction",
  preparing: "personal-data preparation",
  evidence: "evidence extraction",
  scoring: "scoring",
};

export type StepOutcome = "ok" | "needs_ocr";

export type PipelineState = { status: CandidateStatus; failedStep: Step | null };

export interface PipelineStore {
  get(candidateId: string): Promise<PipelineState>;
  set(
    candidateId: string,
    status: CandidateStatus,
    detail?: { failedStep?: Step | null; reason?: string | null },
  ): Promise<void>;
}

export type Steps = Record<Step, (candidateId: string) => Promise<StepOutcome>>;

function startIndex(state: PipelineState): number | null {
  switch (state.status) {
    case "uploaded":
      return 0;
    case "failed":
      return state.failedStep ? STEPS.indexOf(state.failedStep) : 0;
    case "extracting":
    case "preparing":
    case "evidence":
    case "scoring":
      // Interrupted mid-run (e.g. server restart): resume at that step.
      return STEPS.indexOf(state.status);
    default:
      return null;
  }
}

// Short and printable: a reason must never itself break the status update
// (database errors can embed the whole failing query and its parameters).
export function describe(error: unknown): string {
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : null;
  const message = cause ?? (error instanceof Error ? error.message : String(error));
  const clean = message.replace(/[\u0000-\u001F\u007F]+/g, " ").trim();
  return clean.length > 200 ? `${clean.slice(0, 197)}…` : clean;
}

// Runs the remaining steps for one candidate. Each step stores its own result,
// so a retry resumes at the failed step without redoing earlier work.
export async function runPipeline(candidateId: string, store: PipelineStore, steps: Steps) {
  const state = await store.get(candidateId);
  const from = startIndex(state);
  if (from === null) return state.status;

  for (const step of STEPS.slice(from)) {
    await store.set(candidateId, step, { failedStep: null, reason: null });
    let outcome: StepOutcome;
    try {
      outcome = await steps[step](candidateId);
    } catch (error) {
      await store.set(candidateId, "failed", {
        failedStep: step,
        reason: `${STEP_LABEL[step]} ${describe(error)}`,
      });
      return "failed" as const;
    }
    if (outcome === "needs_ocr") {
      await store.set(candidateId, "needs_ocr", { reason: "No text layer found; the CV needs OCR." });
      return "needs_ocr" as const;
    }
  }
  await store.set(candidateId, "ready", { failedStep: null, reason: null });
  return "ready" as const;
}
