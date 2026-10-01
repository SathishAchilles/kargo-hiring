import type { Evidence } from "@/lib/evidence/schema";
import { roleRange } from "@/lib/scoring/years";
import type { FlagType } from "@/lib/types";

// Deterministic integrity checks. They never change scores; see integrity-checks spec.

export type Flag = { type: FlagType; detail: Record<string, unknown>; relatedId?: string };

// ---- duplicate CVs -------------------------------------------------------------

export function shingles(text: string, size = 5): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/\[(?:candidate|email|phone|link|institution)\]/g, " ")
    .split(/[^a-z0-9₹%]+/)
    .filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + size <= words.length; i += 1) out.add(words.slice(i, i + size).join(" "));
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let shared = 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  for (const item of small) if (large.has(item)) shared += 1;
  return shared / (a.size + b.size - shared);
}

export const DUPLICATE_THRESHOLD = 0.9;

export function findDuplicates(
  candidate: { id: string; redacted: string },
  others: { id: string; redacted: string }[],
): Flag[] {
  const mine = shingles(candidate.redacted);
  return others
    .filter((other) => other.id !== candidate.id)
    .map((other) => ({ other, similarity: jaccard(mine, shingles(other.redacted)) }))
    .filter(({ similarity }) => similarity >= DUPLICATE_THRESHOLD)
    .map(({ other, similarity }) => ({
      type: "duplicate" as const,
      detail: { similarity: Math.round(similarity * 100) / 100 },
      relatedId: other.id,
    }));
}

// ---- unfilled placeholders -------------------------------------------------------

const PLACEHOLDERS = [
  /(?:INR|Rs\.?|₹|\$|USD)\s?~?\s?X{2,}[A-Za-z]*/g,
  /(?<![A-Za-z])X{2,}\s?%/g,
  /\[(?:insert|add|your|company|metric|name|xx)[^\]]*\]/gi,
  /lorem ipsum/gi,
];

export function findPlaceholders(text: string): Flag[] {
  const hits = new Set<string>();
  for (const pattern of PLACEHOLDERS) {
    for (const match of text.matchAll(pattern)) {
      const start = Math.max(0, (match.index ?? 0) - 40);
      const end = Math.min(text.length, (match.index ?? 0) + match[0].length + 40);
      hits.add(text.slice(start, end).replace(/\s+/g, " ").trim());
    }
  }
  return [...hits].map((quote) => ({ type: "placeholder", detail: { quote } }));
}

// ---- identity mismatch ---------------------------------------------------------

const ROLE_WORDS = new Set([
  "in",
  "pm",
  "pmin",
  "product",
  "products",
  "productmanager",
  "manager",
  "ops",
  "logistics",
  "freighttech",
  "freight",
  "ux",
  "ui",
  "analytics",
  "analyst",
  "design",
  "designer",
  "dev",
  "official",
  "career",
  "com",
  "www",
  "linkedin",
  "github",
  "behance",
  "net",
  "me",
  "https",
  "http",
]);

