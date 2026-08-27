-- Courier onboarding (Blueprint §3.2, §15: Courier sign-up & KYC).
--
-- What a courier has that a Tasker does not is a VEHICLE, and everything that
-- follows from one: a licence to drive it, papers proving it is theirs, and
-- insurance. The papers are already `Credential` rows - reviewed by a person,
-- expiring on their own schedule, gating work through the eligibility engine.
-- What has had nowhere to live is the vehicle itself.
--
-- ON THE USER, NOT THE ORGANIZATION, and that is the decision worth explaining.
-- A rider on their own bike has no organization at all, and a company's rider
-- still rides one specific machine with one plate. Hanging this off the business
-- would leave independents - the majority - with nowhere to record it, and would
-- make a company's fleet a list nobody can attribute to the person actually
-- carrying the parcel.
--
-- One row per person, enforced: a courier rides one vehicle at a time. Somebody
-- who switches from a bike to a van edits this row, and the delivery history
-- keeps saying what it always said, because history lives on the tasks.
CREATE TABLE "CourierProfile" (
  "id"             TEXT PRIMARY KEY NOT NULL,
  "userId"         TEXT NOT NULL,
  -- MOTORCYCLE | TRICYCLE | CAR | VAN | BICYCLE | FOOT.
  --
  -- FOOT is not a joke entry. Inner-city drops on foot are real work, and a
  -- courier who has to invent a vehicle to finish sign-up will type something
  -- false into the plate field, which is worse than the truth.
  "vehicleType"    TEXT NOT NULL,
  -- Null where the vehicle has no plate, which FOOT and BICYCLE never do.
  "plateNumber"    TEXT,
  "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourierProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id")
);

CREATE UNIQUE INDEX "CourierProfile_userId_key" ON "CourierProfile"("userId");

-- Two couriers cannot be riding the same registered vehicle. NULLs stay distinct
-- in SQLite, so everyone on foot or on a bicycle is unaffected.
CREATE UNIQUE INDEX "CourierProfile_plateNumber_key" ON "CourierProfile"("plateNumber");
