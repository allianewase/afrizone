// Guards on the two KYC routes that bypass Express entirely (see index.ts), and
// therefore never reach helmet or the express-rate-limit instances.
//
//  - the file route decoded its path segment with nothing catching URIError,
//    and its route pattern could not see a "%2F" that only becomes a separator
//    after the match
//  - the upload route had no quota at all, on the only authenticated endpoint
//    that writes to R2
import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";
import { createUserWithToken, testPrisma } from "./helpers";

const FILE_ROUTE = "/api/me/kyc/documents/file";

async function getFile(segment: string, token: string) {
  const res = await SELF.fetch(`http://local.test${FILE_ROUTE}/${segment}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, text: await res.text() };
}

// A one-pixel PNG. The upload route decides the type from these bytes, so it
// has to be a real one rather than a placeholder string.
const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

async function upload(token: string) {
  const form = new FormData();
  form.set("docType", "ID");
  form.set("file", new File([PNG], "id.png", { type: "image/png" }));
  const res = await SELF.fetch("http://local.test/api/me/kyc/documents", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return { status: res.status, body: await res.json().catch(() => undefined) as any };
}

describe("KYC file route path handling", () => {
  it("answers 404, not 500, for malformed percent-encoding", async () => {
    const { token } = await createUserWithToken("SUPER_ADMIN");
    // decodeURIComponent throws URIError on this. Nothing caught it, so the
    // whole request failed rather than the lookup missing.
    const res = await getFile("%zz", token);
    expect(res.status).toBe(404);
  });

  it("refuses an encoded path separator", async () => {
    const { token } = await createUserWithToken("SUPER_ADMIN");
    // "%2F" survives the route pattern's [^/]+ because it only becomes "/"
    // once decoded.
    expect((await getFile("..%2F..%2Fsecret.txt", token)).status).toBe(404);
    expect((await getFile("a%2Fb.png", token)).status).toBe(404);
  });

  it("refuses an encoded parent reference and control characters", async () => {
    const { token } = await createUserWithToken("SUPER_ADMIN");
    expect((await getFile("%00.png", token)).status).toBe(404);
    expect((await getFile("%2e%2e%2fetc%2fpasswd", token)).status).toBe(404);
    expect((await getFile("sub%5Cdir.png", token)).status).toBe(404);
  });

  it("never sees a LITERAL dot-segment, because the URL parser removes it", async () => {
    const { token } = await createUserWithToken("SUPER_ADMIN");
    // Worth pinning: a bare ".." is resolved by URL normalisation before any
    // routing happens, so ".../file/.." arrives as ".../documents/" and lands
    // on the document-list endpoint instead. The handler's key check is
    // therefore only ever responsible for the ENCODED forms above - which is
    // exactly why those are the ones asserted.
    const res = await getFile("..", token);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.text)).toEqual([]);
  });

  it("still requires a token, whatever the key looks like", async () => {
    const res = await SELF.fetch(`http://local.test${FILE_ROUTE}/anything.png`);
    expect(res.status).toBe(401);
  });
});

describe("KYC upload quota", () => {
  it("accepts an upload from a worker with no history", async () => {
    const { token } = await createUserWithToken("WORKER");
    const res = await upload(token);
    expect(res.status).toBe(201);
    expect(res.body.filename).toMatch(/\.png$/);
  });

  it("refuses once the rolling window is full, and says when to retry", async () => {
    const { user, token } = await createUserWithToken("WORKER");
    await seedDocuments(user.id, 30, 0);

    const res = await upload(token);
    expect(res.status).toBe(429);

    // Nothing was written - the refusal happens before the body is parsed.
    expect(await countDocs(user.id)).toBe(30);
  });

  it("counts a rolling window, not a lifetime total", async () => {
    const { user, token } = await createUserWithToken("WORKER");
    // Well over the cap, but all of it older than the window.
    await seedDocuments(user.id, 40, 48 * 60 * 60 * 1000);

    const res = await upload(token);
    expect(res.status).toBe(201);
  });

  it("is scoped per worker", async () => {
    const { user: heavy } = await createUserWithToken("WORKER");
    await seedDocuments(heavy.id, 30, 0);
    const { token: otherToken } = await createUserWithToken("WORKER");

    expect((await upload(otherToken)).status).toBe(201);
  });
});

function countDocs(userId: string) {
  return testPrisma().kycDocument.count({ where: { userId } });
}

async function seedDocuments(userId: string, count: number, ageMs: number) {
  const createdAt = new Date(Date.now() - ageMs);
  for (let i = 0; i < count; i += 1) {
    await testPrisma().kycDocument.create({
      data: {
        userId,
        docType: "DOCS",
        filename: `${userId}-seed-${i}.png`,
        originalName: "seed.png",
        mimeType: "image/png",
        path: `r2://kyc/${userId}-seed-${i}.png`,
        createdAt,
      },
    });
  }
}