function editDistanceAtMostOne(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function matchesName(token: string, nameTokens: string[]): boolean {
  if (nameTokens.some((name) => token === name || (name.length >= 5 && editDistanceAtMostOne(token, name)))) return true;
  // A concatenation of name tokens, possibly with role words after it: "priyakrishnan".
  const joined = nameTokens.join("");
  const reversed = [...nameTokens].reverse().join("");
  return [joined, reversed].some((whole) => token === whole || (token.startsWith(whole) && ROLE_WORDS.has(token.slice(whole.length))));
}

export function handleTokens(link: string): string[] {
  const path = link.replace(/^[a-z]+:\/{1,2}/i, "").replace(/^www\./i, "").split("/").slice(1).join("/");
  return path
    .toLowerCase()
    .split(/[-_./\d]+/)
    .filter((token) => token.length >= 3 && /^[a-z]+$/.test(token) && !ROLE_WORDS.has(token));
}

const PROFILE_HOSTS = /linkedin\.com\/in\/|behance\.net\/|github\.com\/|flowcv\.me\//i;

export function findIdentityMismatch(links: string[], nameTokens: string[]): Flag[] {
  const flags: Flag[] = [];
  for (const link of links) {
    if (!PROFILE_HOSTS.test(link)) continue;
    const foreign = handleTokens(link).filter((token) => !matchesName(token, nameTokens));
    // Only a handle that names a person differently: at least one foreign token and no name match at all,
    // or a foreign first-name-like token next to a near-miss of the surname.
    const anyMatch = handleTokens(link).some((token) => matchesName(token, nameTokens));
    if (foreign.length > 0 && (!anyMatch || foreign.some((token) => token.length >= 4))) {
      flags.push({ type: "identity_mismatch", detail: { link, tokens: foreign } });
    }
  }
  return flags;
}

// ---- dates -----------------------------------------------------------------------

const FULL_TIME_DEGREE = /\b(MBA|PGDM|PGP|B\.?\s?Tech|B\.?\s?E\.?|M\.?\s?Tech|B\.?\s?Com|B\.?\s?Sc|B\.?\s?A\.?|BBA|B\.?\s?Des|B\.?\s?Arch|M\.?\s?Sc|M\.?\s?A\.?|Dual Degree|Bachelor|Master)\b/i;
const NOT_FULL_TIME = /executive|part[- ]time|online|distance|weekend|fellowship|certificat/i;

export function findEducationOverlaps(e: Evidence, asOf: string): Flag[] {
  const flags: Flag[] = [];
  for (const education of e.education) {
    if (education.mode !== "full_time" && education.mode !== "unknown") continue;
    if (!FULL_TIME_DEGREE.test(education.degree) || NOT_FULL_TIME.test(`${education.degree} ${education.quote}`)) continue;
    if (education.startYear === null || education.endYear === null) continue;
    // Academic years: assume July of the start year to May of the end year.
    const study: [number, number] = [education.startYear * 12 + 6, education.endYear * 12 + 5];
    for (const job of e.roles) {
      // Internships and founding a startup while studying are normal, not a red flag.
      // Extracurriculars (society posts, tutoring) are typed "other" and are not jobs either.
      if (job.roleType === "founder" || job.roleType === "other" || job.internship || /intern|trainee/i.test(job.title)) continue;
      const [start, end] = roleRange(job, asOf);
      const overlap = Math.min(end, study[1]) - Math.max(start, study[0]);
      if (overlap > 3) {
        flags.push({
          type: "education_overlap",
          detail: {
            role: `${job.title} (${job.start} – ${job.end})`,
            degree: `${education.degree} (${education.startYear}–${education.endYear})`,
            months: overlap,
          },
        });
      }
    }
  }
  return flags;
}

export function findStatedVsDated(e: Evidence, asOf: string, productYears: number): Flag[] {
  const flags: Flag[] = [];
  for (const figure of e.statedFigures) {
    let dated: number | null = null;
    if (figure.about === "product_experience") dated = productYears;
    // A role still running ("present") is measured to the as-of date, which may be
    // later than when the CV was written, so only closed roles are compared.
    if (figure.about === "role" && figure.roleIndex !== null && e.roles[figure.roleIndex]?.end !== "present" && e.roles[figure.roleIndex]) {
      const [start, end] = roleRange(e.roles[figure.roleIndex], asOf);
      dated = Math.round(((end - start) / 12) * 10) / 10;
    }
    if (dated === null) continue;
    // "2.5+ years" is a lower bound: more dated experience than that is consistent.
    const atLeast = new RegExp(`${String(figure.years).replace(".", "\\.")}\\s*\\+`).test(figure.quote);
    const gap = figure.years - dated;
    if (atLeast ? gap > 1 : Math.abs(gap) > 1) {
      flags.push({
        type: "stated_vs_dated",
        detail: { stated: figure.years, dated, quote: figure.quote },
      });
    }
  }
  return flags;
}
