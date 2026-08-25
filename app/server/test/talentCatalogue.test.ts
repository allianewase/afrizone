// The skills / credential-types catalogue, and the two derivations that the
// whole talent-profile design leans on.
//
// The design decision under test, and the one most likely to be "fixed" later
// by someone who has not read the reasoning: a credential's EXPIRY IS NEVER
// STORED. It is computed from expiresAt each time it is asked, so a background
// job that fails to run cannot leave a lapsed licence reading as valid.
import { describe, it, expect } from "vitest";
import { apiGet, apiPost, apiPatch } from "./http";
import { createUserWithToken, testPrisma } from "./helpers";
import { isCredentialValid, isCredentialExpiring, slugify } from "../src/types";

const NOW = new Date("2026-06-15T12:00:00.000Z");
const day = 24 * 60 * 60 * 1000;

describe("credential validity is derived, never stored", () => {
  it("counts a verified credential with no expiry as valid", () => {
    expect(isCredentialValid({ status: "VERIFIED", expiresAt: null }, NOW)).toBe(true);
  });

  it("counts a verified credential that has passed its date as invalid", () => {
    // The row still says VERIFIED - nothing wrote EXPIRED to it, and nothing
    // ever will. The clock alone decides.
    const lapsed = { status: "VERIFIED", expiresAt: new Date(NOW.getTime() - day) };
    expect(isCredentialValid(lapsed, NOW)).toBe(false);
  });

  it("counts a verified credential still in date as valid", () => {
    expect(
      isCredentialValid({ status: "VERIFIED", expiresAt: new Date(NOW.getTime() + day) }, NOW)
    ).toBe(true);
  });

  it("never counts pending, rejected or revoked, whatever the date", () => {
    for (const status of ["PENDING", "REJECTED", "REVOKED"]) {
      expect(isCredentialValid({ status, expiresAt: null }, NOW)).toBe(false);
      expect(
        isCredentialValid({ status, expiresAt: new Date(NOW.getTime() + 999 * day) }, NOW)
      ).toBe(false);
    }
  });

  it("accepts an ISO string as well as a Date, since that is what the API returns", () => {
    expect(
      isCredentialValid({ status: "VERIFIED", expiresAt: new Date(NOW.getTime() + day).toISOString() }, NOW)
    ).toBe(true);
  });

  it("flags one lapsing inside the window, but not one already lapsed", () => {
    expect(
      isCredentialExpiring({ status: "VERIFIED", expiresAt: new Date(NOW.getTime() + 10 * day) }, 30, NOW)
    ).toBe(true);
    expect(
      isCredentialExpiring({ status: "VERIFIED", expiresAt: new Date(NOW.getTime() + 40 * day) }, 30, NOW)
    ).toBe(false);
    // Already gone is not "expiring" - it belongs in a different queue.
    expect(
      isCredentialExpiring({ status: "VERIFIED", expiresAt: new Date(NOW.getTime() - day) }, 30, NOW)
    ).toBe(false);
    // Open-ended credentials never expire, so they never appear in the filter.
    expect(isCredentialExpiring({ status: "VERIFIED", expiresAt: null }, 30, NOW)).toBe(false);
  });
});

describe("slugify", () => {
  it("makes a stable identifier out of a display name", () => {
    expect(slugify("Driver's licence")).toBe("driver-s-licence");
    expect(slugify("  Vehicle   Registration  ")).toBe("vehicle-registration");
    expect(slugify("CV")).toBe("cv");
  });
});

