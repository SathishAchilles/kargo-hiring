import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import Link from "next/link";
import { ChipRow } from "@/components/insight-chip";
import { ScoreBar } from "@/components/score-bar";
import { TierBadge } from "@/components/tier-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
      <Table containerClassName="mt-3 hidden max-h-[75dvh] overflow-y-auto rounded-lg border md:block">
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
              Email
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className="align-top">
              <TableCell className="px-3 py-3 tabular-nums text-muted-foreground">{row.rank}</TableCell>
              <TableCell className="px-2 py-3 whitespace-normal">
                <Link href={`/candidates/${row.id}?role=${role}`} className="font-medium hover:underline">
                  {row.name}
                </Link>
                <p className="text-xs text-muted-foreground">Applied {ROLE_LABEL[row.appliedRole]}</p>
              </TableCell>
              {row.subScores.map((item) => (
                <TableCell key={item.criterion} className="px-2 py-3 text-center">
                  <ScoreBar score={item.score} label={item.criterion} />
                </TableCell>
              ))}
              <TableCell className="px-2 py-3 text-right">
                <div className="text-base font-semibold tabular-nums">{row.total}</div>
                <TierBadge tier={row.tier} />
              </TableCell>
              <TableCell className="px-2 py-3 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                <span title="Product years / total years">
                  {row.productYears.toFixed(1)} / {row.totalYears.toFixed(1)}
                </span>
              </TableCell>
              <TableCell className="max-w-sm px-2 py-3 whitespace-normal">
                <ChipRow chips={row.chips} max={3} />
              </TableCell>
              <TableCell className="px-2 py-3 text-xs whitespace-nowrap">{EMAIL_LABEL[row.emailStatus]}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Phone: one card per candidate, with the five sub-scores in a row. */}
      <ul className="mt-3 space-y-3 md:hidden">
        {rows.map((row) => (
          <li key={row.id} className="rounded-lg border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">#{row.rank}</p>
                <Link
                  href={`/candidates/${row.id}?role=${role}`}
                  className="inline-block min-h-6 font-medium break-words hover:underline"
                >
                  {row.name}
                </Link>
                <p className="text-xs text-muted-foreground tabular-nums">
                  Product {row.productYears.toFixed(1)} yrs · Total {row.totalYears.toFixed(1)} yrs
                </p>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-lg font-semibold tabular-nums">{row.total}</div>
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
              <ChipRow chips={row.chips} max={3} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
