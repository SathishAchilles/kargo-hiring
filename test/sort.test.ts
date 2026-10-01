import { describe, expect, it } from "vitest";
import { nextDir, parseSort, sortRows, type Sortable } from "@/lib/dashboard/sort";

const row = (rank: number, name: string, total: number, years: number, scores: number[]): Sortable => ({
  rank,
  name,
  total,
  productYears: years,
  subScores: scores.map((score, index) => ({ criterion: `P${index + 1}`, score })),
});

const rows = [
  row(1, "Zoya", 100, 2.9, [5, 5, 5, 5, 5]),
  row(2, "Arun", 96, 3.4, [5, 5, 4, 5, 5]),
  row(3, "Meera", 96, 1.8, [4, 5, 5, 5, 3]),
  row(4, "Kabir", 80, 6.0, [2, 4, 3, 3, 2]),
];
const names = (list: Sortable[]) => list.map((item) => item.name);

describe("parseSort", () => {
  it("defaults to the system rank, ascending", () => {
    expect(parseSort(undefined, undefined)).toEqual({ key: "rank", dir: "asc" });
  });
  it("defaults scores to best-first and ignores unknown keys", () => {
    expect(parseSort("c1", undefined)).toEqual({ key: "c1", dir: "desc" });
    expect(parseSort("password", "sideways")).toEqual({ key: "rank", dir: "asc" });
  });
});

describe("nextDir", () => {
  it("flips the direction when the same column is clicked again", () => {
    expect(nextDir({ key: "c1", dir: "desc" }, "c1")).toBe("asc");
    expect(nextDir({ key: "c1", dir: "asc" }, "c1")).toBe("desc");
  });
  it("starts names A–Z and scores best-first", () => {
    expect(nextDir({ key: "rank", dir: "asc" }, "name")).toBe("asc");
    expect(nextDir({ key: "rank", dir: "asc" }, "years")).toBe("desc");
  });
});

describe("sortRows", () => {
  it("sorts by a sub-score, keeping tied rows in their ranked order", () => {
    expect(names(sortRows(rows, "c1", "desc"))).toEqual(["Zoya", "Arun", "Meera", "Kabir"]);
    expect(names(sortRows(rows, "c3", "desc"))).toEqual(["Zoya", "Meera", "Arun", "Kabir"]);
  });
  it("sorts by years and by name", () => {
    expect(names(sortRows(rows, "years", "desc"))).toEqual(["Kabir", "Arun", "Zoya", "Meera"]);
    expect(names(sortRows(rows, "name", "asc"))).toEqual(["Arun", "Kabir", "Meera", "Zoya"]);
  });
  it("does not change the rank numbers", () => {
    expect(sortRows(rows, "name", "asc").map((item) => item.rank)).toEqual([2, 4, 3, 1]);
  });
  it("does not mutate its input", () => {
    const copy = [...rows];
    sortRows(rows, "years", "asc");
    expect(rows).toEqual(copy);
  });
});
