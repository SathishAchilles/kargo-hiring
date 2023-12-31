import type { Evidence, Role } from "@/lib/evidence/schema";
import type { RoleKey } from "@/lib/types";
import { isProductRole } from "./years";

// Both Kargo rubrics as data. Each criterion lists anchors from 5 down to 1;
// the first anchor whose test returns quotes (possibly none) sets the score.
// Thresholds follow specs/rubric-scoring/spec.md.

export type Facts = { evidence: Evidence; productYears: number };

type Test = (facts: Facts) => string[] | null;

export type Anchor = { score: number; text: string; test: Test };

export type Criterion = { id: string; name: string; weight: number; anchors: Anchor[] };

// ---- evidence helpers --------------------------------------------------------

const quotes = <T extends { quote: string }>(items: T[]) => (items.length ? items.map((item) => item.quote) : null);
const always: Test = () => [];

const productRoles = (e: Evidence) => e.roles.filter(isProductRole);
const notLarge = (role: Role) =>
  role.companySizeBand === "under_100" || (role.companySizeBand === "unknown" && (role.companyHeadcount ?? 0) < 100);
const opsRoles = (e: Evidence, domain: Role["opsDomain"]) =>
  e.roles.filter((role) => role.opsDomain === domain && !isProductRole(role));
const onsiteProduct = (e: Evidence) => [
  ...productRoles(e).filter((role) => role.onsiteOpsImmersion),
  ...e.discovery.filter((item) => item.onsite),
];
// P1/S3: time spent with the people who run operations, in person.
const onsiteImmersion = (e: Evidence) => [
  ...productRoles(e).filter((role) => role.onsiteOpsImmersion),
  ...e.discovery.filter((item) => item.onsite && item.withOpsUsers),
];
// P1/S3 level 2: learning from ops users without being on site (interviews, calls, surveys).
const opsUserDiscovery = (e: Evidence) => e.discovery.filter((item) => item.withOpsUsers && item.cadence !== "none");
const outcomes = (e: Evidence) => e.shipped.filter((item) => item.outcome);
const reasonedKills = (e: Evidence) => e.killed.filter((item) => item.reason);
const ownedIntegrations = (e: Evidence) => e.integrations.filter((item) => item.involvement !== "contributed");
const CORE_SYSTEMS = new Set(["carrier", "customs_port", "erp"]);
const noPmAbove = (e: Evidence) =>
  productRoles(e).filter((role) => role.pmAbove === false || role.soleOrFirstPm || role.roleType === "founder");
const decidesFreely = (e: Evidence) => productRoles(e).filter((role) => !role.committeeDecisions);

function both(a: string[] | null, b: string[] | null): string[] | null {
  return a && b ? [...a, ...b] : null;
}
function either(...options: (string[] | null)[]): string[] | null {
  const hits = options.filter((option): option is string[] => option !== null);
  return hits.length ? hits.flat() : null;
}
const inRange = (value: number, low: number, high: number) => value >= low && value <= high;
const yearsNote = (facts: Facts) => [`${facts.productYears.toFixed(1)} product years`];

// ---- ops immersion (P1 and S3 share thresholds) ----------------------------

const opsAnchors: Anchor[] = [
  {
    score: 5,
    text: "Freight/3PL/customs/port operations role and on-site immersion with ops users in a product role",
    test: ({ evidence: e }) => both(quotes(opsRoles(e, "freight")), quotes(onsiteImmersion(e))),
  },
  {
    score: 4,
    text: "Freight/3PL/customs/port operations role, or adjacent physical operations plus on-site immersion as a PM",
    test: ({ evidence: e }) =>
      either(quotes(opsRoles(e, "freight")), both(quotes(opsRoles(e, "adjacent_physical")), quotes(onsiteImmersion(e)))),
  },
  {
    score: 3,
    text: "Adjacent physical operations role (plant, warehouse, delivery, retail, catering), or on-site immersion with operations users in a product role",
    test: ({ evidence: e }) => either(quotes(opsRoles(e, "adjacent_physical")), quotes(onsiteImmersion(e))),
  },
  {
    score: 2,
    text: "Desk-only exposure to operations (consulting, analysis, or interviews and research with operations users)",
    test: ({ evidence: e }) => either(quotes(opsRoles(e, "desk")), quotes(opsUserDiscovery(e))),
  },
  { score: 1, text: "No operations exposure", test: always },
];

// ---- PM rubric ---------------------------------------------------------------

