import { Router, Response as ExpressResponse } from "express";
import { prisma } from "../prisma";
import { requireAuth, AuthedRequest, verifyToken, isAdmin } from "../auth";
import { uploadToR2, resolveUrl, getFileStream } from "../services/storage";

const DOC_TYPES = ["ID", "SELFIE", "DOCS"] as const;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const router = Router();

// GET /api/me/kyc/documents: list the worker's uploaded documents.
router.get("/", requireAuth, async (req: AuthedRequest, res: ExpressResponse) => {
  const docs = await prisma.kycDocument.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "desc" },
  });
  res.json(
    docs.map((d) => ({
      id: d.id,
      docType: d.docType,
      filename: d.filename,
      url: resolveUrl(d.filename),
      createdAt: d.createdAt,
    }))
  );
});

// GET /api/me/kyc/documents/file/:filename is handled OUTSIDE this Express
// router entirely (see handleKycFileGet below + index.ts), for the same
// reason POST is: `file.body` off the R2 binding is a WHATWG ReadableStream,
// and Express's `res` (as adapted by httpServerHandler) is a Node stream,
// not a WHATWG WritableStream - `file.body.pipeTo(res)` doesn't throw, it
// just hangs forever (Node streams don't implement the Web Streams sink
// interface `pipeTo` writes to), until Workers' own hang-detection kills the
// request. Returning a raw `Response(file.body, ...)` from the top-level
// fetch handler sidesteps the Node/Web stream boundary entirely.

// POST /api/me/kyc/documents is handled OUTSIDE this Express router entirely
// (see handleKycUpload below + index.ts) - Workers' Request.formData() is
// used instead of multer, since multer's multipart parsing depends on
// Node-stream/busboy internals whose behaviour under httpServerHandler's
// Node-request adaptation isn't something Cloudflare documents as supported
// (their own file-upload examples always use request.formData(), never
// multer). The interception happens before Express ever sees the request,
// so this router only ever handles GET here.

/**
 * POST /api/me/kyc/documents: upload a KYC document image.
 * multipart/form-data: field `docType` (ID | SELFIE | DOCS) + file field `file`.
 * Called directly from index.ts's top-level fetch handler, before Express -
 * so auth (normally the `requireAuth` middleware) is re-implemented inline
 * here rather than reused, since there's no Express `req`/`res` at this point.
 */
export async function handleKycUpload(request: Request): Promise<Response> {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  let payload: ReturnType<typeof verifyToken>;
  try {
    if (!token) throw new Error("Missing token");
    payload = verifyToken(token);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid form data" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const docType = form.get("docType");
  if (typeof docType !== "string" || !DOC_TYPES.includes(docType as (typeof DOC_TYPES)[number])) {
    return new Response(JSON.stringify({ error: "docType must be ID, SELFIE, or DOCS" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return new Response(JSON.stringify({ error: "No file uploaded" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!file.type.startsWith("image/")) {
    return new Response(JSON.stringify({ error: "Only image files are accepted" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (file.size > MAX_FILE_SIZE) {
    return new Response(JSON.stringify({ error: "File too large (max 10 MB)" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const ext = (file.name.match(/\.[^.]+$/) || [".jpg"])[0];
  const filename = `${payload.sub}-${Date.now()}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  await uploadToR2(buffer, filename, file.type);

  const doc = await prisma.kycDocument.create({
    data: {
      userId: payload.sub,
      docType,
      filename,
      originalName: file.name,
      mimeType: file.type,
      path: `r2://kyc/${filename}`,
    },
  });

  return new Response(
    JSON.stringify({
      id: doc.id,
      docType: doc.docType,
      filename: doc.filename,
      url: resolveUrl(doc.filename),
      createdAt: doc.createdAt,
    }),
    { status: 201, headers: { "Content-Type": "application/json" } }
  );
}

/**
 * Who may read a stored KYC document. ALLOW-BY-LIST: it enumerates the two
 * cases that GRANT access and refuses everything else, including role values
 * this file has never heard of.
 *
 * It replaces `if (!owns && payload.role === "WORKER")`, which enumerated the
 * one role it wanted to DENY and therefore granted every other role. That was
 * safe only by accident, because WORKER happened to be the sole non-admin
 * entry in ROLES. Adding one role there - COURIER is on the roadmap - would
 * silently have handed every holder of it read access to every worker's
 * government ID and selfie.
 *
 * Exported so the "unknown role is denied" property can be tested directly: it
 * cannot be exercised over HTTP, because verifyToken rejects any role that is
 * not already in ROLES.
 */
export function canReadKycDocument(
  requester: { sub: string; role?: string | null },
  doc: { userId: string } | null | undefined
): boolean {
  if (!doc) return false; // no row -> nothing to authorise
  if (doc.userId === requester.sub) return true; // the owner
  return isAdmin(requester.role); // ADMIN_ROLES only
}

/**
 * GET /api/me/kyc/documents/file/:filename: stream a document's bytes back,
 * after checking the requester owns it (admins may view any worker's).
 * Replaces the old express.static /uploads mount, which served local-disk
 * files with no auth check at all - this is a strictly narrower access
 * model, not just a storage-backend swap. Called directly from index.ts's
 * top-level fetch handler; see the note above for why this bypasses Express.
 */
export async function handleKycFileGet(request: Request, filename: string): Promise<Response> {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  let payload: ReturnType<typeof verifyToken>;
  try {
    if (!token) throw new Error("Missing token");
    payload = verifyToken(token);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Resolve the row FIRST, then authorise against it. Two changes from the old
  // `!owns && role === "WORKER"` form:
  //
  //  - The lookup is by filename alone, so a document with NO backing row can
  //    no longer be streamed. Previously the query was scoped to the caller,
  //    was consulted only as a deny signal, and an admin-role token therefore
  //    reached the R2 read for any caller-supplied key - including objects
  //    under the kyc/ prefix that no KycDocument row points at.
  //  - The decision is allow-by-list, so an unrecognised role is refused
  //    rather than granted.
  //
  // filename is not unique in the schema, hence findFirst.
  const doc = await prisma.kycDocument.findFirst({ where: { filename } });
  if (!canReadKycDocument(payload, doc)) {
    // 404 rather than 403: a 403 would confirm the document exists to someone
    // not entitled to know that.
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const file = await getFileStream(filename);
  if (!file) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(file.body, {
    status: 200,
    headers: { "Content-Type": file.contentType || "application/octet-stream" },
  });
}

export default router;
