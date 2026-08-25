/**
 * Server-side file type detection for uploads.
 *
 * The client-declared MIME type (File.type off multipart/form-data) is
 * attacker-controlled. The old check was `file.type.startsWith("image/")`,
 * which accepts `image/svg+xml` outright - and an SVG is a script-bearing XML
 * document. Whatever was accepted then had its declared type STORED and later
 * echoed back as the Content-Type of a response served from the API origin, so
 * a worker could upload a script that ran with the origin of the API, aimed
 * squarely at the admin session that approves payouts.
 *
 * So the declared type is treated as untrusted metadata: never stored, never
 * served, never trusted. The type is decided here from the actual bytes.
 */

export type AllowedMime = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

interface Signature {
  mime: AllowedMime;
  ext: string;
  /** Bytes that must match at `offset`. */
  magic: number[];
  offset: number;
  /** Extra predicate for formats whose magic alone is ambiguous. */
  extra?: (b: Uint8Array) => boolean;
}

const SIGNATURES: Signature[] = [
  // JPEG: FF D8 FF
  { mime: "image/jpeg", ext: ".jpg", magic: [0xff, 0xd8, 0xff], offset: 0 },
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  { mime: "image/png", ext: ".png", magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], offset: 0 },
  // WebP: "RIFF" .... "WEBP"
  {
    mime: "image/webp",
    ext: ".webp",
    magic: [0x52, 0x49, 0x46, 0x46],
    offset: 0,
    extra: (b) => b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
  // PDF: "%PDF-"
  { mime: "application/pdf", ext: ".pdf", magic: [0x25, 0x50, 0x44, 0x46, 0x2d], offset: 0 },
];

export interface SniffResult {
  mime: AllowedMime;
  ext: string;
}

/**
 * Identify a file from its leading bytes. Returns null when the bytes do not
 * match an allowed format - which is the only way to pass, so anything
 * unrecognised (including SVG, HTML and every other script-bearing format) is
 * rejected rather than stored.
 */
export function sniffFileType(bytes: Uint8Array): SniffResult | null {
  for (const sig of SIGNATURES) {
    if (bytes.length < sig.offset + sig.magic.length) continue;
    let ok = true;
    for (let i = 0; i < sig.magic.length; i++) {
      if (bytes[sig.offset + i] !== sig.magic[i]) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    if (sig.extra && !sig.extra(bytes)) continue;
    return { mime: sig.mime, ext: sig.ext };
  }
  return null;
}

/** Formats accepted for identity documents: images only, no PDF. */
export const IDENTITY_MIMES: AllowedMime[] = ["image/jpeg", "image/png", "image/webp"];

/** Formats accepted for supporting documents and CVs. */
export const DOCUMENT_MIMES: AllowedMime[] = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/** Re-validate at serve time, so a row written before this existed cannot be served as an arbitrary type. */
export function isAllowedMime(mime: string | null | undefined): mime is AllowedMime {
  return (
    mime === "image/jpeg" || mime === "image/png" || mime === "image/webp" || mime === "application/pdf"
  );
}
