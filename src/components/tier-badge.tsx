import type { Tier } from "@/lib/types";
import { cn } from "@/lib/utils";

const STYLE: Record<Tier, string> = {
  Shortlist: "bg-emerald-600 text-white",
  Interview: "bg-sky-600 text-white",
  Hold: "bg-amber-500 text-white",
  Decline: "bg-muted text-muted-foreground",
};

export function TierBadge({ tier }: { tier: Tier }) {
  return (
    <span className={cn("inline-block rounded px-1.5 py-0.5 text-[11px] font-medium", STYLE[tier])}>{tier}</span>
  );
}
