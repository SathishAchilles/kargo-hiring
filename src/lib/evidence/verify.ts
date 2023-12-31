import { MONTH, type Evidence } from "./schema";

// Normalise PDF artefacts so a faithful quote still matches: case, whitespace,
// dash and quote variants, and spaces that PDF extraction puts around hyphens.
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/■/g, "")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export type Verified = { record: Evidence; dropped: number };

// Drops every fact whose quote is not in the redacted text, and roles with
// unusable dates; role indexes are remapped to the surviving roles.
export function verifyEvidence(raw: Evidence, redactedText: string): Verified {
  const haystack = normalize(redactedText);
  const found = (quote: string | null | undefined) => {
    if (!quote) return false;
    const needle = normalize(quote);
    return needle.length >= 3 && haystack.includes(needle);
  };
  let dropped = 0;
  const keep = <T extends { quote: string }>(items: T[]) =>
    items.filter((item) => {
      const ok = found(item.quote);
      if (!ok) dropped += 1;
      return ok;
    });

  const indexMap = new Map<number, number>();
  const roles = raw.roles.filter((role, index) => {
    const ok = found(role.quote) && MONTH.test(role.start) && (role.end === "present" || MONTH.test(role.end));
    if (!ok) {
      dropped += 1;
      return false;
    }
    indexMap.set(index, indexMap.size);
    return true;
  });
  const remap = (index: number | null) => (index === null ? null : (indexMap.get(index) ?? null));

  const location = found(raw.location.quote) ? raw.location : { text: null, quote: null };
  if (raw.location.quote && !location.quote) dropped += 1;

  const record: Evidence = {
    roles,
    education: keep(raw.education),
    shipped: keep(raw.shipped).map((item) => ({ ...item, roleIndex: remap(item.roleIndex) })),
    killed: keep(raw.killed),
    discovery: keep(raw.discovery),
    integrations: keep(raw.integrations),
    platforms: keep(raw.platforms),
    decisions: keep(raw.decisions),
    statedFigures: keep(raw.statedFigures).map((item) => ({ ...item, roleIndex: remap(item.roleIndex) })),
    location,
  };
  // `dropped` is read only after every keep() above has run.
  return { record, dropped };
}

export function factCount(record: Evidence): number {
  return (
    record.roles.length +
    record.shipped.length +
    record.killed.length +
    record.discovery.length +
    record.integrations.length +
    record.platforms.length +
    record.decisions.length
  );
}
