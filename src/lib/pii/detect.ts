// Deterministic detection of a candidate's personal details. Nothing here calls AI.

export type Pii = {
  name: string;
  nameTokens: string[];
  emails: string[];
  phones: string[];
  links: string[];
  locationText: string | null;
};

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
// Indian mobile numbers, optionally with +91, with or without the 5+5 space.
const PHONE = /(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/g;
const EMAIL_TEST = new RegExp(EMAIL.source);
const PHONE_TEST = new RegExp(PHONE.source);
const URL = /\b(?:https?:\/{1,2}|www\.)[^\s|•·,)]+|\b(?:linkedin\.com|github\.com|behance\.net|flowcv\.me|medium\.com)\/[^\s|•·,)]+/gi;

const CITIES = [
  "Navi Mumbai",
  "Mumbai",
  "Thane",
  "Pune",
  "Bengaluru",
  "Bangalore",
  "Chennai",
  "Delhi NCR",
  "New Delhi",
  "Delhi",
  "Gurugram",
  "Gurgaon",
  "Noida",
  "Hyderabad",
  "Kochi",
  "Ahmedabad",
  "Kolkata",
  "Surat",
];

const HEADING_WORDS = new Set(
  [
    "professional",
    "summary",
    "work",
    "experience",
    "education",
    "skills",
    "product",
    "manager",
    "senior",
    "projects",
    "certifications",
    "profile",
    "core",
    "competencies",
    "curriculum",
    "vitae",
    "resume",
    "objective",
    "contact",
    "achievements",
  ],
);

function titleCase(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function nameFromFilename(fileName: string): string | null {
  const match = fileName.match(/^(?:s?pm_)?\d+_([a-z]+(?:_[a-z]+)+)\.(?:pdf|docx)$/i);
  if (!match) return null;
  return match[1].split("_").map(titleCase).join(" ");
}

function isHeading(words: string[]) {
  return words.some((word) => HEADING_WORDS.has(word.toLowerCase()));
}

// A name either repeats in the text or sits within five lines of the contact details.
function nameFromText(text: string): string | null {
  const counts = new Map<string, number>();
  const lines = text.split("\n");
  const contactLines = lines
    .map((line, index) => (EMAIL_TEST.test(line) || PHONE_TEST.test(line) ? index : -1))
    .filter((index) => index >= 0);
  const sequence = /\b([A-Z][a-z]+|[A-Z]{2,})(?:[ \t]+([A-Z][a-z]+|[A-Z]{2,})){1,2}\b/g;
  lines.forEach((line, index) => {
    const nearContact = contactLines.some((contact) => Math.abs(contact - index) <= 5);
    for (const match of line.matchAll(sequence)) {
      const words = match[0].split(/\s+/);
      if (isHeading(words)) continue;
      const key = words.map(titleCase).join(" ");
      counts.set(key, (counts.get(key) ?? 0) + 1 + (nearContact ? 1 : 0));
    }
  });
  let best: string | null = null;
  let bestCount = 1;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  if (best) return best;
  const first = lines
    .map((line) => line.trim())
    .find((line) => /^[A-Za-z .'-]{3,40}$/.test(line) && !isHeading(line.split(/\s+/)));
  return first ? first.split(/\s+/).map(titleCase).join(" ") : null;
}

export function tokensOf(name: string): string[] {
  return [...new Set(name.toLowerCase().split(/[^a-z]+/).filter((token) => token.length >= 2))];
}

export function digitsOf(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

// "REDDYsquad_5@x.co": an all-caps name run glued to a lowercase local part.
function cleanEmail(raw: string): string {
  return raw.replace(/^[A-Z]{2,}(?=[a-z0-9_])/, "").toLowerCase();
}

export function detectLocation(text: string): string | null {
  const head = text.split("\n").slice(0, 12).join(" ");
  for (const scope of [head, text]) {
    for (const city of CITIES) {
      if (new RegExp(`\\b${city}\\b`, "i").test(scope)) return city;
    }
  }
  return null;
}

export function detectPii(text: string, fileName: string, nameOverride?: string): Pii {
  const name = nameOverride?.trim() || nameFromFilename(fileName) || nameFromText(text) || "Unknown Candidate";
  const emails = unique([...text.matchAll(EMAIL)].map((match) => cleanEmail(match[0])));
  const phones = unique([...text.matchAll(PHONE)].map((match) => digitsOf(match[0])));
  const links = unique([...text.matchAll(URL)].map((match) => match[0].replace(/[./]+$/, "")));
  return {
    name,
    nameTokens: tokensOf(name),
    emails,
    phones,
    links,
    locationText: detectLocation(text),
  };
}
