import Link from "next/link";
import { signOut } from "@/app/signin/actions";
import { AutoRefresh } from "@/components/auto-refresh";
import { ProcessingList } from "@/components/processing-list";
import { RankedTable } from "@/components/ranked-table";
import { Button } from "@/components/ui/button";
import { UploadDialog } from "@/components/upload-dialog";
import { loadDashboard, type Filters } from "@/lib/dashboard/queries";
import { parseSort, SORT_KEYS } from "@/lib/dashboard/sort";
import { parseRole } from "@/lib/intake/validate";
import { RUBRICS } from "@/lib/scoring/rubric";
import { ROLE_LABEL, type FlagType, type RoleKey, type Tier } from "@/lib/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TIERS: Tier[] = ["Shortlist", "Interview", "Hold", "Decline"];
const FLAG_LABEL: Record<FlagType, string> = {
  duplicate: "Duplicate CV",
  placeholder: "Placeholder text",
  identity_mismatch: "Profile link name",
  education_overlap: "Job during full-time degree",
  stated_vs_dated: "Stated vs dated years",
};
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
  const applied = parseRole(one(search.applied)) ?? undefined;
  const flag = one(search.flag) as FlagType | undefined;
  const filters: Filters = {
    tier,
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
    applied: filters.applied,
    flag: filters.flag,
    suggest: filters.suggest ? "1" : undefined,
    top: filters.top ? "1" : undefined,
  };
  const sortHref = (next: { key: string; dir: string }) =>
    href(role, { ...active, ...(next.key === "rank" && next.dir === "asc" ? {} : { sort: next.key, dir: next.dir }) });
  const { rows, all, cohort, pending } = await loadDashboard(role, filters);
  const criteria = RUBRICS[role];
  const filtered = Boolean(filters.tier || filters.applied || filters.flag || filters.suggest || filters.top);
  const processing = pending.some((row) => !["failed", "needs_ocr"].includes(row.status));

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 md:px-6">
      <AutoRefresh active={processing} />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Kargo hiring</h1>
          <p className="text-sm text-muted-foreground">Every CV is scored against both job descriptions.</p>
        </div>
        <div className="flex items-center gap-2">
          <UploadDialog />
          <form action={signOut}>
            <Button type="submit" variant="ghost">
              Sign out
            </Button>
          </form>
        </div>
      </header>

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

      <section aria-label="Cohort insights" className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase">Tiers</p>
          <ul className="mt-2 space-y-1 text-sm">
            {TIERS.map((value) => (
              <li key={value} className="flex justify-between">
                <Link className="hover:underline" href={href(role, { tier: value })}>
                  {value}
                </Link>
                <span className="tabular-nums">{cohort.tiers[value]}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase">Averages</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{cohort.averageAll}</p>
          <p className="text-sm text-muted-foreground">all {cohort.count} candidates</p>
          <Link className="mt-1 block text-sm hover:underline" href={href(role, { applied: role })}>
            {cohort.averageApplicants ?? "—"} for {ROLE_LABEL[role]} applicants
          </Link>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase">At the top</p>
          {cohort.tiedAtTop > 1 ? (
            <Link className="mt-2 block text-sm hover:underline" href={href(role, { top: "1" })}>
              <span className="text-2xl font-semibold tabular-nums">{cohort.tiedAtTop}</span> tied at {cohort.topTotal} — ranked
              by tie-break
            </Link>
          ) : (
            <p className="mt-2 text-sm">No tie at the top ({cohort.topTotal ?? "—"})</p>
          )}
          {cohort.scarcest && (
            <p className="mt-2 text-sm text-muted-foreground">
              Scarcest: <span className="font-medium text-foreground">{cohort.scarcest.criterion}</span>{" "}
              {criteria.find((c) => c.id === cohort.scarcest?.criterion)?.name.toLowerCase()} — {cohort.scarcest.fives} at 5
            </p>
          )}
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase">Check before shortlisting</p>
          <Link className="mt-2 block text-sm hover:underline" href={href(role, { suggest: "1" })}>
            {cohort.suggestOther} suggested for the other role
          </Link>
          <ul className="mt-1 space-y-0.5 text-sm">
            {(Object.entries(cohort.flags) as [FlagType, number][]).map(([type, count]) => (
              <li key={type}>
                <Link className="hover:underline" href={href(role, { flag: type })}>
                  {count} × {FLAG_LABEL[type]}
                </Link>
              </li>
            ))}
            {Object.keys(cohort.flags).length === 0 && <li className="text-muted-foreground">No integrity flags</li>}
          </ul>
        </div>
      </section>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {filtered ? `${rows.length} of ${all} candidates` : `${all} candidates`}, ranked for {ROLE_LABEL[role]}
        </p>
        <div className="flex flex-wrap gap-1.5 text-sm">
          {(["pm", "spm"] as RoleKey[]).map((key) => (
            <Link
              key={key}
              href={href(role, { ...(tier ? { tier } : {}), applied: key })}
              className={cn("rounded-md border px-2 py-1", applied === key && "bg-muted font-medium")}
            >
              Applied {ROLE_LABEL[key]}
            </Link>
          ))}
          {filtered && (
            <Link href={href(role, {})} className="rounded-md border px-2 py-1">
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

      <ProcessingList pending={pending} />
    </main>
  );
}
