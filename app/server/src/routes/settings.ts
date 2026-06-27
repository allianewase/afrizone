import { Router, Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, requireRole, AuthedRequest } from "../auth";
import { TIERS } from "../types";

const router = Router();

const PAY_MODELS = ["HOURLY", "FIXED"];

// ── Tax rates ─────────────────────────────────────────────────────────────────

// GET /api/settings/tax-rates → TaxRate[]
router.get("/tax-rates", requireAuth, async (_req: AuthedRequest, res: Response) => {
  const rates = await prisma.taxRate.findMany({ orderBy: { jurisdiction: "asc" } });
  res.json(rates);
});

// POST /api/settings/tax-rates → create (SUPER_ADMIN)
router.post(
  "/tax-rates",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  async (req: AuthedRequest, res: Response) => {
    const b = req.body || {};
    if (!b.jurisdiction || !b.category || b.whtRate == null || b.vatRate == null) {
      return res.status(400).json({ error: "jurisdiction, category, whtRate, vatRate are required" });
    }
    const rate = await prisma.taxRate.create({
      data: {
        jurisdiction: b.jurisdiction,
        category: b.category,
        whtRate: b.whtRate,
        vatRate: b.vatRate,
        active: b.active ?? true,
      },
    });
    res.status(201).json(rate);
  }
);

// PATCH /api/settings/tax-rates/:id → update whtRate, vatRate, active (SUPER_ADMIN)
router.patch(
  "/tax-rates/:id",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  async (req: AuthedRequest, res: Response) => {
    const existing = await prisma.taxRate.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Tax rate not found" });

    const b = req.body || {};
    const data: any = {};
    if (b.jurisdiction !== undefined) data.jurisdiction = b.jurisdiction;
    if (b.category !== undefined) data.category = b.category;
    if (b.whtRate !== undefined) data.whtRate = b.whtRate;
    if (b.vatRate !== undefined) data.vatRate = b.vatRate;
    if (b.active !== undefined) data.active = b.active;

    const rate = await prisma.taxRate.update({ where: { id: req.params.id }, data });
    res.json(rate);
  }
);

// ── Categories ────────────────────────────────────────────────────────────────

// GET /api/settings/categories → Category[]
router.get("/categories", requireAuth, async (_req: AuthedRequest, res: Response) => {
  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
  res.json(categories);
});

// POST /api/settings/categories → create (SUPER_ADMIN)
router.post(
  "/categories",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  async (req: AuthedRequest, res: Response) => {
    const b = req.body || {};
    if (!b.name || !b.tier || !b.defaultPayModel) {
      return res.status(400).json({ error: "name, tier, defaultPayModel are required" });
    }
    if (!TIERS.includes(b.tier)) {
      return res.status(400).json({ error: `tier must be one of ${TIERS.join(", ")}` });
    }
    if (!PAY_MODELS.includes(b.defaultPayModel)) {
      return res.status(400).json({ error: `defaultPayModel must be one of ${PAY_MODELS.join(", ")}` });
    }
    const category = await prisma.category.create({
      data: {
        name: b.name,
        tier: b.tier,
        defaultPayModel: b.defaultPayModel,
        active: b.active ?? true,
      },
    });
    res.status(201).json(category);
  }
);

// PATCH /api/settings/categories/:id → update (SUPER_ADMIN)
router.patch(
  "/categories/:id",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  async (req: AuthedRequest, res: Response) => {
    const existing = await prisma.category.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Category not found" });

    const b = req.body || {};
    if (b.tier !== undefined && !TIERS.includes(b.tier)) {
      return res.status(400).json({ error: `tier must be one of ${TIERS.join(", ")}` });
    }
    if (b.defaultPayModel !== undefined && !PAY_MODELS.includes(b.defaultPayModel)) {
      return res.status(400).json({ error: `defaultPayModel must be one of ${PAY_MODELS.join(", ")}` });
    }
    const data: any = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.tier !== undefined) data.tier = b.tier;
    if (b.defaultPayModel !== undefined) data.defaultPayModel = b.defaultPayModel;
    if (b.active !== undefined) data.active = b.active;

    const category = await prisma.category.update({ where: { id: req.params.id }, data });
    res.json(category);
  }
);

// ── Templates (Setting key/value) ───────────────────────────────────────────────

// GET /api/settings/templates → {key,value}[]
router.get("/templates", requireAuth, async (_req: AuthedRequest, res: Response) => {
  const settings = await prisma.setting.findMany({ orderBy: { key: "asc" } });
  res.json(settings.map((s) => ({ key: s.key, value: s.value })));
});

// PUT /api/settings/templates/:key → body {value} (SUPER_ADMIN)
router.put(
  "/templates/:key",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  async (req: AuthedRequest, res: Response) => {
    const { value } = req.body || {};
    if (value === undefined) return res.status(400).json({ error: "value is required" });

    const setting = await prisma.setting.upsert({
      where: { key: req.params.key },
      update: { value: String(value) },
      create: { key: req.params.key, value: String(value) },
    });
    res.json({ key: setting.key, value: setting.value });
  }
);

export default router;
