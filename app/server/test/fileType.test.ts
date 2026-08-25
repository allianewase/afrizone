import { describe, it, expect } from "vitest";
import { sniffFileType, isAllowedMime, IDENTITY_MIMES, DOCUMENT_MIMES } from "../src/util/fileType";

const bytes = (...b: number[]) => new Uint8Array(b);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00);
const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50);
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37);
const utf8 = (s: string) => new TextEncoder().encode(s);

/**
 * The upload path validated `file.type.startsWith("image/")` on the
 * CLIENT-DECLARED type, then stored that type and echoed it back as the
 * Content-Type of a same-origin response. `image/svg+xml` passes that check
 * and an SVG is a script-bearing XML document - so a worker could upload a
 * script that ran with the API's origin, aimed at the admin session that
 * approves payouts. Type is now decided from the bytes.
 */
describe("sniffFileType", () => {
  it("identifies the formats we accept", () => {
    expect(sniffFileType(JPEG)).toEqual({ mime: "image/jpeg", ext: ".jpg" });
    expect(sniffFileType(PNG)).toEqual({ mime: "image/png", ext: ".png" });
    expect(sniffFileType(WEBP)).toEqual({ mime: "image/webp", ext: ".webp" });
    expect(sniffFileType(PDF)).toEqual({ mime: "application/pdf", ext: ".pdf" });
  });

  // The actual attack.
  it("rejects an SVG however it is labelled", () => {
    const svg = utf8('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(sniffFileType(svg)).toBeNull();
  });

  it("rejects HTML, which browsers will happily execute", () => {
    expect(sniffFileType(utf8("<!DOCTYPE html><script>alert(1)</script>"))).toBeNull();
    expect(sniffFileType(utf8("<html><body>hi</body></html>"))).toBeNull();
  });

  it("rejects anything else unrecognised", () => {
    expect(sniffFileType(utf8("GIF89a"))).toBeNull(); // not on the allow-list
    expect(sniffFileType(bytes(0x00, 0x01, 0x02, 0x03))).toBeNull();
    expect(sniffFileType(new Uint8Array(0))).toBeNull();
    expect(sniffFileType(bytes(0xff))).toBeNull(); // truncated JPEG magic
  });

  it("is not fooled by a real signature appearing later in the file", () => {
    // Magic must be at the start, not merely present somewhere.
    expect(sniffFileType(bytes(0x3c, 0x73, 0x76, 0x67, 0xff, 0xd8, 0xff))).toBeNull();
  });

  it("requires WebP's second signature, not just the RIFF container", () => {
    // RIFF alone is also WAV/AVI - accepting it on the magic prefix alone
    // would let a non-image through as image/webp.
    expect(sniffFileType(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45))).toBeNull();
  });
});

describe("allow-lists", () => {
  it("keeps PDF off the identity-document path", () => {
    // A PDF "selfie" is not a thing, and this keeps the riskiest format away
    // from the highest-trust documents.
    expect(IDENTITY_MIMES).not.toContain("application/pdf");
    expect(DOCUMENT_MIMES).toContain("application/pdf");
  });

  it("isAllowedMime gates what may be served back as a Content-Type", () => {
    expect(isAllowedMime("image/jpeg")).toBe(true);
    expect(isAllowedMime("application/pdf")).toBe(true);
    // Rows written before uploads were sniffed may carry an attacker-chosen
    // type; serving must downgrade rather than echo it.
    expect(isAllowedMime("image/svg+xml")).toBe(false);
    expect(isAllowedMime("text/html")).toBe(false);
    expect(isAllowedMime(null)).toBe(false);
    expect(isAllowedMime(undefined)).toBe(false);
  });
});
