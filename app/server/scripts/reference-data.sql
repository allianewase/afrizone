-- Afrizone reference data.
--
-- GENERATED FILE - do not edit. Change prisma/reference.ts and run
--   npm run reference:sql
--
-- Safe to run against production, and safe to run twice. Every statement
-- inserts only when the row is absent: nothing is deleted, and nothing that
-- already exists is modified. An admin who has renamed a skill or retired a
-- credential type keeps their change.
--
-- Apply with:
--   npx wrangler d1 execute afrizone-db --remote --file=scripts/reference-data.sql

-- ------------------------------------------------------------------------
-- Task categories (keyed on name)
-- ------------------------------------------------------------------------
INSERT INTO "Category" ("id", "name", "tier", "defaultPayModel", "active")
SELECT 'ref_cat_dispatch', 'Dispatch', 'DISPATCH', 'HOURLY', 1
WHERE NOT EXISTS (SELECT 1 FROM "Category" WHERE "name" = 'Dispatch');
INSERT INTO "Category" ("id", "name", "tier", "defaultPayModel", "active")
SELECT 'ref_cat_promo', 'Promo', 'PROMO', 'FIXED', 1
WHERE NOT EXISTS (SELECT 1 FROM "Category" WHERE "name" = 'Promo');
INSERT INTO "Category" ("id", "name", "tier", "defaultPayModel", "active")
SELECT 'ref_cat_remote', 'Remote', 'REMOTE', 'HOURLY', 1
WHERE NOT EXISTS (SELECT 1 FROM "Category" WHERE "name" = 'Remote');
INSERT INTO "Category" ("id", "name", "tier", "defaultPayModel", "active")
SELECT 'ref_cat_trade', 'Trade', 'TRADE', 'FIXED', 1
WHERE NOT EXISTS (SELECT 1 FROM "Category" WHERE "name" = 'Trade');
INSERT INTO "Category" ("id", "name", "tier", "defaultPayModel", "active")
SELECT 'ref_cat_student', 'Student', 'STUDENT', 'HOURLY', 1
WHERE NOT EXISTS (SELECT 1 FROM "Category" WHERE "name" = 'Student');
INSERT INTO "Category" ("id", "name", "tier", "defaultPayModel", "active")
SELECT 'ref_cat_sourcing', 'Sourcing', 'DISPATCH', 'FIXED', 1
WHERE NOT EXISTS (SELECT 1 FROM "Category" WHERE "name" = 'Sourcing');
INSERT INTO "Category" ("id", "name", "tier", "defaultPayModel", "active")
SELECT 'ref_cat_media', 'Media', 'PROMO', 'FIXED', 1
WHERE NOT EXISTS (SELECT 1 FROM "Category" WHERE "name" = 'Media');
INSERT INTO "Category" ("id", "name", "tier", "defaultPayModel", "active")
SELECT 'ref_cat_store-audit', 'Store audit', 'TRADE', 'FIXED', 1
WHERE NOT EXISTS (SELECT 1 FROM "Category" WHERE "name" = 'Store audit');
INSERT INTO "Category" ("id", "name", "tier", "defaultPayModel", "active")
SELECT 'ref_cat_delivery', 'Delivery', 'DISPATCH', 'FIXED', 1
WHERE NOT EXISTS (SELECT 1 FROM "Category" WHERE "name" = 'Delivery');

-- ------------------------------------------------------------------------
-- Tax rates (keyed on jurisdiction + category)
-- ------------------------------------------------------------------------
INSERT INTO "TaxRate" ("id", "jurisdiction", "category", "whtRate", "vatRate", "active")
SELECT 'ref_tax_federal_services', 'Federal', 'Services', 0.05, 0.075, 1
WHERE NOT EXISTS (SELECT 1 FROM "TaxRate" WHERE "jurisdiction" = 'Federal' AND "category" = 'Services');
INSERT INTO "TaxRate" ("id", "jurisdiction", "category", "whtRate", "vatRate", "active")
SELECT 'ref_tax_lagos_default', 'Lagos', 'default', 0.05, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM "TaxRate" WHERE "jurisdiction" = 'Lagos' AND "category" = 'default');

