import { Trophy, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { Cohort } from "@/lib/dashboard/cohort";
import { ROLE_LABEL, type FlagType, type RoleKey, type Tier } from "@/lib/types";
import { cn } from "@/lib/utils";

const TIERS: Tier[] = ["Shortlist", "Interview", "Hold", "Decline"];

// Segment colours for the stacked bar. The legend beside it carries the names and counts,
// so the bar never relies on colour alone.
const TIER_FILL: Record<Tier, string> = {
  Shortlist: "bg-emerald-500",
  Interview: "bg-sky-500",
  Hold: "bg-amber-400",
  Decline: "bg-slate-300 dark:bg-slate-600",
};

export const FLAG_LABEL: Record<FlagType, string> = {
  duplicate: "Duplicate CV",
  placeholder: "Placeholder text",
  identity_mismatch: "Profile link name",
  education_overlap: "Job during full-time degree",
  stated_vs_dated: "Stated vs dated years",
};

const Card = ({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) => (
  <div className={cn("anim-fade-up rounded-xl border bg-card p-4 shadow-xs", className)}>
    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</p>
    {children}
  </div>
);

export function CohortPanel({
  cohort,
  criteria,
  role,
  hrefFor,
  className,
}: {
  cohort: Cohort;
  criteria: { id: string; name: string }[];
  role: RoleKey;
  hrefFor: (filters: Record<string, string | undefined>) => string;
  className?: string;
}) {
  const total = Math.max(1, cohort.count);
  const tallest = Math.max(1, ...cohort.histogram.map((bucket) => bucket.count));
  const flagEntries = Object.entries(cohort.flags) as [FlagType, number][];
  const scarcestName = criteria.find((c) => c.id === cohort.scarcest?.criterion)?.name.toLowerCase();

  return (
    <section aria-label="Cohort insights" className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-4", className)}>
      <Card title="Tiers">
        <div aria-hidden className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted">
          {TIERS.map((tier) => (
            <span
              key={tier}
              className={cn("anim-bar h-full", TIER_FILL[tier])}
              style={{ width: `${(cohort.tiers[tier] / total) * 100}%` }}
            />
          ))}
        </div>
        <ul className="mt-3 space-y-1 text-sm">
          {TIERS.map((value) => (
            <li key={value} className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span aria-hidden className={cn("size-2 rounded-full", TIER_FILL[value])} />
                <Link className="hover:underline" href={hrefFor({ tier: value })}>
                  {value}
                </Link>
              </span>
              <span className="tabular-nums">{cohort.tiers[value]}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Averages">
        <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{cohort.averageAll}</p>
        <p className="text-sm text-muted-foreground">all {cohort.count} candidates</p>
        <div
          role="img"
          aria-label={`Score distribution: ${cohort.histogram.map((b) => `${b.from} to ${b.to}: ${b.count}`).join(", ")}`}
          className="mt-3"
        >
          <div aria-hidden className="flex h-10 items-end gap-1">
            {cohort.histogram.map((bucket, index) => (
              <span
                key={bucket.from}
                title={`${bucket.from}–${bucket.to}: ${bucket.count}`}
                className="anim-fade-up flex-1 rounded-t-[3px] bg-primary/70"
                style={{
                  height: `${Math.max(bucket.count === 0 ? 0 : 8, (bucket.count / tallest) * 100)}%`,
                  animationDelay: `${index * 40}ms`,
                }}
              />
            ))}
          </div>
          <div aria-hidden className="mt-1 flex justify-between text-[10px] text-muted-foreground tabular-nums">
            <span>20</span>
            <span>60</span>
            <span>100</span>
          </div>
        </div>
        <Link className="mt-2 block text-sm hover:underline" href={hrefFor({ applied: role })}>
          {cohort.averageApplicants ?? "—"} for {ROLE_LABEL[role]} applicants
        </Link>
      </Card>

      <Card title="At the top">
        <div className="mt-2 flex items-start gap-3">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            <Trophy className="size-4" />
          </span>
          <div className="min-w-0">
            {cohort.tiedAtTop > 1 ? (
              <Link className="block text-sm hover:underline" href={hrefFor({ top: "1" })}>
                <span className="text-2xl font-semibold tracking-tight tabular-nums">{cohort.tiedAtTop}</span> tied at{" "}
                {cohort.topTotal} — ranked by tie-break
              </Link>
            ) : (
              <p className="text-sm">No tie at the top ({cohort.topTotal ?? "—"})</p>
            )}
          </div>
        </div>
        {cohort.scarcest && (
          <p className="mt-3 text-sm text-muted-foreground">
            Scarcest: <span className="font-medium text-foreground">{cohort.scarcest.criterion}</span> {scarcestName} —{" "}
            {cohort.scarcest.fives} at 5
          </p>
        )}
      </Card>

      <Card title="Check before shortlisting">
        <Link className="mt-2 block text-sm hover:underline" href={hrefFor({ suggest: "1" })}>
          {cohort.suggestOther} suggested for the other role
        </Link>
        <ul className="mt-2 space-y-1 text-sm">
          {flagEntries.map(([type, count]) => (
            <li key={type} className="flex items-center gap-2">
              <TriangleAlert aria-hidden className="size-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
              <Link className="hover:underline" href={hrefFor({ flag: type })}>
                {count} × {FLAG_LABEL[type]}
              </Link>
            </li>
          ))}
          {flagEntries.length === 0 && <li className="text-muted-foreground">No integrity flags</li>}
        </ul>
      </Card>
    </section>
  );
}
