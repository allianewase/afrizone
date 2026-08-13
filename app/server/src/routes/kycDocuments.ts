import { Router, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { prisma } from "../prisma";
import { requireAuth, AuthedRequest } from "../auth";
import {
  isS3Mode,
  uploadToS3,
  getLocalUrl,
  ensureLocalUploadDir,
} from "../services/storage";

ensureLocalUploadDir();

const DOC_TYPES = ["ID", "SELFIE", "DOCS"] as const;

// Use memory storage in S3 mode (buffer needed for upload); disk storage otherwise.
const upload = multer({
  storage: isS3Mode
    ? multer.memoryStorage()
    : multer.diskStorage({
        destination(_req, _file, cb) {
          const dir = path.join(__dirname, "../../uploads/kyc");
          fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename(req, file, cb) {
          const ext = path.extname(file.originalname) || ".jpg";
          cb(null, `${(req as AuthedRequest).user!.id}-${Date.now()}${ext}`);
        },
      }),
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

// POST /api/me/kyc/documents: upload a KYC document image.
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

    const ext = path.extname(req.file.originalname) || ".jpg";
    const filename = `${req.user!.id}-${Date.now()}${ext}`;

    if (isS3Mode) {
      // Memory storage: upload buffer to S3.
      await uploadToS3(req.file.buffer, filename, req.file.mimetype);
    }
    // In disk mode, multer already wrote the file; filename comes from req.file.filename.
    const storedFilename = isS3Mode ? filename : req.file.filename;

    const doc = await prisma.kycDocument.create({
      data: {
        userId: req.user!.id,
        docType,
        filename: storedFilename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        // In S3 mode there is no local path; store the S3 key instead for reference.
        path: isS3Mode ? `s3://${process.env.S3_BUCKET}/kyc/${storedFilename}` : req.file.path,
      },
    });

    res.status(201).json({
      id: doc.id,
      docType: doc.docType,
      filename: doc.filename,
      url: getLocalUrl(doc.filename), // mobile uses this; S3 admins get signed URLs via workers route
      createdAt: doc.createdAt,
    });
  }
);

// GET /api/me/kyc/documents: list the worker's uploaded documents.
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
      url: getLocalUrl(d.filename),
      createdAt: d.createdAt,
    }))
  );
});

export default router;
