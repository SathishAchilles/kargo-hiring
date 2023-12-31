import { CircleCheck, CircleDashed, CircleMinus, CirclePause, type LucideIcon } from "lucide-react";
import { DECISION_LABEL, type Decision } from "@/lib/types";
import { cn } from "@/lib/utils";

// The founder's decision. Solid, circular check/pause/cross icons keep it visibly different from
// the AI's signal-strength recommendation badge. Dark text on a light tint, icon plus text.
const STYLE: Record<Decision, { icon: LucideIcon; className: string }> = {
  shortlisted: {
    icon: CircleCheck,
    className:
      "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-600 dark:text-white",
  },
  on_hold: {
    icon: CirclePause,
    className: "border-amber-500 bg-amber-100 text-amber-950 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-100",
  },
  declined: {
    icon: CircleMinus,
    className: "border-rose-500 bg-rose-100 text-rose-950 dark:border-rose-600 dark:bg-rose-950 dark:text-rose-100",
  },
};

export function DecisionBadge({ decision }: { decision: Decision | null }) {
  if (!decision) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] leading-4 whitespace-nowrap text-muted-foreground">
        <CircleDashed className="size-3 shrink-0" aria-hidden />
        Not decided
      </span>
    );
  }
  const { icon: Icon, className } = STYLE[decision];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap",
        className,
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      {DECISION_LABEL[decision]}
    </span>
  );
}
