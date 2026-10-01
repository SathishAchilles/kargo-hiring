import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import Link from "next/link";
import { DecisionBadge } from "@/components/decision-badge";
import { DecisionButtons } from "@/components/decision-buttons";
import { ChipRow } from "@/components/insight-chip";
import { RadarPreviewLink, RadarPreviewTotal, type RadarData } from "@/components/radar-preview";
import { ScoreBar } from "@/components/score-bar";
import { ScoreRing } from "@/components/score-ring";
import { TierBadge } from "@/components/tier-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { visibleChips } from "@/lib/dashboard/chips";
import type { DashboardRow } from "@/lib/dashboard/queries";
import { nextDir, type SortDir, type SortKey } from "@/lib/dashboard/sort";
import { ROLE_LABEL, type RoleKey } from "@/lib/types";
import { cn } from "@/lib/utils";

const EMAIL_LABEL: Record<string, string> = {
  none: "—",
  drafted: "Drafted",
  needs_manual_edit: "Needs edit",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
};

type Sort = { key: SortKey; dir: SortDir };

const radarFor = (row: DashboardRow, criteria: { id: string; name: string }[]): RadarData => ({
  name: row.name,
  total: row.total,
  tier: row.tier,
  criteria: row.subScores.map((item) => ({
    id: item.criterion,
    name: criteria.find((c) => c.id === item.criterion)?.name ?? "",
    score: item.score,
  })),
});

// Top three get a quiet medal tone; the number is still the visible text.
const MEDAL: Record<number, string> = {
  1: "bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800",
  2: "bg-slate-100 text-slate-800 ring-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-600",
  3: "bg-orange-100 text-orange-900 ring-orange-300 dark:bg-orange-950 dark:text-orange-200 dark:ring-orange-800",
};

function RankBadge({ rank }: { rank: number }) {
  return MEDAL[rank] ? (
    <span className={cn("grid size-6 place-items-center rounded-full text-xs font-semibold tabular-nums ring-1", MEDAL[rank])}>
      {rank}
    </span>
  ) : (
    <span className="tabular-nums text-muted-foreground">{rank}</span>
  );
}

function SortHead({
  label,
  full,
  sortKey,
  sort,
  hrefFor,
  className,
}: {
  label: string;
  full: string;
  sortKey: SortKey;
  sort: Sort;
  hrefFor: (sort: Sort) => string;
  className?: string;
}) {
  const active = sort.key === sortKey;
  const Icon = !active ? ChevronsUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn("sticky top-0 z-10 bg-muted/95 px-2 text-xs font-medium text-muted-foreground backdrop-blur", className)}
    >
      <Link
        href={hrefFor({ key: sortKey, dir: nextDir(sort, sortKey) })}
        title={`Sort by ${full}`}
        className={cn(
          "inline-flex min-h-8 items-center gap-1 rounded-sm px-1 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
          active && "text-foreground",
        )}
      >
        {label}
        <span className="sr-only"> ({full})</span>
        <Icon className="size-3 shrink-0" aria-hidden />
      </Link>
    </TableHead>
  );
}

