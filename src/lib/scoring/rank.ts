import type { RoleKey, TieKey } from "@/lib/types";

export type Rankable = { id: string; total: number; tieKey: TieKey };

const COMPONENTS = ["kills", "first", "second", "evidenceCount", "uploadedAt"] as const;
type Component = (typeof COMPONENTS)[number];

export function tieLabel(component: Component, role: RoleKey): string {
  switch (component) {
    case "kills":
      return "kill evidence";
    case "first":
      return role === "pm" ? "P1 ops immersion" : "S1 integration depth";
    case "second":
      return role === "pm" ? "P2 ship/kill/learn" : "S2 hard calls";
    case "evidenceCount":
      return "evidence count";
    case "uploadedAt":
      return "upload time";
  }
}

function compareComponent(a: TieKey, b: TieKey, component: Component): number {
  if (component === "uploadedAt") return a.uploadedAt.localeCompare(b.uploadedAt);
  return b[component] - a[component];
}

export function compareRanked(a: Rankable, b: Rankable): number {
  if (a.total !== b.total) return b.total - a.total;
  for (const component of COMPONENTS) {
    const diff = compareComponent(a.tieKey, b.tieKey, component);
    if (diff !== 0) return diff;
  }
  return a.id.localeCompare(b.id);
}

export type Ranked<T extends Rankable> = T & { rank: number; tieBrokenBy: string | null };

// Sorts and labels: a candidate sharing its total with a neighbour shows the
// first tie-break component that separates it from that neighbour.
export function rank<T extends Rankable>(items: T[], role: RoleKey): Ranked<T>[] {
  const sorted = [...items].sort(compareRanked);
  return sorted.map((item, index) => {
    const neighbour = [sorted[index - 1], sorted[index + 1]].find((other) => other && other.total === item.total);
    let tieBrokenBy: string | null = null;
    if (neighbour) {
      const component = COMPONENTS.find((key) => compareComponent(item.tieKey, neighbour.tieKey, key) !== 0);
      tieBrokenBy = component ? tieLabel(component, role) : "upload time";
    }
    return { ...item, rank: index + 1, tieBrokenBy };
  });
}