describe("skills catalogue", () => {
  it("creates a skill and derives its slug", async () => {
    const { token } = await createUserWithToken("SUPER_ADMIN");
    const res = await apiPost("/api/settings/skills", { name: "Forklift operation", group: "Logistics" }, token);
    expect(res.status).toBe(201);
    expect(res.body.slug).toBe("forklift-operation");
    expect(res.body.active).toBe(true);
  });

  it("refuses a duplicate slug rather than silently making a second one", async () => {
    const { token } = await createUserWithToken("SUPER_ADMIN");
    await apiPost("/api/settings/skills", { name: "Crane signalling", group: "Trade" }, token);
    const again = await apiPost("/api/settings/skills", { name: "Crane signalling", group: "Trade" }, token);
    expect(again.status).toBe(409);
  });

  it("lets the display name be renamed without changing the slug", async () => {
    const { token } = await createUserWithToken("SUPER_ADMIN");
    const made = await apiPost("/api/settings/skills", { name: "Till operation", group: "Retail" }, token);

    // A rename must not orphan the WorkerSkill rows pointing at the slug, which
    // is exactly why slug is not editable and name is not unique.
    const renamed = await apiPatch(
      `/api/settings/skills/${made.body.id}`,
      { name: "Point-of-sale operation", slug: "something-else" },
      token
    );
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe("Point-of-sale operation");
    expect(renamed.body.slug).toBe(made.body.slug);
  });

  it("retires a skill instead of deleting it, and hides it from the default list", async () => {
    const { token } = await createUserWithToken("SUPER_ADMIN");
    const made = await apiPost("/api/settings/skills", { name: "Fax machine repair", group: "Office" }, token);
    await apiPatch(`/api/settings/skills/${made.body.id}`, { active: false }, token);

    const visible = await apiGet("/api/settings/skills", token);
    expect(visible.body.some((s: any) => s.id === made.body.id)).toBe(false);

    // Still there, so workers who declared it are not silently altered.
    const all = await apiGet("/api/settings/skills?all=1", token);
    expect(all.body.some((s: any) => s.id === made.body.id)).toBe(true);
    expect(await testPrisma().skill.count({ where: { id: made.body.id } })).toBe(1);
  });

  it("lets any authenticated user read the catalogue but only a super admin write it", async () => {
    const { token: worker } = await createUserWithToken("WORKER");
    expect((await apiGet("/api/settings/skills", worker)).status).toBe(200);
    expect((await apiPost("/api/settings/skills", { name: "X", group: "Y" }, worker)).status).toBe(403);

    const { token: manager } = await createUserWithToken("TASK_MANAGER");
    expect((await apiPost("/api/settings/skills", { name: "X", group: "Y" }, manager)).status).toBe(403);
  });

  it("requires a name and a group", async () => {
    const { token } = await createUserWithToken("SUPER_ADMIN");
    expect((await apiPost("/api/settings/skills", { name: "No group" }, token)).status).toBe(400);
    expect((await apiPost("/api/settings/skills", { group: "No name" }, token)).status).toBe(400);
  });
});

describe("credential types catalogue", () => {
  it("creates a third-party type that requires a file by default", async () => {
    const { token } = await createUserWithToken("SUPER_ADMIN");
    const res = await apiPost(
      "/api/settings/credential-types",
      { name: "Food handler permit", requiresExpiry: true, issuerHint: "NAFDAC" },
      token
    );
    expect(res.status).toBe(201);
    expect(res.body.reviewMode).toBe("ADMIN_REVIEW");
    expect(res.body.issuerMode).toBe("THIRD_PARTY");
    expect(res.body.requiresFile).toBe(true);
    expect(res.body.requiresExpiry).toBe(true);
  });

  it("never requires a file for an Afrizone-issued type, even if asked to", async () => {
    const { token } = await createUserWithToken("SUPER_ADMIN");
    // An Afrizone-issued credential is evidenced by platform history, not by a
    // document the worker holds - requiring a file would make it ungrantable,
    // and with it the only route past a gate for someone with no formal paper.
    const res = await apiPost(
      "/api/settings/credential-types",
      { name: "Afrizone trusted promoter", issuerMode: "AFRIZONE", requiresFile: true },
      token
    );
    expect(res.status).toBe(201);
    expect(res.body.requiresFile).toBe(false);
  });

  it("also forces that when an existing type is switched to Afrizone-issued", async () => {
    const { token } = await createUserWithToken("SUPER_ADMIN");
    const made = await apiPost("/api/settings/credential-types", { name: "Safety pass" }, token);
    expect(made.body.requiresFile).toBe(true);

    const switched = await apiPatch(
      `/api/settings/credential-types/${made.body.id}`,
      { issuerMode: "AFRIZONE" },
      token
    );
    expect(switched.status).toBe(200);
    expect(switched.body.requiresFile).toBe(false);
  });

  it("rejects an unknown review or issuer mode", async () => {
    const { token } = await createUserWithToken("SUPER_ADMIN");
    expect(
      (await apiPost("/api/settings/credential-types", { name: "A", reviewMode: "VIBES" }, token)).status
    ).toBe(400);
    expect(
      (await apiPost("/api/settings/credential-types", { name: "B", issuerMode: "SOMEONE" }, token)).status
    ).toBe(400);
  });

});
