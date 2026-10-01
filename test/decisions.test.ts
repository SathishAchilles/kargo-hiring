import { describe, expect, it } from "vitest";
import { decisionStatus, differsFromRecommendation, formatDay, kindFor, parseDecision, sendBlock } from "@/lib/decisions";

describe("parseDecision", () => {
  it("accepts the three decisions and nothing else", () => {
    expect(parseDecision("shortlisted")).toBe("shortlisted");
    expect(parseDecision("on_hold")).toBe("on_hold");
    expect(parseDecision("declined")).toBe("declined");
    expect(parseDecision("approved")).toBeNull();
    expect(parseDecision(undefined)).toBeNull();
    expect(parseDecision("")).toBeNull();
  });
});

describe("kindFor", () => {
  it("invites a shortlist, rejects a decline, and sends nothing on hold or undecided", () => {
    expect(kindFor("shortlisted")).toBe("invite");
    expect(kindFor("declined")).toBe("rejection");
    expect(kindFor("on_hold")).toBeNull();
    expect(kindFor(null)).toBeNull();
  });
});

describe("sendBlock", () => {
  it("blocks every email until the founder has decided", () => {
    expect(sendBlock(null, "invite")).toMatch(/^Decide first/);
    expect(sendBlock(null, "rejection")).toMatch(/^Decide first/);
  });

  it("blocks any email while on hold", () => {
    expect(sendBlock("on_hold", "invite")).toMatch(/on hold/);
    expect(sendBlock("on_hold", "rejection")).toMatch(/on hold/);
  });

  it("allows an invite for a shortlist and a rejection for a decline", () => {
    expect(sendBlock("shortlisted", "invite")).toBeNull();
    expect(sendBlock("declined", "rejection")).toBeNull();
  });

  it("blocks a draft that contradicts the decision and says how to fix it", () => {
    expect(sendBlock("shortlisted", "rejection")).toBe("Your decision is Shortlisted. Switch the draft to an invite to send it.");
    expect(sendBlock("declined", "invite")).toBe("Your decision is Declined. Switch the draft to a rejection to send it.");
  });
});

describe("differsFromRecommendation", () => {
  it("is false until a decision exists", () => {
    expect(differsFromRecommendation(null, "Weak")).toBe(false);
  });
  it("flags a shortlist of a weak or partial match, and a decline of a strong or good one", () => {
    expect(differsFromRecommendation("shortlisted", "Weak")).toBe(true);
    expect(differsFromRecommendation("shortlisted", "Partial")).toBe(true);
    expect(differsFromRecommendation("declined", "Strong")).toBe(true);
    expect(differsFromRecommendation("declined", "Good")).toBe(true);
  });
  it("agrees when the decision follows the recommendation, and never flags on hold", () => {
    expect(differsFromRecommendation("shortlisted", "Strong")).toBe(false);
    expect(differsFromRecommendation("declined", "Weak")).toBe(false);
    expect(differsFromRecommendation("on_hold", "Strong")).toBe(false);
  });
});

describe("decisionStatus", () => {
  const when = "2026-10-02T01:30:00.000Z";
  it("says nothing is sent while not decided", () => {
    expect(decisionStatus(null)).toBe("Not decided. No email will be sent until you decide and click Send.");
  });
  it("names the decision, the date and what happens next", () => {
    expect(decisionStatus("shortlisted", when)).toBe(
      "You shortlisted this candidate on 2 Oct 2026. An interview invite is ready to review and send.",
    );
    expect(decisionStatus("declined", when)).toBe(
      "You declined this candidate on 2 Oct 2026. A respectful rejection is ready to review and send.",
    );
    expect(decisionStatus("on_hold", when)).toBe(
      "You put this candidate on hold on 2 Oct 2026. No email is sent while they are on hold.",
    );
  });
  it("formats days in UTC", () => {
    expect(formatDay("2026-12-31T23:59:00.000Z")).toBe("31 Dec 2026");
  });
});
