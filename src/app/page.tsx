import Link from "next/link";
import { signOut } from "@/app/signin/actions";
import { AppHeader } from "@/components/app-header";
import { AutoRefresh } from "@/components/auto-refresh";
import { CohortPanel, FLAG_LABEL } from "@/components/cohort-panel";
import { EmptyState } from "@/components/empty-state";
import { ReviewProgress } from "@/components/review-progress";
import { ProcessingList } from "@/components/processing-list";
import { RankedTable } from "@/components/ranked-table";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { UploadDialog } from "@/components/upload-dialog";
import { loadDashboard, type DecisionFilter, type Filters } from "@/lib/dashboard/queries";
import { parseSort, SORT_KEYS } from "@/lib/dashboard/sort";
import { parseRole } from "@/lib/intake/validate";
import { RUBRICS } from "@/lib/scoring/rubric";
import { DECISIONS, ROLE_LABEL, TIER_LABEL, TIERS, type FlagType, type RoleKey } from "@/lib/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function href(role: RoleKey, filters: Record<string, string | undefined>) {
  const params = new URLSearchParams({ role });
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  return `/?${params.toString()}`;
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<Search> }) {
  const search = await searchParams;
  const role: RoleKey = parseRole(one(search.role)) ?? "pm";
  const tier = TIERS.find((value) => value === one(search.tier));
  const decision = ([...DECISIONS, "undecided"] as DecisionFilter[]).find((value) => value === one(search.decision));
  const applied = parseRole(one(search.applied)) ?? undefined;
  const flag = one(search.flag) as FlagType | undefined;
  const filters: Filters = {
    tier,
    decision,
    applied,
    flag: flag && flag in FLAG_LABEL ? flag : undefined,
    suggest: one(search.suggest) === "1",
    top: one(search.top) === "1",
    sort: SORT_KEYS.find((key) => key === one(search.sort)),
    dir: one(search.dir) === "asc" || one(search.dir) === "desc" ? (one(search.dir) as "asc" | "desc") : undefined,
  };
  const sort = parseSort(filters.sort, filters.dir);
  // Sorting keeps whatever filters are active.
  const active: Record<string, string | undefined> = {
    tier: filters.tier,
    decision: filters.decision,
    applied: filters.applied,
    flag: filters.flag,
    suggest: filters.suggest ? "1" : undefined,
    top: filters.top ? "1" : undefined,
  };
  const sortHref = (next: { key: string; dir: string }) =>
    href(role, { ...active, ...(next.key === "rank" && next.dir === "asc" ? {} : { sort: next.key, dir: next.dir }) });
  const { rows, all, cohort, progress, pending } = await loadDashboard(role, filters);
  const criteria = RUBRICS[role];
  const filtered = Boolean(filters.tier || filters.decision || filters.applied || filters.flag || filters.suggest || filters.top);
  const processing = pending.some((row) => !["failed", "needs_ocr"].includes(row.status));

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 md:px-6">
      <AutoRefresh active={processing} />
      <AppHeader>
        <UploadDialog />
        <ThemeToggle />
        <form action={signOut}>
          <Button type="submit" variant="ghost">
            Sign out
          </Button>
        </form>
      </AppHeader>

      <nav className="mt-6 flex gap-1 border-b" aria-label="Role">
        {(["pm", "spm"] as RoleKey[]).map((key) => (
          <Link
            key={key}
            href={href(key, {})}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium",
              key === role ? "border-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
            aria-current={key === role ? "page" : undefined}
          >
            {ROLE_LABEL[key]}
          </Link>
        ))}
      </nav>

      {all === 0 ? (
        pending.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <p className="anim-fade-up mt-8 rounded-xl border bg-card p-4 text-sm text-muted-foreground shadow-xs">
              Your first CVs are being read and scored. They will rank here as soon as they finish.
            </p>
            <ProcessingList pending={pending} />
          </>
        )
      ) : (
      <div className="flex flex-col">
      <ReviewProgress
        progress={progress}
        active={filters.decision}
        hrefFor={(next) => href(role, { ...active, decision: next })}
        className="mt-5 max-md:-order-1"
      />

      <CohortPanel
        cohort={cohort}
        criteria={criteria.map(({ id, name }) => ({ id, name }))}
        role={role}
        hrefFor={(next) => href(role, next)}
        className="mt-3 max-md:order-6"
      />

      <div className="mt-6 space-y-2">
        <p className="text-sm text-muted-foreground">
          {filtered ? `${rows.length} of ${all} candidates` : `${all} candidates`}, ranked for {ROLE_LABEL[role]}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          {TIERS.map((value) => (
            <Link
              key={value}
              href={href(role, { ...active, tier: tier === value ? undefined : value })}
              aria-current={tier === value ? "true" : undefined}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-md border px-2.5",
                tier === value && "bg-muted font-medium",
              )}
            >
              {TIER_LABEL[value]}
              <span className="tabular-nums text-muted-foreground">{cohort.tiers[value]}</span>
            </Link>
          ))}
          <span aria-hidden className="mx-1 hidden h-5 w-px bg-border sm:block" />
          {(["pm", "spm"] as RoleKey[]).map((key) => (
            <Link
              key={key}
              href={href(role, { ...active, applied: applied === key ? undefined : key })}
              className={cn("inline-flex min-h-9 items-center rounded-md border px-2.5", applied === key && "bg-muted font-medium")}
            >
              Applied {ROLE_LABEL[key]}
            </Link>
          ))}
          {filtered && (
            <Link href={href(role, {})} className="inline-flex min-h-9 items-center rounded-md px-2.5 text-muted-foreground underline">
              Clear filters
            </Link>
          )}
        </div>
      </div>

      <RankedTable
        rows={rows}
        criteria={criteria.map(({ id, name }) => ({ id, name }))}
        role={role}
        sort={sort}
        hrefFor={sortHref}
      />

      {rows.length === 0 && <p className="mt-6 text-sm text-muted-foreground">No candidates match.</p>}

      <div className="max-md:order-5">
        <ProcessingList pending={pending} />
      </div>
      </div>
      )}
    </main>
  );
}
