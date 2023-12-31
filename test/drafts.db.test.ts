import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { candidatePii, drafts } from "@/db/schema";
import { updateCandidateSettings } from "@/lib/candidates/service";
import { clearDecision, getDecision, setDecision } from "@/lib/candidates/decisions";
import { alignDraftWithDecision, editDraft, ensureDraft, sendDraft } from "@/lib/drafts/service";
import { setParseForTests } from "@/lib/ai/client";
import { setSenderForTests, type Sender } from "@/lib/email/send";
import { cleanup, scoredCandidate } from "./helpers/db";

afterEach(() => {
  setSenderForTests(null);
  setParseForTests(null);
});
afterAll(cleanup);

async function insertDraft(candidateId: string) {
  const [row] = await db
    .insert(drafts)
    .values({
      candidateId,
      role: "pm",
      kind: "invite",
      subject: "Kargo — PM conversation",
      body: "Hi Priya,\n\nLet's talk.",
      brief: { summary: "s", strengths: [], probes: [], verification: [] },
    })
    .returning();
  return row;
}

describe("sendDraft", () => {
  it("sends exactly once when clicked twice at the same time", async () => {
    process.env.EMAIL_MODE = "redirect";
    process.env.EMAIL_TEST_TO = "founder-test@example.com";
    process.env.RESEND_FROM = "Kargo <onboarding@resend.dev>";
    const send = vi.fn<Sender>(async () => ({ id: "msg_123" }));
    setSenderForTests(send);
    const id = await scoredCandidate("2025-02-01");
    await setDecision(id, "pm", "shortlisted");
    const draft = await insertDraft(id);

    const results = await Promise.all([sendDraft(draft.id), sendDraft(draft.id)]);
    expect(results.map((r) => r.status).sort()).toEqual(["sent", "skipped"]);
    expect(send).toHaveBeenCalledTimes(1);
    const call = send.mock.calls[0][0];
    expect(call.to).toBe("founder-test@example.com");
    expect(call.subject).toMatch(/^\[to: squad_1@pg27\.mesaschool\.co\] /);
    expect(call.idempotencyKey).toBe(`kargo-draft-${draft.id}`);

    const [after] = await db.select().from(drafts).where(eq(drafts.id, draft.id));
    expect(after.status).toBe("sent");
    expect(after.resendMessageId).toBe("msg_123");
    await expect(editDraft(draft.id, { subject: "x", body: "y" })).rejects.toThrow(/no longer be edited/);
  });

  it("does not send without an email address", async () => {
    const send = vi.fn<Sender>(async () => ({ id: "msg" }));
    setSenderForTests(send);
    const id = await scoredCandidate("2025-02-01");
    await db.update(candidatePii).set({ emails: [] }).where(eq(candidatePii.candidateId, id));
    await setDecision(id, "pm", "shortlisted");
    const draft = await insertDraft(id);
    expect(await sendDraft(draft.id)).toEqual({ status: "failed", detail: "add an email address to send" });
    expect(send).not.toHaveBeenCalled();
  });
});

describe("edited drafts", () => {
  it("survive a rescore and are marked as out of date", async () => {
    const id = await scoredCandidate("2027-03-01");
    const draft = await insertDraft(id);
    await editDraft(draft.id, { subject: "Edited subject", body: "Edited body" });
    await updateCandidateSettings(id, { asOfDate: "2025-02-01" });
    const [after] = await db.select().from(drafts).where(and(eq(drafts.candidateId, id), eq(drafts.role, "pm")));
    expect(after.subject).toBe("Edited subject");
    expect(after.editedByFounder).toBe(true);
    expect(after.scoresChanged).toBe(true);
  });
});

