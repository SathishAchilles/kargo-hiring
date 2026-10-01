import type { Evidence, Role } from "@/lib/evidence/schema";

export function role(overrides: Partial<Role> = {}): Role {
  return {
    title: "Product Manager",
    company: "Acme",
    start: "2022-01",
    end: "present",
    internship: false,
    roleType: "product",
    opsDomain: "none",
    companyHeadcount: null,
    companySizeBand: "unknown",
    companyStage: null,
    soleOrFirstPm: false,
    pmAbove: null,
    pmsManaged: 0,
    productOwnership: true,
    onsiteOpsImmersion: false,
    builtProductPractice: false,
    committeeDecisions: false,
    quote: `${overrides.title ?? "Product Manager"} quote`,
    ...overrides,
  };
}

export function evidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    roles: [],
    education: [],
    shipped: [],
    killed: [],
    discovery: [],
    integrations: [],
    platforms: [],
    decisions: [],
    statedFigures: [],
    location: { text: null, quote: null },
    ...overrides,
  };
}
