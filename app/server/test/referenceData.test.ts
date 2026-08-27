// The reference catalogues, and the slugs code looks up by hand.
//
// This file exists because of a specific failure: production had every table
// migration 0018 creates and NONE of the catalogue rows, so `CredentialType`
// was empty. Nothing errored. A worker simply could not submit a document,
// because there was no document type to pick - and the courier checklist asked
// for three papers against a catalogue with no entries.
//
// The tests below are the cheap half of preventing that. The other half is
// scripts/reference-data.sql actually being applied.
import { describe, it, expect } from "vitest";
import {
  CATEGORIES,
  CREDENTIAL_TYPES,
  SKILLS,
  TAX_RATES,
} from "../prisma/reference";
import { COURIER_CREDENTIALS } from "../src/services/courier";
import { DEFAULT_TASK_RULES } from "../src/services/taskRules";

describe("the catalogue is internally consistent", () => {
  it("has no duplicate slugs", () => {
    const skillSlugs = SKILLS.map((s) => s.slug);
    const credSlugs = CREDENTIAL_TYPES.map((c) => c.slug);
    expect(new Set(skillSlugs).size).toBe(skillSlugs.length);
    expect(new Set(credSlugs).size).toBe(credSlugs.length);
  });

  it("has no duplicate category names", () => {
    // The production insert is keyed on name, because Category has no unique
    // constraint. Two rows with the same name would make that key ambiguous.
    const names = CATEGORIES.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("has no duplicate jurisdiction+category tax rates", () => {
    const keys = TAX_RATES.map((t) => `${t.jurisdiction}|${t.category}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("slugs that code looks up by hand exist in the catalogue", () => {
  // Each of these is a string written in a source file and resolved against the
  // database at runtime. A rename in one place and not the other fails silently:
  // the lookup returns null and the feature quietly does nothing.
  const slugs = () => new Set(CREDENTIAL_TYPES.map((c) => c.slug));

  it("covers the three courier papers", () => {
    for (const c of COURIER_CREDENTIALS) {
      expect(slugs().has(c.slug)).toBe(true);
    }
  });

  it("covers the auditor accreditation storeAudit.ts gates inspections on", () => {
    // Without this row a store audit task is created UNGATED, which is worse
    // than not creating one - it produces a document that looks like
    // verification and is not.
    expect(slugs().has("auditor-accreditation")).toBe(true);
  });

  it("covers every credential slug the task generators require", () => {
    for (const [kind, rule] of Object.entries(DEFAULT_TASK_RULES)) {
      if (!rule.credentialSlug) continue;
      expect(
        slugs().has(rule.credentialSlug),
        `rules.${kind}.credentialSlug is "${rule.credentialSlug}", which no credential type has`
      ).toBe(true);
    }
  });
});

describe("categories cover what the generators write", () => {
  it("has a category for every kind of generated task", () => {
    // services/taskGenerator.ts sets these as free-text categories. One the
    // admin filter does not list is a task that appears to belong nowhere.
    const names = new Set(CATEGORIES.map((c) => c.name));
    for (const generated of ["Sourcing", "Media", "Store audit"]) {
      expect(names.has(generated), `no category named "${generated}"`).toBe(true);
    }
  });
});