describe("the human decision gates sending", () => {
  const sendSpy = () => {
    const send = vi.fn<Sender>(async () => ({ id: "msg_ok" }));
    setSenderForTests(send);
    return send;
  };

  it("refuses to send before the founder has decided", async () => {
    const send = sendSpy();
    const id = await scoredCandidate("2025-02-01");
    const draft = await insertDraft(id);
    const outcome = await sendDraft(draft.id);
    expect(outcome.status).toBe("failed");
    expect(outcome.detail).toMatch(/^Decide first/);
    expect(send).not.toHaveBeenCalled();
    const [row] = await db.select().from(drafts).where(eq(drafts.id, draft.id));
    expect(row.status).toBe("drafted");
  });

  it("refuses while on hold and when the draft contradicts the decision", async () => {
    const send = sendSpy();
    const id = await scoredCandidate("2025-02-01");
    const draft = await insertDraft(id); // an invite

    await setDecision(id, "pm", "on_hold");
    expect((await sendDraft(draft.id)).detail).toMatch(/on hold/);

    await setDecision(id, "pm", "declined");
    expect((await sendDraft(draft.id)).detail).toBe("Your decision is Declined. Switch the draft to a rejection to send it.");
    expect(send).not.toHaveBeenCalled();
  });

  it("sends once the decision matches the draft", async () => {
    process.env.EMAIL_MODE = "redirect";
    process.env.EMAIL_TEST_TO = "founder-test@example.com";
    process.env.RESEND_FROM = "Kargo <onboarding@resend.dev>";
    const send = sendSpy();
    const id = await scoredCandidate("2025-02-01");
    const draft = await insertDraft(id);
    await setDecision(id, "pm", "shortlisted");
    expect(await sendDraft(draft.id)).toEqual({ status: "sent" });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("keeps the latest decision, and clearing returns to not decided", async () => {
    const id = await scoredCandidate("2025-02-01");
    await setDecision(id, "pm", "shortlisted", "  strong referral  ");
    await setDecision(id, "pm", "on_hold");
    expect(await getDecision(id, "pm")).toMatchObject({ decision: "on_hold", note: null });
    await setDecision(id, "pm", "shortlisted", "  strong referral  ");
    expect((await getDecision(id, "pm"))?.note).toBe("strong referral");
    await clearDecision(id, "pm");
    expect(await getDecision(id, "pm")).toBeNull();
    expect(await getDecision(id, "spm")).toBeNull();
  });

  it("drafts the kind the decision calls for, over the AI's recommendation", async () => {
    const network = vi.fn(async () => ({
      stop_reason: "end_turn",
      parsed_output: {
        summary: "s",
        probes: [{ criterion: "P1", question: "q" }],
        subject: "Kargo",
        body: "Hi {{first_name}},\n\nYour exception alerts stood out.",
        referencedFactIds: ["F2"],
      },
    }));
    setParseForTests(network as never);
    const id = await scoredCandidate("2025-02-01");
    await setDecision(id, "pm", "declined");
    const draft = await ensureDraft(id, "pm");
    expect(draft.kind).toBe("rejection");
  });

  it("redrafts an untouched wrong-kind draft after the decision, but never an edited one", async () => {
    setParseForTests((async () => ({
      stop_reason: "end_turn",
      parsed_output: {
        summary: "s",
        probes: [{ criterion: "P1", question: "q" }],
        subject: "Kargo",
        body: "Hi {{first_name}},\n\nYour exception alerts stood out.",
        referencedFactIds: ["F2"],
      },
    })) as never);
    const untouched = await scoredCandidate("2025-02-01");
    const first = await insertDraft(untouched); // an invite
    await setDecision(untouched, "pm", "declined");
    expect(await alignDraftWithDecision(untouched, "pm")).toBe(true);
    const [now] = await db.select().from(drafts).where(eq(drafts.candidateId, untouched));
    expect(now.kind).toBe("rejection");
    expect(now.id).not.toBe(first.id);

    const edited = await scoredCandidate("2025-03-01");
    const mine = await insertDraft(edited);
    await editDraft(mine.id, { subject: "Mine", body: "My own words" });
    await setDecision(edited, "pm", "declined");
    expect(await alignDraftWithDecision(edited, "pm")).toBe(false);
    const [kept] = await db.select().from(drafts).where(eq(drafts.candidateId, edited));
    expect(kept.body).toBe("My own words");
  });
});
