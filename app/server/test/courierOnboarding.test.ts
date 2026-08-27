// Courier onboarding (Blueprint §3.2, §15: Courier sign-up & KYC).
//
// The property being protected is that a courier can always tell what is left
// for THEM to do. Two failures matter more than the rest: a step that shows as
// incomplete when the courier has finished their part and Afrizone has not
// (which sends them looking for work that is not theirs), and a step nobody on
// foot can ever complete (which teaches people to ignore the checklist).
//
// Nothing here gates work. Whether a courier may take a given delivery is
// services/eligibility.ts, and these tests exist partly to keep that true.
import { describe, it, expect } from "vitest";
import { apiGet, apiPut } from "./http";
import { createUserWithToken, testPrisma } from "./helpers";
import { normalisePlate, requiresPlate, credentialsFor } from "../src/services/courier";

const prisma = () => testPrisma() as any;

async function credentialType(slug: string, name: string) {
  const existing = await prisma().credentialType.findUnique({ where: { slug } });
  if (existing) return existing;
  return prisma().credentialType.create({
    data: {
      name,
      slug,
      reviewMode: "ADMIN_REVIEW",
      issuerMode: "THIRD_PARTY",
      requiresExpiry: true,
      requiresReference: true,
      requiresFile: true,
      active: true,
    },
  });
}

async function courierPapers() {
  await credentialType("drivers-licence", "Driver's licence");
  await credentialType("vehicle-registration", "Vehicle registration");
  await credentialType("vehicle-insurance", "Vehicle insurance");
}

async function grant(
  workerId: string,
  slug: string,
  status: string,
  expiresAt: Date | null = new Date(Date.now() + 365 * 24 * 3600 * 1000)
) {
  const type = await prisma().credentialType.findUnique({ where: { slug } });
  return prisma().credential.create({
    data: {
      workerId,
      credentialTypeId: type.id,
      title: type.name,
      status,
      expiresAt,
    },
  });
}

function step(body: any, key: string) {
  return body.steps.find((s: any) => s.key === key);
}

describe("plates and vehicles", () => {
  it("reduces the ways a plate is written to one", () => {
    expect(normalisePlate("ABC 123 DE")).toBe("ABC123DE");
    expect(normalisePlate("abc-123de")).toBe("ABC123DE");
  });

  it("knows which vehicles the law expects to carry a plate", () => {
    expect(requiresPlate("MOTORCYCLE")).toBe(true);
    expect(requiresPlate("VAN")).toBe(true);
    expect(requiresPlate("BICYCLE")).toBe(false);
    expect(requiresPlate("FOOT")).toBe(false);
  });

  it("asks for no vehicle papers from somebody delivering on foot", () => {
    // A step a person cannot complete is indistinguishable from a broken one,
    // and a checklist with one gets ignored rather than satisfied.
    expect(credentialsFor("FOOT")).toHaveLength(0);
    expect(credentialsFor("BICYCLE")).toHaveLength(0);
    expect(credentialsFor("MOTORCYCLE")).toHaveLength(3);
  });
});

