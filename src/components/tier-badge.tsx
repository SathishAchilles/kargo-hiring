import { CircleCheck, CircleDot, CirclePause, CircleX, type LucideIcon } from "lucide-react";
import type { Tier } from "@/lib/types";
import { cn } from "@/lib/utils";

// Dark text on a light tint (>= 4.5:1), plus an icon, so the tier never depends on colour alone.
const STYLE: Record<Tier, { icon: LucideIcon; className: string }> = {
  Shortlist: {
    icon: CircleCheck,
    className:
      "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  },
  Interview: {
    icon: CircleDot,
    className: "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200",
  },
  Hold: {
    icon: CirclePause,
    className:
      "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
  },
  Decline: {
    icon: CircleX,
    className: "border-border bg-muted text-muted-foreground",
  },
};

export function TierBadge({ tier }: { tier: Tier }) {
  const { icon: Icon, className } = STYLE[tier];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap",
        className,
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      {tier}
    </span>
  );
}
