import type { Role } from "@/lib/evidence/schema";

// Months since year 0; ranges are half-open [start, end).
function monthIndex(yyyyMm: string): number {
  const [year, month] = yyyyMm.split("-").map(Number);
  return year * 12 + (month - 1);
}

export function asOfMonthIndex(asOf: string): number {
  return monthIndex(asOf.slice(0, 7));
}

// A stated end month is included; "present" runs up to (not including) the as-of month.
export function roleRange(role: Pick<Role, "start" | "end">, asOf: string): [number, number] {
  const start = monthIndex(role.start);
  const end = role.end === "present" ? asOfMonthIndex(asOf) : monthIndex(role.end) + 1;
  return [start, Math.max(start, end)];
}

export function unionMonths(ranges: [number, number][]): number {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let current: [number, number] | null = null;
  for (const range of sorted) {
    if (!current || range[0] > current[1]) {
      if (current) total += current[1] - current[0];
      current = [range[0], range[1]];
    } else {
      current[1] = Math.max(current[1], range[1]);
    }
  }
  if (current) total += current[1] - current[0];
  return total;
}

const toYears = (months: number) => Math.round((months / 12) * 10) / 10;

export function isProductRole(role: Pick<Role, "roleType" | "productOwnership">): boolean {
  return role.roleType === "product" || (role.roleType === "founder" && role.productOwnership);
}

// Years of experience count full roles only; internships and student roles do not.
const counts = (role: Role) => !role.internship;

export function productYears(roles: Role[], asOf: string): number {
  return toYears(unionMonths(roles.filter((role) => counts(role) && isProductRole(role)).map((role) => roleRange(role, asOf))));
}

export function totalYears(roles: Role[], asOf: string): number {
  return toYears(unionMonths(roles.filter(counts).map((role) => roleRange(role, asOf))));
}