export function RankedTable({
  rows,
  criteria,
  role,
  sort,
  hrefFor,
}: {
  rows: DashboardRow[];
  criteria: { id: string; name: string }[];
  role: RoleKey;
  sort: Sort;
  hrefFor: (sort: Sort) => string;
}) {
  return (
    <>
      {/* Desktop: a real table whose header stays visible while the 50 rows scroll. */}
      <Table containerClassName="mt-3 hidden max-h-[75dvh] overflow-y-auto rounded-xl border bg-card shadow-xs md:block">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <SortHead label="#" full="rank" sortKey="rank" sort={sort} hrefFor={hrefFor} />
            <SortHead label="Candidate" full="name" sortKey="name" sort={sort} hrefFor={hrefFor} className="min-w-44" />
            {criteria.map((criterion, index) => (
              <SortHead
                key={criterion.id}
                label={criterion.id}
                full={criterion.name}
                sortKey={`c${index + 1}` as SortKey}
                sort={sort}
                hrefFor={hrefFor}
                className="text-center"
              />
            ))}
            <SortHead label="Total" full="total score" sortKey="total" sort={sort} hrefFor={hrefFor} className="text-right" />
            <SortHead label="Yrs" full="product and total years" sortKey="years" sort={sort} hrefFor={hrefFor} />
            <TableHead className="sticky top-0 z-10 bg-muted/95 px-2 text-xs font-medium text-muted-foreground backdrop-blur">
              Insights
            </TableHead>
            <TableHead className="sticky top-0 z-10 bg-muted/95 px-2 text-xs font-medium text-muted-foreground backdrop-blur">
              Your decision
              <span className="sr-only"> (shortlist, on hold or decline from here)</span>
            </TableHead>
            <TableHead className="sticky top-0 z-10 bg-muted/95 px-2 text-xs font-medium text-muted-foreground backdrop-blur">
              Email
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow
              key={row.id}
              className="anim-fade-up align-top transition-colors"
              style={{ animationDelay: `${Math.min(index, 14) * 25}ms` }}
            >
              <TableCell className="px-3 py-3">
                <RankBadge rank={row.rank} />
              </TableCell>
              <TableCell className="px-2 py-3 whitespace-normal">
                <RadarPreviewLink
                  href={`/candidates/${row.id}?from=${role}`}
                  data={radarFor(row, criteria)}
                  className="font-medium hover:underline"
                />
                <p className="text-xs text-muted-foreground">Applied {ROLE_LABEL[row.appliedRole]}</p>
              </TableCell>
              {row.subScores.map((item) => (
                <TableCell key={item.criterion} className="px-2 py-3 text-center">
                  <ScoreBar score={item.score} label={item.criterion} />
                </TableCell>
              ))}
              <TableCell className="px-2 py-3">
                <div className="flex flex-col items-end gap-1">
                  <RadarPreviewTotal data={radarFor(row, criteria)}>
                    <ScoreRing total={row.total} tier={row.tier} />
                  </RadarPreviewTotal>
                  <TierBadge tier={row.tier} />
                </div>
              </TableCell>
              <TableCell className="px-2 py-3 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                <span title="Product years / total years">
                  {row.productYears.toFixed(1)} / {row.totalYears.toFixed(1)}
                </span>
              </TableCell>
              <TableCell className="min-w-64 max-w-lg px-2 py-3 whitespace-normal">
                <ChipRow {...visibleChips(row.chips, 3)} />
              </TableCell>
              <TableCell className="px-2 py-3">
                <div className="flex flex-col items-start gap-1.5">
                  <DecisionBadge decision={row.decision} />
                  <DecisionButtons candidateId={row.id} role={role} current={row.decision} note={row.decisionNote} variant="row" />
                </div>
              </TableCell>
              <TableCell className="px-2 py-3 text-xs whitespace-nowrap">{EMAIL_LABEL[row.emailStatus]}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Phone: one card per candidate, with the five sub-scores in a row. */}
      <ul className="mt-3 space-y-3 md:hidden">
        {rows.map((row, index) => (
          <li
            key={row.id}
            className="anim-fade-up rounded-xl border bg-card p-3 shadow-xs"
            style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">#{row.rank}</p>
                <Link
                  href={`/candidates/${row.id}?from=${role}`}
                  className="inline-block min-h-6 font-medium break-words hover:underline"
                >
                  {row.name}
                </Link>
                <p className="text-xs text-muted-foreground tabular-nums">
                  Product {row.productYears.toFixed(1)} yrs · Total {row.totalYears.toFixed(1)} yrs
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <RadarPreviewTotal data={radarFor(row, criteria)}>
                  <ScoreRing total={row.total} tier={row.tier} size="sm" />
                </RadarPreviewTotal>
                <TierBadge tier={row.tier} />
              </div>
            </div>
            <div className="mt-3 flex justify-between gap-2" aria-label="Sub-scores">
              {row.subScores.map((item) => (
                <div key={item.criterion} className="flex flex-col items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">{item.criterion}</span>
                  <ScoreBar score={item.score} label={item.criterion} />
                </div>
              ))}
            </div>
            <div className="mt-3">
              <ChipRow {...visibleChips(row.chips, 3)} />
            </div>
            <div className="mt-3 space-y-2 border-t pt-2">
              <DecisionBadge decision={row.decision} />
              <DecisionButtons candidateId={row.id} role={role} current={row.decision} note={row.decisionNote} variant="card" />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
