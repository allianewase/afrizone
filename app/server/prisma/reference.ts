/**
 * The reference catalogues: task categories, tax rates, skills and credential
 * types.
 *
 * ONE COPY, TWO CONSUMERS. `prisma/seed.ts` builds a development database from
 * these, and `scripts/reference-sql.ts` turns them into idempotent SQL for
 * production. Two hand-maintained copies of this list would drift, and the way
 * anyone would find out is a worker being asked for a document type that exists
 * in dev and not in production.
 *
 * WHAT BELONGS HERE is anything the platform cannot function without and that
 * no user creates: the pickers, the review desk's vocabulary, the default tax
 * rates. Demo users, tasks and organizations do NOT belong here - those are
 * fixtures, they live in seed.ts, and they must never reach production.
 *
 * The skill/credential distinction is the one thing to get right when editing.
 * Skills are self-declared and gate nothing. Anything that must actually be
 * guaranteed - a licence, a certification, proof of enrolment - is a credential
 * type, because only those are checked by a person.
 */

export interface CategorySeed {
  name: string;
  tier: string;
  defaultPayModel: string;
}

export interface TaxRateSeed {
  jurisdiction: string;
  category: string;
  whtRate: number;
  vatRate: number;
}

export interface SkillSeed {
  name: string;
  slug: string;
  group: string;
  sortOrder: number;
}

export interface CredentialTypeSeed {
  name: string;
  slug: string;
  reviewMode: string;
  issuerMode: string;
  requiresExpiry: boolean;
  requiresReference: boolean;
  requiresFile: boolean;
  issuerHint?: string;
  sortOrder: number;
}

export const CATEGORIES: CategorySeed[] = [
  { name: "Dispatch", tier: "DISPATCH", defaultPayModel: "HOURLY" },
  { name: "Promo", tier: "PROMO", defaultPayModel: "FIXED" },
  { name: "Remote", tier: "REMOTE", defaultPayModel: "HOURLY" },
  { name: "Trade", tier: "TRADE", defaultPayModel: "FIXED" },
  { name: "Student", tier: "STUDENT", defaultPayModel: "HOURLY" },
  // Named to match the generators in services/taskRules.ts, which create tasks
  // in these categories from Mart events. A category the generator writes but
  // the admin filter does not list is a task that appears to belong nowhere.
  { name: "Sourcing", tier: "DISPATCH", defaultPayModel: "FIXED" },
  { name: "Media", tier: "PROMO", defaultPayModel: "FIXED" },
  { name: "Store audit", tier: "TRADE", defaultPayModel: "FIXED" },
];

export const TAX_RATES: TaxRateSeed[] = [
  { jurisdiction: "Federal", category: "Services", whtRate: 0.05, vatRate: 0.075 },
  { jurisdiction: "Lagos", category: "default", whtRate: 0.05, vatRate: 0 },
];

export const SKILLS: SkillSeed[] = [
  { name: "Motorcycle riding", slug: "motorcycle-riding", group: "Logistics", sortOrder: 1 },
  { name: "Route planning", slug: "route-planning", group: "Logistics", sortOrder: 2 },
  { name: "Parcel handling", slug: "parcel-handling", group: "Logistics", sortOrder: 3 },
  { name: "Customer service", slug: "customer-service", group: "Retail", sortOrder: 1 },
  { name: "Product sampling", slug: "product-sampling", group: "Retail", sortOrder: 2 },
  { name: "Merchandising", slug: "merchandising", group: "Retail", sortOrder: 3 },
  { name: "Cash handling", slug: "cash-handling", group: "Retail", sortOrder: 4 },
  { name: "Data entry", slug: "data-entry", group: "Office", sortOrder: 1 },
  { name: "Survey administration", slug: "survey-administration", group: "Office", sortOrder: 2 },
  { name: "Social media", slug: "social-media", group: "Office", sortOrder: 3 },
  { name: "Photography", slug: "photography", group: "Creative", sortOrder: 1 },
  { name: "Event setup", slug: "event-setup", group: "Creative", sortOrder: 2 },
  { name: "Electrical work", slug: "electrical-work", group: "Trade", sortOrder: 1 },
  { name: "Plumbing", slug: "plumbing", group: "Trade", sortOrder: 2 },
  { name: "Carpentry", slug: "carpentry", group: "Trade", sortOrder: 3 },
];

export const CREDENTIAL_TYPES: CredentialTypeSeed[] = [
  {
    name: "Driver's licence",
    slug: "drivers-licence",
    reviewMode: "ADMIN_REVIEW",
    issuerMode: "THIRD_PARTY",
    requiresExpiry: true,
    requiresReference: true,
    requiresFile: true,
    issuerHint: "FRSC",
    sortOrder: 1,
  },
  {
    name: "Vehicle registration",
    slug: "vehicle-registration",
    reviewMode: "ADMIN_REVIEW",
    issuerMode: "THIRD_PARTY",
    requiresExpiry: true,
    requiresReference: true,
    requiresFile: true,
    sortOrder: 2,
  },
  {
    // The third of the courier papers. A CredentialType rather than a column for
    // the same reason a licence is: it expires, a person has to look at it, and
    // expiry is computed from the clock rather than stored - so a lapsed policy
    // cannot keep reading as valid because a background job did not run.
    name: "Vehicle insurance",
    slug: "vehicle-insurance",
    reviewMode: "ADMIN_REVIEW",
    issuerMode: "THIRD_PARTY",
    requiresExpiry: true,
    requiresReference: true,
    requiresFile: true,
    issuerHint: "Insurer",
    sortOrder: 3,
  },
  {
    name: "Student enrolment",
    slug: "student-enrolment",
    reviewMode: "ADMIN_REVIEW",
    issuerMode: "THIRD_PARTY",
    requiresExpiry: true,
    requiresReference: true,
    requiresFile: true,
    sortOrder: 4,
  },
  {
    name: "Trade certification",
    slug: "trade-certification",
    reviewMode: "ADMIN_REVIEW",
    issuerMode: "THIRD_PARTY",
    requiresExpiry: false,
    requiresReference: false,
    requiresFile: true,
    sortOrder: 5,
  },
  {
    name: "CV",
    slug: "cv",
    reviewMode: "ADMIN_REVIEW",
    issuerMode: "THIRD_PARTY",
    requiresExpiry: false,
    requiresReference: false,
    requiresFile: true,
    sortOrder: 6,
  },
  {
    // Issued by Afrizone on the evidence of platform history rather than any
    // third-party paper. This is the route by which a worker who is plainly
    // competent, but holds no formal certificate, can still pass a gate.
    name: "Afrizone verified dispatch rider",
    slug: "afrizone-verified-dispatch",
    reviewMode: "ADMIN_REVIEW",
    issuerMode: "AFRIZONE",
    requiresExpiry: false,
    requiresReference: false,
    requiresFile: false,
    sortOrder: 7,
  },
  {
    // Blueprint §3.1: "a store audit requires a verified auditor credential".
    // services/storeAudit.ts looks this up BY SLUG when generating an
    // inspection task - without it the task is created ungated, which is worse
    // than not creating one. This row is why that path works.
    name: "Auditor accreditation",
    slug: "auditor-accreditation",
    reviewMode: "ADMIN_REVIEW",
    issuerMode: "AFRIZONE",
    requiresExpiry: true,
    requiresReference: false,
    requiresFile: false,
    sortOrder: 8,
  },
];
