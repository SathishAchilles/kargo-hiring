import type { Pii } from "./detect";

// Bump when redaction rules change; stored evidence is then re-extracted.
export const REDACTION_VERSION = 1;

export const NAME_PLACEHOLDER = "[CANDIDATE]";

const INSTITUTION_MARKER =
  /\b(?:University|College|Institute|School|Vidyapeetham|Vidyapeeth|Vidyapith|Academy|Polytechnic|Mandir|IIT|IIM|IIIT|NIT|BITS|XLRI|DTU|VJTI|COEP|PICT|TAPMI|IMT|SRCC|NMIMS|SPJIMR)\b/;

function escape(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Tokens of 4+ letters are removed as case-insensitive substrings, which also
// catches run-together forms like "MEHTARohan". Shorter tokens must not touch
// another letter on the left, and not a lowercase letter on the right, so
// "ROYIshaan" loses "ROY" but "royalty" is left alone.
export function namePattern(token: string): RegExp {
  if (token.length >= 4) return new RegExp(escape(token), "gi");
  const letters = [...token].map((ch) => `[${ch.toUpperCase()}${ch.toLowerCase()}]`).join("");
  return new RegExp(`(?<![A-Za-z])${letters}(?![a-z])`, "g");
}

export function phonePattern(digits: string): RegExp {
  const body = [...digits].map(escape).join("[\\s-]?");
  return new RegExp(`(?:\\+?91[\\s-]?)?${body}`, "g");
}

export function emailPattern(email: string): RegExp {
  return new RegExp(escape(email), "gi");
}

function redactInstitutions(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      if (!INSTITUTION_MARKER.test(line)) return line;
      // Keep separators so degree words and year ranges stay in place.
      const parts = line.split(/(\s·\s|\s\|\s|\s•\s|•|\t|,\s)/);
      return parts
        .map((part, index) => (index % 2 === 0 && INSTITUTION_MARKER.test(part) ? "[INSTITUTION]" : part))
        .join("");
    })
    .join("\n");
}

export function redact(text: string, pii: Pii): string {
  let out = text;
  for (const email of pii.emails) out = out.replace(emailPattern(email), "[EMAIL]");
  for (const link of pii.links) out = out.split(link).join("[LINK]");
  out = out.replace(/\b(?:https?:\/{1,2}|www\.)\S+/gi, "[LINK]");
  out = out.replace(/\b(?:linkedin\.com|github\.com|behance\.net|flowcv\.me)\/\S*/gi, "[LINK]");
  for (const phone of pii.phones) out = out.replace(phonePattern(phone), "[PHONE]");
  const tokens = [...pii.nameTokens].sort((a, b) => b.length - a.length);
  for (const token of tokens) out = out.replace(namePattern(token), NAME_PLACEHOLDER);
  return redactInstitutions(out);
}
