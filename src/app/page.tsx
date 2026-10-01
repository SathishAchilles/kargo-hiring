import Link from "next/link";
import { signOut } from "@/app/signin/actions";
import { AutoRefresh } from "@/components/auto-refresh";
import { ChipRow } from "@/components/insight-chip";
import { TierBadge } from "@/components/tier-badge";
import { Button } from "@/components/ui/button";
import { UploadDialog } from "@/components/upload-dialog";
import { loadDashboard, type Filters } from "@/lib/dashboard/queries";
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
const EMAIL_LABEL: Record<string, string> = {
  none: "—",
  drafted: "Drafted",
  needs_manual_edit: "Needs edit",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
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
  };
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

      {/* Desktop table */}
      <div className="mt-3 hidden overflow-x-auto rounded-lg border md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Candidate</th>
              {criteria.map((criterion) => (
                <th key={criterion.id} className="px-2 py-2 text-center font-medium" title={criterion.name}>
                  {criterion.id}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium">Total</th>
              <th className="px-3 py-2 font-medium">Insights</th>
              <th className="px-3 py-2 font-medium">Email</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t align-top">
                <td className="px-3 py-3 tabular-nums text-muted-foreground">{row.rank}</td>
                <td className="px-3 py-3">
                  <Link href={`/candidates/${row.id}?role=${role}`} className="font-medium hover:underline">
                    {row.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">Applied {ROLE_LABEL[row.appliedRole]}</p>
                </td>
                {row.subScores.map((item) => (
                  <td key={item.criterion} className="px-2 py-3 text-center tabular-nums">
                    <span className={cn(item.score >= 4 && "font-semibold", item.score <= 2 && "text-muted-foreground")}>
                      {item.score}
                    </span>
                  </td>
                ))}
                <td className="px-3 py-3 text-right">
                  <div className="text-base font-semibold tabular-nums">{row.total}</div>
                  <TierBadge tier={row.tier} />
                </td>
                <td className="max-w-md px-3 py-3">
                  <ChipRow chips={row.chips} />
                </td>
                <td className="px-3 py-3 text-xs whitespace-nowrap">{EMAIL_LABEL[row.emailStatus]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phone list */}
      <ul className="mt-3 space-y-3 md:hidden">
        {rows.map((row) => (
          <li key={row.id} className="rounded-lg border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">#{row.rank}</p>
                <Link href={`/candidates/${row.id}?role=${role}`} className="font-medium break-words hover:underline">
                  {row.name}
                </Link>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-lg font-semibold tabular-nums">{row.total}</div>
                <TierBadge tier={row.tier} />
              </div>
            </div>
            <div className="mt-2">
              <ChipRow chips={row.chips} />
            </div>
          </li>
        ))}
      </ul>

      {rows.length === 0 && <p className="mt-6 text-sm text-muted-foreground">No candidates match.</p>}

      {pending.length > 0 && (
        <section className="mt-8" aria-label="Processing">
          <h2 className="text-sm font-medium">Not ranked yet</h2>
          <ul className="mt-2 divide-y rounded-lg border text-sm">
            {pending.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <Link href={`/candidates/${row.id}`} className="break-all hover:underline">
                  {row.fileName}
                </Link>
                <span className={cn("text-xs", row.status === "failed" ? "text-destructive" : "text-muted-foreground")}>
                  {row.status === "failed" ? `failed: ${row.reason ?? "unknown"}` : row.status.replace("_", " ")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
