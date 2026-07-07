/**
 * Dual-mode file storage.
 *
 * LOCAL mode (default / dev):  files written to server/uploads/kyc/ on disk,
 *                              served via express.static on /uploads.
 * S3 mode (production):       files uploaded to S3; access via presigned URLs.
 *
 * To enable S3, set in .env:
 *   S3_BUCKET=afrizone-kyc-docs
 *   S3_REGION=us-east-1          (default: us-east-1)
 *   AWS_ACCESS_KEY_ID=...
 *   AWS_SECRET_ACCESS_KEY=...
 *   S3_SIGNED_URL_EXPIRES=3600   (default: 3600 seconds = 1 hour)
 */

import fs from "fs";
import path from "path";

export const S3_BUCKET = process.env.S3_BUCKET?.trim() || "";
export const isS3Mode = !!S3_BUCKET;

const LOCAL_UPLOAD_DIR = path.join(__dirname, "../../uploads/kyc");

// Lazily-initialised S3 client — only imported when S3 is actually configured
// so the AWS SDK has zero overhead in local-disk mode.
let _s3: import("@aws-sdk/client-s3").S3Client | null = null;

async function getS3(): Promise<import("@aws-sdk/client-s3").S3Client> {
  if (!_s3) {
    const { S3Client } = await import("@aws-sdk/client-s3");
    _s3 = new S3Client({ region: process.env.S3_REGION || "us-east-1" });
  }
  return _s3;
}

/** Upload a buffer to S3. Key format: kyc/<filename>. */
export async function uploadToS3(
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<void> {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const s3 = await getS3();
  await s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: `kyc/${filename}`,
      Body: buffer,
      ContentType: contentType,
    })
  );
}

/**
 * Return a presigned GET URL for an S3 object, valid for S3_SIGNED_URL_EXPIRES
 * seconds (default 3600 = 1 hour).
 */
export async function getSignedUrl(filename: string): Promise<string> {
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl: sign } = await import("@aws-sdk/s3-request-presigner");
  const s3 = await getS3();
  const expiresIn = Number(process.env.S3_SIGNED_URL_EXPIRES) || 3600;
  return sign(s3, new GetObjectCommand({ Bucket: S3_BUCKET, Key: `kyc/${filename}` }), {
    expiresIn,
  });
}

/** Return the local /uploads/kyc/<filename> path. */
export function getLocalUrl(filename: string): string {
  return `/uploads/kyc/${filename}`;
}

/**
 * Ensure the local upload directory exists (no-op in S3 mode).
 * Call once at startup.
 */
export function ensureLocalUploadDir(): void {
  if (!isS3Mode) {
    fs.mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true });
  }
}

/** Resolve the URL for a stored document (S3 presigned or local path). */
export async function resolveUrl(filename: string): Promise<string> {
  return isS3Mode ? getSignedUrl(filename) : getLocalUrl(filename);
}

/** Read a stored document's bytes back out (local disk or S3), for server-side processing. */
export async function getFileBuffer(filename: string): Promise<Buffer> {
  if (!isS3Mode) {
    return fs.readFileSync(path.join(LOCAL_UPLOAD_DIR, filename));
  }
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const s3 = await getS3();
  const obj = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: `kyc/${filename}` }));
  const chunks: Buffer[] = [];
  for await (const chunk of obj.Body as AsyncIterable<Buffer>) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}