describe("the readiness checklist", () => {
  it("starts with identity and the vehicle, and nothing else", async () => {
    const rider = await createUserWithToken("WORKER");
    const res = await apiGet("/api/me/courier", rider.token);
    expect(res.status).toBe(200);

    // Papers are not listed yet, because which papers depends on the vehicle.
    expect(res.body.steps.map((s: any) => s.key)).toEqual(["identity", "vehicle"]);
    expect(res.body.ready).toBe(false);
  });

  it("is readable before somebody has declared themselves a courier", async () => {
    // A checklist that refuses until you have already committed is a door with
    // the instructions on the inside.
    const undecided = await createUserWithToken("WORKER");
    const res = await apiGet("/api/me/courier", undecided.token);
    expect(res.status).toBe(200);
    expect(res.body.vehicleTypes.length).toBeGreaterThan(0);
  });

  it("asks for papers once a motorcycle is recorded", async () => {
    await courierPapers();
    const rider = await createUserWithToken("WORKER");

    const res = await apiPut(
      "/api/me/courier/vehicle",
      { vehicleType: "MOTORCYCLE", plateNumber: "abc 123 de" },
      rider.token
    );
    expect(res.status).toBe(200);
    expect(res.body.vehicle.plateNumber).toBe("ABC123DE");
    expect(res.body.steps.map((s: any) => s.key)).toContain("vehicle-insurance");
  });

  it("counts a document waiting on Afrizone as done by the courier", async () => {
    await courierPapers();
    const rider = await createUserWithToken("WORKER", { kycStatus: "VERIFIED" });
    await apiPut("/api/me/courier/vehicle", { vehicleType: "CAR", plateNumber: "XYZ789AB" }, rider.token);
    await grant(rider.user.id, "drivers-licence", "PENDING");

    const res = await apiGet("/api/me/courier", rider.token);
    const licence = step(res.body, "drivers-licence");

    // WAITING, not TODO - and it must not count as outstanding. Telling a rider
    // to try harder at something that is not theirs to finish is the failure
    // this state exists to prevent.
    expect(licence.state).toBe("WAITING");
    expect(licence.detail).toContain("Nothing for you to do");
    expect(res.body.outstanding).toBe(2); // registration and insurance
  });

  it("treats an expired document as a problem, not as valid", async () => {
    await courierPapers();
    const rider = await createUserWithToken("WORKER", { kycStatus: "VERIFIED" });
    await apiPut("/api/me/courier/vehicle", { vehicleType: "VAN", plateNumber: "OLD111AA" }, rider.token);
    // VERIFIED, and expired yesterday. Expiry is derived from the clock, so no
    // background job has to have run for this to be right.
    await grant(rider.user.id, "vehicle-insurance", "VERIFIED", new Date(Date.now() - 24 * 3600 * 1000));

    const res = await apiGet("/api/me/courier", rider.token);
    const insurance = step(res.body, "vehicle-insurance")
    expect(insurance.state).toBe("PROBLEM");
    expect(insurance.detail).toContain("expired");
  });

  it("is ready only when every step is done", async () => {
    await courierPapers();
    const rider = await createUserWithToken("WORKER", { kycStatus: "TIER_APPROVED" });
    await apiPut("/api/me/courier/vehicle", { vehicleType: "MOTORCYCLE", plateNumber: "RDY123XX" }, rider.token);
    await grant(rider.user.id, "drivers-licence", "VERIFIED");
    await grant(rider.user.id, "vehicle-registration", "VERIFIED");

    let res = await apiGet("/api/me/courier", rider.token);
    expect(res.body.ready).toBe(false);

    await grant(rider.user.id, "vehicle-insurance", "VERIFIED");
    res = await apiGet("/api/me/courier", rider.token);
    expect(res.body.ready).toBe(true);
    expect(res.body.outstanding).toBe(0);
  });

  it("counts somebody on foot as ready once their identity is confirmed", async () => {
    const walker = await createUserWithToken("WORKER", { kycStatus: "VERIFIED" });
    await apiPut("/api/me/courier/vehicle", { vehicleType: "FOOT" }, walker.token);

    const res = await apiGet("/api/me/courier", walker.token);
    expect(res.body.ready).toBe(true);
  });
});

describe("the account type reaching the client", () => {
  it("is returned by GET /api/me", async () => {
    // Not incidental. The mobile client's own User type has declared
    // accountType since the account-type work landed, and this endpoint did not
    // send it - so every screen branching on it silently took the INDIVIDUAL
    // path, including the row that leads to courier setup. A field the client
    // believes it has and the server omits is worse than an absent one, because
    // nothing errors and nothing logs.
    const rider = await createUserWithToken("WORKER");
    await testPrisma().user.update({
      where: { id: rider.user.id },
      data: { accountType: "COURIER" },
    });

    const res = await apiGet("/api/me", rider.token);
    expect(res.status).toBe(200);
    expect(res.body.accountType).toBe("COURIER");
  });
});

describe("recording the vehicle", () => {
  it("insists on a plate for something that must have one", async () => {
    const rider = await createUserWithToken("WORKER");
    const res = await apiPut("/api/me/courier/vehicle", { vehicleType: "CAR" }, rider.token);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("plate");
  });

  it("clears the plate when a van becomes a bicycle", async () => {
    const rider = await createUserWithToken("WORKER");
    await apiPut("/api/me/courier/vehicle", { vehicleType: "VAN", plateNumber: "VAN111AA" }, rider.token);
    const res = await apiPut("/api/me/courier/vehicle", { vehicleType: "BICYCLE" }, rider.token);

    expect(res.status).toBe(200);
    // Left behind, the old plate stays attached to a vehicle that does not have
    // one - and holds the unique index against a plate nobody is riding.
    expect(res.body.vehicle.plateNumber).toBeNull();
  });

  it("refuses a plate already registered to another courier", async () => {
    const first = await createUserWithToken("WORKER");
    await apiPut("/api/me/courier/vehicle", { vehicleType: "MOTORCYCLE", plateNumber: "DUP123AA" }, first.token);

    const second = await createUserWithToken("WORKER");
    const res = await apiPut(
      "/api/me/courier/vehicle",
      { vehicleType: "MOTORCYCLE", plateNumber: "dup-123 aa" },
      second.token
    );

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("already registered");
  });

  it("lets the same courier re-save their own plate", async () => {
    const rider = await createUserWithToken("WORKER");
    await apiPut("/api/me/courier/vehicle", { vehicleType: "TRICYCLE", plateNumber: "KEK555BB" }, rider.token);
    const res = await apiPut(
      "/api/me/courier/vehicle",
      { vehicleType: "TRICYCLE", plateNumber: "KEK555BB" },
      rider.token
    );
    expect(res.status).toBe(200);
  });

  it("refuses a vehicle type it does not know", async () => {
    const rider = await createUserWithToken("WORKER");
    const res = await apiPut("/api/me/courier/vehicle", { vehicleType: "HELICOPTER" }, rider.token);
    expect(res.status).toBe(400);
  });

  it("needs somebody signed in", async () => {
    const res = await apiGet("/api/me/courier");
    expect(res.status).toBe(401);
  });
});