-- ------------------------------------------------------------------------
-- Skills (self-declared, gate nothing)
-- ------------------------------------------------------------------------
INSERT INTO "Skill" ("id", "name", "slug", "group", "active", "sortOrder", "createdAt")
VALUES ('ref_skill_motorcycle-riding', 'Motorcycle riding', 'motorcycle-riding', 'Logistics', 1, 1, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "Skill" ("id", "name", "slug", "group", "active", "sortOrder", "createdAt")
VALUES ('ref_skill_route-planning', 'Route planning', 'route-planning', 'Logistics', 1, 2, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "Skill" ("id", "name", "slug", "group", "active", "sortOrder", "createdAt")
VALUES ('ref_skill_parcel-handling', 'Parcel handling', 'parcel-handling', 'Logistics', 1, 3, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "Skill" ("id", "name", "slug", "group", "active", "sortOrder", "createdAt")
VALUES ('ref_skill_customer-service', 'Customer service', 'customer-service', 'Retail', 1, 1, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "Skill" ("id", "name", "slug", "group", "active", "sortOrder", "createdAt")
VALUES ('ref_skill_product-sampling', 'Product sampling', 'product-sampling', 'Retail', 1, 2, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "Skill" ("id", "name", "slug", "group", "active", "sortOrder", "createdAt")
VALUES ('ref_skill_merchandising', 'Merchandising', 'merchandising', 'Retail', 1, 3, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "Skill" ("id", "name", "slug", "group", "active", "sortOrder", "createdAt")
VALUES ('ref_skill_cash-handling', 'Cash handling', 'cash-handling', 'Retail', 1, 4, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "Skill" ("id", "name", "slug", "group", "active", "sortOrder", "createdAt")
VALUES ('ref_skill_data-entry', 'Data entry', 'data-entry', 'Office', 1, 1, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "Skill" ("id", "name", "slug", "group", "active", "sortOrder", "createdAt")
VALUES ('ref_skill_survey-administration', 'Survey administration', 'survey-administration', 'Office', 1, 2, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "Skill" ("id", "name", "slug", "group", "active", "sortOrder", "createdAt")
VALUES ('ref_skill_social-media', 'Social media', 'social-media', 'Office', 1, 3, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "Skill" ("id", "name", "slug", "group", "active", "sortOrder", "createdAt")
VALUES ('ref_skill_photography', 'Photography', 'photography', 'Creative', 1, 1, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "Skill" ("id", "name", "slug", "group", "active", "sortOrder", "createdAt")
VALUES ('ref_skill_event-setup', 'Event setup', 'event-setup', 'Creative', 1, 2, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "Skill" ("id", "name", "slug", "group", "active", "sortOrder", "createdAt")
VALUES ('ref_skill_electrical-work', 'Electrical work', 'electrical-work', 'Trade', 1, 1, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "Skill" ("id", "name", "slug", "group", "active", "sortOrder", "createdAt")
VALUES ('ref_skill_plumbing', 'Plumbing', 'plumbing', 'Trade', 1, 2, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "Skill" ("id", "name", "slug", "group", "active", "sortOrder", "createdAt")
VALUES ('ref_skill_carpentry', 'Carpentry', 'carpentry', 'Trade', 1, 3, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

-- ------------------------------------------------------------------------
-- Credential types (checked by a person, and these DO gate work)
-- ------------------------------------------------------------------------
INSERT INTO "CredentialType" ("id", "name", "slug", "reviewMode", "issuerMode", "requiresExpiry", "requiresReference", "requiresFile", "issuerHint", "active", "sortOrder", "createdAt")
VALUES ('ref_cred_drivers-licence', 'Driver''s licence', 'drivers-licence', 'ADMIN_REVIEW', 'THIRD_PARTY', 1, 1, 1, 'FRSC', 1, 1, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "CredentialType" ("id", "name", "slug", "reviewMode", "issuerMode", "requiresExpiry", "requiresReference", "requiresFile", "issuerHint", "active", "sortOrder", "createdAt")
VALUES ('ref_cred_vehicle-registration', 'Vehicle registration', 'vehicle-registration', 'ADMIN_REVIEW', 'THIRD_PARTY', 1, 1, 1, NULL, 1, 2, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "CredentialType" ("id", "name", "slug", "reviewMode", "issuerMode", "requiresExpiry", "requiresReference", "requiresFile", "issuerHint", "active", "sortOrder", "createdAt")
VALUES ('ref_cred_vehicle-insurance', 'Vehicle insurance', 'vehicle-insurance', 'ADMIN_REVIEW', 'THIRD_PARTY', 1, 1, 1, 'Insurer', 1, 3, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "CredentialType" ("id", "name", "slug", "reviewMode", "issuerMode", "requiresExpiry", "requiresReference", "requiresFile", "issuerHint", "active", "sortOrder", "createdAt")
VALUES ('ref_cred_student-enrolment', 'Student enrolment', 'student-enrolment', 'ADMIN_REVIEW', 'THIRD_PARTY', 1, 1, 1, NULL, 1, 4, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "CredentialType" ("id", "name", "slug", "reviewMode", "issuerMode", "requiresExpiry", "requiresReference", "requiresFile", "issuerHint", "active", "sortOrder", "createdAt")
VALUES ('ref_cred_trade-certification', 'Trade certification', 'trade-certification', 'ADMIN_REVIEW', 'THIRD_PARTY', 0, 0, 1, NULL, 1, 5, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "CredentialType" ("id", "name", "slug", "reviewMode", "issuerMode", "requiresExpiry", "requiresReference", "requiresFile", "issuerHint", "active", "sortOrder", "createdAt")
VALUES ('ref_cred_cv', 'CV', 'cv', 'ADMIN_REVIEW', 'THIRD_PARTY', 0, 0, 1, NULL, 1, 6, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "CredentialType" ("id", "name", "slug", "reviewMode", "issuerMode", "requiresExpiry", "requiresReference", "requiresFile", "issuerHint", "active", "sortOrder", "createdAt")
VALUES ('ref_cred_afrizone-verified-dispatch', 'Afrizone verified dispatch rider', 'afrizone-verified-dispatch', 'ADMIN_REVIEW', 'AFRIZONE', 0, 0, 0, NULL, 1, 7, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "CredentialType" ("id", "name", "slug", "reviewMode", "issuerMode", "requiresExpiry", "requiresReference", "requiresFile", "issuerHint", "active", "sortOrder", "createdAt")
VALUES ('ref_cred_auditor-accreditation', 'Auditor accreditation', 'auditor-accreditation', 'ADMIN_REVIEW', 'AFRIZONE', 1, 0, 0, NULL, 1, 8, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
