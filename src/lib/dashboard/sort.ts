// Column sorting for the ranked table. "rank" is the system's own order (total, then the
// tie-break); every other key re-orders the same rows without changing their rank number.

export const SORT_KEYS = ["rank", "c1", "c2", "c3", "c4", "c5", "total", "years", "name"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDir = "asc" | "desc";

export type Sortable = {
  rank: number;
  name: string;
  total: number;
  productYears: number;
  subScores: { criterion: string; score: number }[];
};

export function parseSort(key: string | undefined, dir: string | undefined): { key: SortKey; dir: SortDir } {
  const parsedKey = SORT_KEYS.find((value) => value === key) ?? "rank";
  const fallback: SortDir = parsedKey === "rank" || parsedKey === "name" ? "asc" : "desc";
  return { key: parsedKey, dir: dir === "asc" || dir === "desc" ? dir : fallback };
}

// First click on a column sorts the useful way round (best first; A–Z for names); a second flips it.
export function nextDir(current: { key: SortKey; dir: SortDir }, clicked: SortKey): SortDir {
  if (current.key === clicked) return current.dir === "asc" ? "desc" : "asc";
  return clicked === "rank" || clicked === "name" ? "asc" : "desc";
}

function valueOf(row: Sortable, key: SortKey): number | string {
  switch (key) {
    case "rank":
      return row.rank;
    case "name":
      return row.name.toLowerCase();
    case "total":
      return row.total;
    case "years":
      return row.productYears;
    default:
      return row.subScores[Number(key.slice(1)) - 1]?.score ?? 0;
  }
}

// Stable: ties keep their ranked order, so equal scores never shuffle.
export function sortRows<T extends Sortable>(rows: T[], key: SortKey, dir: SortDir): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const x = valueOf(a.row, key);
      const y = valueOf(b.row, key);
      const diff = typeof x === "string" ? x.localeCompare(String(y)) : x - (y as number);
      return diff !== 0 ? diff * sign : a.index - b.index;
    })
    .map(({ row }) => row);
}
