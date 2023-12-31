import { afterEach, describe, expect, it, vi } from "vitest";
import { setParseForTests } from "@/lib/ai/client";
import { defaultKind, KILL_QUESTION, ruleBrief, verificationQuestion } from "@/lib/drafts/brief";
import { draftProblems, generateDraft, NAME_TOKEN } from "@/lib/drafts/generate";
import { emailMode, route } from "@/lib/email/send";
import { detectPii } from "@/lib/pii/detect";
import type { SubScore } from "@/lib/types";
import { evidence, role } from "./helpers/evidence";

afterEach(() => setParseForTests(null));

const pii = detectPii("", "pm_01_priya_krishnan.pdf");
const subScores: SubScore[] = [
  { criterion: "S1", score: 2, anchor: "Contributed to integrations", quotes: ["worked on EDI"] },
  { criterion: "S2", score: 4, anchor: "No PM above", quotes: ["sole PM"] },
  { criterion: "S3", score: 1, anchor: "No operations exposure", quotes: [] },
  { criterion: "S4", score: 5, anchor: "Managed PMs and built practice", quotes: ["leads 2 PMs"] },
  { criterion: "S5", score: 3, anchor: "3.0–3.9", quotes: ["3.5 product years"] },
];
const e = evidence({
  roles: [role({ title: "Product Manager", company: "Portzen" })],
  shipped: [{ what: "exception alerts", outcome: "-34% exceptions", iterated: true, roleIndex: 0, quote: "alerts" }],
});

function aiReturns(body: string, extra: Record<string, unknown> = {}) {
  const network = vi.fn(async () => ({
    stop_reason: "end_turn",
    parsed_output: {
      summary: "Strong fit.",
      probes: [
        { criterion: "S3", question: "When did you last spend a day inside an ops team?" },
        { criterion: "S1", question: "Which integration did you own end to end?" },
      ],
      subject: "Your application to Kargo",
      body,
      referencedFactIds: ["F2"],
      ...extra,
    },
  }));
  setParseForTests(network as never);
  return network;
}

describe("defaultKind", () => {
  it("recommends an invite for Strong and Good, a rejection for Partial and Weak", () => {
    expect(defaultKind("Strong")).toBe("invite");
    expect(defaultKind("Good")).toBe("invite");
    expect(defaultKind("Partial")).toBe("rejection");
    expect(defaultKind("Weak")).toBe("rejection");
  });
});

describe("rule brief", () => {
  it("probes the two weakest criteria and adds the kill question when nothing was killed", () => {
    const brief = ruleBrief("spm", subScores, [], e);
    expect(brief.weak.map((item) => item.id)).toEqual(["S3", "S1"]);
    expect(brief.verification).toContain(KILL_QUESTION);
  });

  it("asks a neutral dates question for an education overlap flag", () => {
    const question = verificationQuestion({
      type: "education_overlap",
      detail: { role: "Documentation Executive (2014-08 – 2017-04)", degree: "MBA (2015–2017)" },
    });
    expect(question).toContain("Walk me through the dates");
  });
});

describe("generateDraft", () => {
  it("sends no name to AI and fills it afterwards", async () => {
    const network = aiReturns(`Hi ${NAME_TOKEN},\n\nYour exception alerts work stood out.`);
    const draft = await generateDraft({ role: "pm", kind: "invite", pii, evidence: e, subScores, flags: [] }, "Arjun Mehta, Founder, Kargo");
    const request = JSON.stringify(network.mock.calls[0]);
    expect(request.toLowerCase()).not.toContain("priya");
    expect(request.toLowerCase()).not.toContain("arjun mehta");
    expect(draft.body.startsWith("Hi Priya,")).toBe(true);
    expect(draft.body.endsWith("Arjun Mehta, Founder, Kargo")).toBe(true);
    expect(draft.brief.probes.map((probe) => probe.criterion.split(" ")[0])).toEqual(["S3", "S1"]);
  });

  it("regenerates a rejection that mentions a score, then marks it for manual edit", async () => {
    const network = aiReturns(`Hi ${NAME_TOKEN},\n\nYou scored 82/100, which is not enough.`);
    const draft = await generateDraft({ role: "pm", kind: "rejection", pii, evidence: e, subScores, flags: [] });
    expect(network).toHaveBeenCalledTimes(2);
    expect(draft.needsManualEdit).toBe(true);
  });

  it("accepts a clean rejection first time", async () => {
    const network = aiReturns(`Hi ${NAME_TOKEN},\n\nThank you for sharing your exception alerts work. We are moving ahead with candidates whose experience is closer to what this role needs right now.`);
    const draft = await generateDraft({ role: "pm", kind: "rejection", pii, evidence: e, subScores, flags: [] });
    expect(network).toHaveBeenCalledTimes(1);
    expect(draft.needsManualEdit).toBe(false);
  });
});

describe("draftProblems", () => {
  const ids = new Set(["F1", "F2"]);
  it("requires a reference to the candidate's own facts", () => {
    expect(draftProblems("invite", { subject: "s", body: `Hi ${NAME_TOKEN},`, referencedFactIds: ["F9"] }, ids)).toContain(
      "does not reference the candidate's own facts",
    );
  });
  it("rejects flag text in a rejection", () => {
    const problems = draftProblems(
      "rejection",
      { subject: "s", body: `Hi ${NAME_TOKEN}, about INR XXL/year in manual data-entry`, referencedFactIds: ["F1"] },
      ids,
      [{ type: "placeholder", detail: { quote: "INR XXL/year in manual data-entry costs" } }],
    );
    expect(problems).toContain("repeats flagged text");
  });
});

describe("email routing", () => {
  it("redirects to the test inbox with the real recipient in the subject", () => {
    expect(route({ to: "squad_1@pg27.mesaschool.co", subject: "Interview" }, "redirect", "me@example.com")).toEqual({
      to: "me@example.com",
      subject: "[to: squad_1@pg27.mesaschool.co] Interview",
    });
  });
  it("refuses an unknown EMAIL_MODE", () => {
    expect(() => emailMode("production")).toThrow(/EMAIL_MODE/);
  });
});
