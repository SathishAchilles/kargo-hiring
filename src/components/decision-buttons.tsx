"use client";

import { CircleCheck, CircleMinus, CirclePause, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { decide, undecide } from "@/app/actions/decisions";
import { DECISION_LABEL, type Decision, type RoleKey } from "@/lib/types";
import { cn } from "@/lib/utils";

type Choice = { value: Decision; verb: string; hint: string; icon: LucideIcon; idle: string; chosen: string };

// Each action has its own colour before it is chosen, so it reads as an action. Label, icon and
// the pressed state carry the meaning too; colour is never the only signal.
const CHOICES: Choice[] = [
  {
    value: "shortlisted",
    verb: "Shortlist",
    hint: "Creates an interview invite. Nothing is sent until you click Send.",
    icon: CircleCheck,
    idle: "border-emerald-600/60 text-emerald-800 hover:bg-emerald-50 dark:border-emerald-500/60 dark:text-emerald-300 dark:hover:bg-emerald-950",
    chosen: "border-emerald-600 bg-emerald-600 text-white",
  },
  {
    value: "on_hold",
    verb: "On hold",
    hint: "No email. Decide later.",
    icon: CirclePause,
    idle: "border-amber-500/70 text-amber-900 hover:bg-amber-50 dark:border-amber-500/60 dark:text-amber-200 dark:hover:bg-amber-950",
    chosen: "border-amber-500 bg-amber-400 text-amber-950",
  },
  {
    value: "declined",
    verb: "Decline",
    hint: "Creates a respectful rejection. Nothing is sent until you click Send.",
    icon: CircleMinus,
    idle: "border-rose-500/60 text-rose-800 hover:bg-rose-50 dark:border-rose-500/60 dark:text-rose-300 dark:hover:bg-rose-950",
    chosen: "border-rose-600 bg-rose-600 text-white",
  },
];

export type DecisionButtonsProps = {
  candidateId: string;
  role: RoleKey;
  current: Decision | null;
  // panel: large, with consequences. row: icon buttons for a table cell. card: labelled, for a phone card.
  variant: "panel" | "row" | "card";
  // The stored note. Panel passes what is typed (saved with the decision); row and card leave the
  // note alone and use the stored one only to restore it on Undo.
  note?: string | null;
};

export function DecisionButtons({ candidateId, role, current, variant, note }: DecisionButtonsProps) {
  const router = useRouter();
  const [optimistic, setOptimistic] = useOptimistic(current);
  const [pending, start] = useTransition();
  const fromList = variant !== "panel";

  const choose = (value: Decision) => {
    const previous = { decision: current, note: note ?? null };
    // From the list, the active action toggles off. In the panel it stays chosen.
    const next: Decision | null = fromList && optimistic === value ? null : value;
    start(async () => {
      setOptimistic(next);
      try {
        if (next) await decide(candidateId, role, next, fromList ? undefined : (note ?? ""));
        else await undecide(candidateId, role);
        const message = next ? `${DECISION_LABEL[next]}.` : "Decision cleared.";
        if (fromList) {
          toast(message, {
            duration: 6000,
            action: {
              label: "Undo",
              onClick: async () => {
                try {
                  if (previous.decision) await decide(candidateId, role, previous.decision, previous.note ?? "");
                  else await undecide(candidateId, role);
                  router.refresh();
                } catch {
                  toast.error("Could not undo. Try again.");
                }
              },
            },
          });
        } else {
          toast.success(message);
        }
        router.refresh();
      } catch (error) {
        // The optimistic state falls back to `current` when this transition ends.
        toast.error(error instanceof Error ? error.message : "Could not save the decision.");
      }
    });
  };

  return (
    <div
      role="group"
      aria-label="Decision"
      className={cn(variant === "panel" && "mt-3 grid gap-2", variant === "row" && "flex gap-1", variant === "card" && "grid grid-cols-3 gap-2")}
    >
      {CHOICES.map(({ value, verb, hint, icon: Icon, idle, chosen }) => {
        const active = optimistic === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            aria-label={variant === "row" ? verb : undefined}
            title={variant === "row" ? `${verb}${active ? " (click again to clear)" : ""}` : undefined}
            disabled={pending}
            onClick={() => choose(value)}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
              variant === "panel" && "min-h-14 px-3 py-2 text-left",
              variant === "row" && "size-8 justify-center",
              variant === "card" && "min-h-10 justify-center px-2 text-xs font-medium",
              active ? chosen : idle,
            )}
          >
            <Icon className={cn("shrink-0", variant === "panel" ? "size-5" : "size-4")} aria-hidden />
            {variant === "panel" ? (
              <span className="min-w-0">
                <span className="block font-medium">{verb}</span>
                <span className={cn("block text-xs", active ? "opacity-90" : "text-muted-foreground")}>{hint}</span>
              </span>
            ) : variant === "card" ? (
              verb
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