export const PM_RUBRIC: Criterion[] = [
  { id: "P1", name: "Ground-level ops immersion", weight: 0.25, anchors: opsAnchors },
  {
    id: "P2",
    name: "Shipped, killed, learned",
    weight: 0.25,
    anchors: [
      {
        score: 5,
        text: "Shipped with an outcome and killed something with a reason",
        test: ({ evidence: e }) => both(quotes(outcomes(e)), quotes(reasonedKills(e))),
      },
      {
        score: 4,
        text: "Shipped with an outcome and iterated after launch",
        test: ({ evidence: e }) => both(quotes(outcomes(e)), quotes(e.shipped.filter((item) => item.iterated))),
      },
      { score: 3, text: "Shipped with an outcome", test: ({ evidence: e }) => quotes(outcomes(e)) },
      {
        score: 2,
        text: "Shipped without stated outcomes, or a contributing role only",
        test: ({ evidence: e }) => either(quotes(e.shipped), quotes(productRoles(e))),
      },
      { score: 1, text: "No shipping evidence", test: always },
    ],
  },
  {
    id: "P3",
    name: "Operating without structure",
    weight: 0.2,
    anchors: [
      {
        score: 5,
        text: "Sole or first PM, or founder of a software product, at a company under 100 people with no PM above",
        test: ({ evidence: e }) =>
          quotes(
            decidesFreely(e).filter(
              (role) =>
                notLarge(role) && role.pmAbove !== true && (role.soleOrFirstPm || role.roleType === "founder"),
            ),
          ),
      },
      {
        score: 4,
        text: "Sole or first PM for a period, or product ownership at a company under 100 people",
        test: ({ evidence: e }) =>
          quotes(decidesFreely(e).filter((role) => role.soleOrFirstPm || (notLarge(role) && role.pmAbove !== true))),
      },
      {
        score: 3,
        text: "0→1 build or practice-building inside a company with a PM above",
        test: ({ evidence: e }) =>
          quotes(decidesFreely(e).filter((role) => role.builtProductPractice || (notLarge(role) && role.pmAbove === true))),
      },
      {
        score: 2,
        text: "Product role at a company of 100+ people with a PM above",
        test: ({ evidence: e }) => quotes(decidesFreely(e)),
      },
      { score: 1, text: "Committee-driven decisions or no product role", test: always },
    ],
  },
  {
    id: "P4",
    name: "Direct customer discovery",
    weight: 0.15,
    anchors: [
      {
        score: 5,
        text: "Recurring discovery on site with users",
        test: ({ evidence: e }) =>
          either(
            quotes(e.discovery.filter((item) => item.cadence === "recurring" && item.onsite)),
            both(quotes(e.discovery.filter((item) => item.cadence === "recurring")), quotes(onsiteProduct(e))),
          ),
      },
      {
        score: 4,
        text: "Recurring structured discovery (calls or sessions)",
        test: ({ evidence: e }) =>
          quotes(e.discovery.filter((item) => item.cadence === "recurring" && !item.viaOtherTeamsOnly)),
      },
      {
        score: 3,
        text: "Some user interviews",
        test: ({ evidence: e }) =>
          either(quotes(e.discovery.filter((item) => !item.viaOtherTeamsOnly && item.cadence !== "none")), quotes(onsiteProduct(e))),
      },
      {
        score: 2,
        text: "Discovery only through other teams or data",
        test: ({ evidence: e }) => quotes(e.discovery.filter((item) => item.viaOtherTeamsOnly)),
      },
      { score: 1, text: "No discovery evidence", test: always },
    ],
  },
  {
    id: "P5",
    name: "Product years (2–4 band)",
    weight: 0.15,
    anchors: [
      { score: 5, text: "2.0–4.0 product years", test: (f) => (inRange(f.productYears, 2, 4) ? yearsNote(f) : null) },
      {
        score: 3,
        text: "1.0–1.9 or 4.1–6.0 product years",
        test: (f) => (inRange(f.productYears, 1, 1.99) || inRange(f.productYears, 4.01, 6) ? yearsNote(f) : null),
      },
      { score: 2, text: "Over 6.0 product years", test: (f) => (f.productYears > 6 ? yearsNote(f) : null) },
      { score: 1, text: "Under 1.0 product year", test: yearsNote },
    ],
  },
];

// ---- Senior PM rubric ------------------------------------------------------------

