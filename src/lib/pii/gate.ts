import type { Pii } from "./detect";
import { emailPattern, namePattern, phonePattern } from "./redact";

export class PiiLeakError extends Error {
  constructor(public readonly kinds: string[]) {
    super(`personal details found in AI input (${kinds.join(", ")})`);
    this.name = "PiiLeakError";
  }
}

function hostOf(link: string): string | null {
  const match = link.match(/(?:https?:\/{1,2})?(?:www\.)?([^/\s]+)(\/[^\s]*)?/i);
  if (!match) return null;
  // A profile path identifies the person; a bare common host (linkedin.com) does not.
  return match[2] && match[2].length > 1 ? `${match[1]}${match[2]}`.toLowerCase() : null;
}

// The leak gate. Every AI request goes through this; it throws before any network call.
export function assertNoPii(payload: string, pii: Pii): void {
  const kinds = new Set<string>();
  for (const token of pii.nameTokens) {
    if (namePattern(token).test(payload)) kinds.add("name");
  }
  for (const email of pii.emails) if (emailPattern(email).test(payload)) kinds.add("email");
  for (const phone of pii.phones) if (phonePattern(phone).test(payload)) kinds.add("phone");
  const lower = payload.toLowerCase();
  for (const link of pii.links) {
    const host = hostOf(link);
    if (host && lower.includes(host)) kinds.add("link");
  }
  if (kinds.size > 0) throw new PiiLeakError([...kinds]);
}
