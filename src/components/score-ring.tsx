import type { Tier } from "@/lib/types";
import { cn } from "@/lib/utils";

// A total (20–100) as a progress ring in the tier's colour. The number is real text inside
// the ring, so the ring is decoration and nothing depends on colour.
const TIER_COLOUR: Record<Tier, string> = {
  Shortlist: "oklch(0.7 0.17 160)",
  Interview: "oklch(0.68 0.14 235)",
  Hold: "oklch(0.78 0.15 80)",
  Decline: "oklch(0.7 0.02 264)",
};

export function ScoreRing({ total, tier, size = "md" }: { total: number; tier: Tier; size?: "md" | "sm" }) {
  const percent = Math.min(100, Math.max(0, ((total - 20) / 80) * 100));
  return (
    <div
      className={cn(
        "anim-pop relative grid shrink-0 place-items-center rounded-full",
        size === "md" ? "size-12" : "size-11",
      )}
      style={{ background: `conic-gradient(${TIER_COLOUR[tier]} ${percent}%, var(--muted) 0)` }}
    >
      <div
        data-testid="total"
        className={cn(
          "grid place-items-center rounded-full bg-card font-semibold tabular-nums",
          size === "md" ? "size-9 text-base" : "size-8 text-sm",
        )}
      >
        {total}
      </div>
    </div>
  );
}
