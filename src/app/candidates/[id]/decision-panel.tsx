"use client";

import { Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { decide, undecide } from "@/app/actions/decisions";
import { DecisionBadge } from "@/components/decision-badge";
import { DecisionButtons } from "@/components/decision-buttons";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { decisionStatus, differsFromRecommendation } from "@/lib/decisions";
import { ROLE_LABEL, TIER_LABEL, type Decision, type RoleKey, type Tier } from "@/lib/types";

// UTC and fixed format, so the server and the browser render the same text.
const stamp = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

export function DecisionPanel(props: {
  candidateId: string;
  role: RoleKey;
  tier: Tier;
  current: { decision: Decision; note: string | null; decidedAt: string } | null;
}) {
  const { candidateId, role, tier, current } = props;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState(current?.note ?? "");

  const run = (label: string, action: () => Promise<unknown>) =>
    start(async () => {
      try {
        await action();
        toast.success(label);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Something went wrong.");
      }
    });

  const differs = differsFromRecommendation(current?.decision ?? null, tier);
  const noteChanged = current !== null && note.trim() !== (current.note ?? "");

  return (
    <section aria-label="Your decision" className="anim-fade-up rounded-xl border-2 bg-card p-4 shadow-xs">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Your decision · {ROLE_LABEL[role]}</p>
        <DecisionBadge decision={current?.decision ?? null} />
      </div>
      <p role="status" className="mt-3 text-base font-medium">
        {decisionStatus(current?.decision ?? null, current?.decidedAt)}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">The AI recommends; you decide. Choose one:</p>

      <DecisionButtons candidateId={candidateId} role={role} current={current?.decision ?? null} variant="panel" note={note} />

      <div className="mt-3 space-y-1.5">
        <Label htmlFor="decision-note">Note (optional, only you see it)</Label>
        <Textarea
          id="decision-note"
          rows={2}
          maxLength={500}
          value={note}
          disabled={pending}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>

      {current && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="outline" disabled={pending || !noteChanged} onClick={() => run("Note saved.", () => decide(candidateId, role, current.decision, note))}>
            Save note
          </Button>
          <Button variant="ghost" disabled={pending} onClick={() => run("Decision cleared.", () => undecide(candidateId, role))}>
            Clear decision
          </Button>
          <span className="text-xs text-muted-foreground">Decided {stamp(current.decidedAt)}</span>
        </div>
      )}

      {differs && current && (
        <p className="mt-3 flex items-start gap-2 rounded-md border border-sky-300 bg-sky-100 p-2 text-xs text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Differs from the AI recommendation ({TIER_LABEL[tier]}). Your decision stands.
        </p>
      )}
    </section>
  );
}
