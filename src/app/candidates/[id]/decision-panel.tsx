"use client";

import { CircleCheck, CircleMinus, CirclePause, Info, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { decide, undecide } from "@/app/actions/decisions";
import { DecisionBadge } from "@/components/decision-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { differsFromRecommendation } from "@/lib/decisions";
import { DECISION_LABEL, ROLE_LABEL, TIER_LABEL, type Decision, type RoleKey, type Tier } from "@/lib/types";
import { cn } from "@/lib/utils";

const CHOICES: { value: Decision; verb: string; hint: string; icon: LucideIcon; active: string }[] = [
  { value: "shortlisted", verb: "Shortlist", hint: "Send an interview invite", icon: CircleCheck, active: "border-emerald-600 bg-emerald-600 text-white" },
  { value: "on_hold", verb: "Put on hold", hint: "Decide later, no email", icon: CirclePause, active: "border-amber-500 bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100" },
  { value: "declined", verb: "Decline", hint: "Send a respectful rejection", icon: CircleMinus, active: "border-rose-500 bg-rose-100 text-rose-950 dark:bg-rose-950 dark:text-rose-100" },
];

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
      <p className="mt-2 text-sm text-muted-foreground">
        The AI recommends; you decide. Nothing is shortlisted or emailed until you choose.
      </p>

      <div role="group" aria-label="Decision" className="mt-3 grid gap-2">
        {CHOICES.map(({ value, verb, hint, icon: Icon, active }) => {
          const chosen = current?.decision === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={chosen}
              disabled={pending}
              onClick={() => run(`${DECISION_LABEL[value]}.`, () => decide(candidateId, role, value, note))}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
                chosen ? cn(active, "font-medium") : "hover:bg-muted",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0">
                <span className="block">{verb}</span>
                <span className={cn("block text-xs", chosen ? "opacity-80" : "text-muted-foreground")}>{hint}</span>
              </span>
            </button>
          );
        })}
      </div>

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
