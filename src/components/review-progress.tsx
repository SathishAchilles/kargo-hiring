import Link from "next/link";
import { DECISION_LABEL, DECISIONS } from "@/lib/types";
import type { ReviewProgress as Progress } from "@/lib/dashboard/queries";
import { cn } from "@/lib/utils";

// Segment colours; the legend beside the bar carries the names and counts, so colour is never
// the only signal.
const FILL = {
  shortlisted: "bg-emerald-600",
  on_hold: "bg-amber-400",
  declined: "bg-rose-500",
  undecided: "bg-muted-foreground/25",
} as const;

export function ReviewProgress({
  progress,
  active,
  hrefFor,
  className,
}: {
  progress: Progress;
  active?: keyof Progress;
  hrefFor: (decision: keyof Progress | undefined) => string;
  className?: string;
}) {
  const total = Math.max(1, progress.undecided + progress.shortlisted + progress.on_hold + progress.declined);
  const decided = total - progress.undecided;
  const order = ["undecided", ...DECISIONS] as (keyof Progress)[];
  const label = (key: keyof Progress) => (key === "undecided" ? "Not decided" : DECISION_LABEL[key]);

  return (
    <section aria-label="Your review" className={cn("anim-fade-up rounded-xl border bg-card p-4 shadow-xs", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Your review</p>
        <p className="text-sm text-muted-foreground tabular-nums">
          {decided} of {total} decided
        </p>
      </div>
      <div aria-hidden className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted">
        {[...DECISIONS, "undecided" as const].map((key) => (
          <span key={key} className={cn("anim-bar h-full", FILL[key])} style={{ width: `${(progress[key] / total) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-1.5 text-sm">
        {order.map((key) => (
          <li key={key}>
            <Link
              href={hrefFor(active === key ? undefined : key)}
              aria-current={active === key ? "true" : undefined}
              className={cn("inline-flex min-h-9 items-center gap-2 rounded-md border px-2.5", active === key && "bg-muted font-medium")}
            >
              <span aria-hidden className={cn("size-2 rounded-full", FILL[key])} />
              {label(key)}
              <span className="tabular-nums text-muted-foreground">{progress[key]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