export const SPM_RUBRIC: Criterion[] = [
  {
    id: "S1",
    name: "Integration and data layer",
    weight: 0.25,
    anchors: [
      {
        score: 5,
        text: "Owned integration with carrier, customs/port or ERP systems with a commercial outcome",
        test: ({ evidence: e }) =>
          quotes(ownedIntegrations(e).filter((item) => CORE_SYSTEMS.has(item.category) && item.commercialOutcome)),
      },
      {
        score: 4,
        text: "Owned integration with carrier, customs/port or ERP systems, or owned a data/integration platform",
        test: ({ evidence: e }) =>
          quotes(ownedIntegrations(e).filter((item) => CORE_SYSTEMS.has(item.category) || item.category === "data_platform")),
      },
      {
        score: 3,
        text: "Owned or led another integration, or owned a platform product or module that runs inside customers' existing operational systems",
        test: ({ evidence: e }) => either(quotes(ownedIntegrations(e)), quotes(e.platforms)),
      },
      {
        score: 2,
        text: "Contributed to integrations",
        test: ({ evidence: e }) => quotes(e.integrations.filter((item) => item.involvement === "contributed")),
      },
      { score: 1, text: "No integration evidence", test: always },
    ],
  },
  {
    id: "S2",
    name: "Autonomous hard calls",
    weight: 0.25,
    anchors: [
      {
        score: 5,
        text: "No PM above and at least one irreversible decision or kill with sunk cost",
        test: ({ evidence: e }) =>
          both(
            quotes(noPmAbove(e).filter((role) => !role.committeeDecisions)),
            either(quotes(e.decisions.filter((item) => item.irreversible)), quotes(e.killed.filter((item) => item.sunkCost))),
          ),
      },
      {
        score: 4,
        text: "No PM above, or at least one kill with a reason",
        test: ({ evidence: e }) =>
          either(quotes(noPmAbove(e).filter((role) => !role.committeeDecisions)), quotes(reasonedKills(e))),
      },
      {
        score: 3,
        text: "Product ownership with a lead above",
        test: ({ evidence: e }) => quotes(decidesFreely(e).filter((role) => role.productOwnership)),
      },
      { score: 2, text: "Shared ownership", test: ({ evidence: e }) => quotes(decidesFreely(e)) },
      { score: 1, text: "Support role or committee decisions", test: always },
    ],
  },
  { id: "S3", name: "Ops-heavy domain", weight: 0.2, anchors: opsAnchors },
  {
    id: "S4",
    name: "Early-stage and PM-function building",
    weight: 0.15,
    anchors: [
      {
        score: 5,
        text: "Managed at least one PM and built product practice, at a company under 100 people",
        test: ({ evidence: e }) =>
          both(
            quotes(productRoles(e).filter((role) => role.pmsManaged >= 1 && notLarge(role))),
            quotes(productRoles(e).filter((role) => role.builtProductPractice)),
          ),
      },
      {
        score: 4,
        text: "Managed at least one PM or built product practice",
        test: ({ evidence: e }) =>
          quotes(productRoles(e).filter((role) => role.pmsManaged >= 1 || role.builtProductPractice)),
      },
      {
        score: 3,
        text: "Early-stage product or founder role",
        test: ({ evidence: e }) => quotes(productRoles(e).filter(notLarge)),
      },
      { score: 2, text: "Product role at 100+ people only", test: ({ evidence: e }) => quotes(productRoles(e)) },
      { score: 1, text: "No product role", test: always },
    ],
  },
  {
    id: "S5",
    name: "Product years (5–8 band)",
    weight: 0.15,
    anchors: [
      { score: 5, text: "5.0–8.0 product years", test: (f) => (inRange(f.productYears, 5, 8) ? yearsNote(f) : null) },
      {
        score: 4,
        text: "4.0–4.9 or 8.1–10.0 product years",
        test: (f) => (inRange(f.productYears, 4, 4.99) || inRange(f.productYears, 8.01, 10) ? yearsNote(f) : null),
      },
      {
        score: 3,
        text: "3.0–3.9 or over 10.0 product years",
        test: (f) => (inRange(f.productYears, 3, 3.99) || f.productYears > 10 ? yearsNote(f) : null),
      },
      { score: 1, text: "Under 3.0 product years", test: yearsNote },
    ],
  },
];

export const RUBRICS: Record<RoleKey, Criterion[]> = { pm: PM_RUBRIC, spm: SPM_RUBRIC };
