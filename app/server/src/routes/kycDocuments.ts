import { Router, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { prisma } from "../prisma";
import { requireAuth, AuthedRequest } from "../auth";

const UPLOAD_DIR = path.join(__dirname, "../../uploads/kyc");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const DOC_TYPES = ["ID", "SELFIE", "DOCS"] as const;

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `${(req as AuthedRequest).user!.id}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter(_req, file, cb) {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are accepted"));
    }
  },
});

const router = Router();

// POST /api/me/kyc/documents — upload a KYC document image.
// multipart/form-data: field `docType` (ID | SELFIE | DOCS) + file field `file`.
router.post(
  "/",
  requireAuth,
  upload.single("file"),
  async (req: AuthedRequest, res: Response) => {
    const { docType } = req.body || {};

    if (!docType || !DOC_TYPES.includes(docType)) {
      return res.status(400).json({ error: "docType must be ID, SELFIE, or DOCS" });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const doc = await prisma.kycDocument.create({
      data: {
        userId: req.user!.id,
        docType,
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        path: req.file.path,
      },
    });

    res.status(201).json({
      id: doc.id,
      docType: doc.docType,
      filename: doc.filename,
      createdAt: doc.createdAt,
    });
  }
);

// GET /api/me/kyc/documents — list the worker's uploaded documents.
router.get("/", requireAuth, async (req: AuthedRequest, res: Response) => {
  const docs = await prisma.kycDocument.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "desc" },
  });
  res.json(
    docs.map((d) => ({
      id: d.id,
      docType: d.docType,
      filename: d.filename,
      createdAt: d.createdAt,
    }))
  );
});

export default router;
