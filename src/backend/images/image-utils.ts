/**
 * The image types an upload can be, by extension. A PNG or JPEG is stored as
 * a PNG; the others are stored as they came, under their own extension.
 */
export const IMAGE_EXTENSIONS = [
  "png",
  "jpg",
  "gif",
  "webp",
  "avif",
  "heic",
  "heif",
  "tiff",
  "jp2",
  "j2k",
  "jxl",
] as const;

export type ImageExtension = (typeof IMAGE_EXTENSIONS)[number];

function startsWith(bytes: Uint8Array, offset: number, magic: number[]) {
  if (bytes.length < offset + magic.length) return false;
  return magic.every((byte, i) => bytes[offset + i] === byte);
}

function ascii(text: string): number[] {
  return Array.from(text, (char) => char.charCodeAt(0));
}

/** The brands of an ISO media file (AVIF, HEIF), from its ftyp box. */
function isoBrands(bytes: Uint8Array): string[] {
  if (!startsWith(bytes, 4, ascii("ftyp"))) return [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  // A real ftyp box is a few dozen bytes; don't walk a huge claimed one.
  const boxEnd = Math.min(view.getUint32(0), bytes.length, 1024);
  const brands: string[] = [];
  // The major brand, then the compatible brands after the minor version.
  for (let offset = 8; offset + 4 <= boxEnd; offset += offset === 8 ? 8 : 4) {
    brands.push(String.fromCharCode(...bytes.subarray(offset, offset + 4)));
  }
  return brands;
}

/**
 * What an upload is, from its first bytes, as the extension it is stored
 * under. The browser's MIME type and the file name are not trusted.
 */
export function imageExtensionForBytes(
  bytes: Uint8Array,
): ImageExtension | undefined {
  if (startsWith(bytes, 0, [0x89, ...ascii("PNG\r\n"), 0x1a, 0x0a])) {
    return "png";
  }
  if (startsWith(bytes, 0, [0xff, 0xd8, 0xff])) return "jpg";
  if (
    startsWith(bytes, 0, ascii("GIF87a")) ||
    startsWith(bytes, 0, ascii("GIF89a"))
  ) {
    return "gif";
  }
  if (
    startsWith(bytes, 0, ascii("RIFF")) &&
    startsWith(bytes, 8, ascii("WEBP"))
  ) {
    return "webp";
  }
  if (
    startsWith(bytes, 0, [0x49, 0x49, 0x2a, 0x00]) ||
    startsWith(bytes, 0, [0x4d, 0x4d, 0x00, 0x2a]) ||
    startsWith(bytes, 0, [0x49, 0x49, 0x2b, 0x00]) ||
    startsWith(bytes, 0, [0x4d, 0x4d, 0x00, 0x2b])
  ) {
    return "tiff";
  }
  if (startsWith(bytes, 0, [0, 0, 0, 0x0c, ...ascii("jP  \r\n"), 0x87, 0x0a])) {
    return "jp2";
  }
  if (startsWith(bytes, 0, [0xff, 0x4f, 0xff, 0x51])) return "j2k";
  if (
    startsWith(bytes, 0, [0xff, 0x0a]) ||
    startsWith(bytes, 0, [0, 0, 0, 0x0c, ...ascii("JXL \r\n"), 0x87, 0x0a])
  ) {
    return "jxl";
  }
  const brands = isoBrands(bytes);
  if (brands.some((brand) => brand === "avif" || brand === "avis")) {
    return "avif";
  }
  if (
    brands.some((brand) =>
      ["heic", "heix", "heim", "heis", "hevc", "hevx"].includes(brand),
    )
  ) {
    return "heic";
  }
  if (brands.some((brand) => brand === "mif1" || brand === "msf1")) {
    return "heif";
  }
  return undefined;
}

const MAX_NORMALIZED_IMAGE_BYTES = 10 * 1024 * 1024;

export function exceedsNormalizedImageSize(
  byteLength: number,
  maxBytes = MAX_NORMALIZED_IMAGE_BYTES,
): boolean {
  return byteLength > maxBytes;
}

export function createConcurrencyLimiter(
  limit: number,
  maxQueued = Number.POSITIVE_INFINITY,
): {
  acquire: () => Promise<() => void>;
  readonly active: number;
  readonly queued: number;
} {
  const max = Math.max(1, Math.floor(limit));
  const queueLimit = Math.max(0, Math.floor(maxQueued));
  let active = 0;
  const waiters: Array<() => void> = [];

  const startNext = () => {
    if (active >= max || waiters.length === 0) return;
    active += 1;
    waiters.shift()!();
  };

  return {
    acquire: () =>
      new Promise<() => void>((resolve, reject) => {
        if (active >= max && waiters.length >= queueLimit) {
          reject(new Error("Concurrency admission queue is full"));
          return;
        }
        waiters.push(() => {
          let released = false;
          resolve(() => {
            if (released) return;
            released = true;
            active -= 1;
            startNext();
          });
        });
        startNext();
      }),
    get active() {
      return active;
    },
    get queued() {
      return waiters.length;
    },
  };
}

const IMAGE_FILENAME_PATTERN = /^[0-9a-f-]{36}\.[a-z0-9]+$/i;

export function isImageFilename(filename: string): boolean {
  return IMAGE_FILENAME_PATTERN.test(filename);
}

export function isExpiredImage(
  modifiedAtMs: number,
  nowMs: number,
  ttlMs: number,
): boolean {
  if (ttlMs <= 0) return false;
  return nowMs - modifiedAtMs > ttlMs;
}

const UPLOAD_FILENAME_MAX_LENGTH = 100;
// A longer "extension" is part of the name, not a type to keep.
const UPLOAD_EXTENSION_MAX_LENGTH = 16;

/**
 * The name an uploaded file is stored under. It is typed into the terminal, so
 * it keeps only A-Z a-z 0-9 . _ - (anything else becomes `_`), loses leading
 * dots and dashes, and is cut to 100 characters with the extension kept.
 */
export function sanitizeUploadFilename(name: string): string {
  const safe = Array.from(name.normalize("NFC"), (char) =>
    /^[A-Za-z0-9._-]$/.test(char) ? char : "_",
  )
    .join("")
    .replace(/^[.-]+/, "");
  if (!safe) return "file";
  if (safe.length <= UPLOAD_FILENAME_MAX_LENGTH) return safe;
  const dot = safe.lastIndexOf(".");
  const extension = dot > 0 ? safe.slice(dot) : "";
  if (extension.length < 2 || extension.length > UPLOAD_EXTENSION_MAX_LENGTH) {
    return safe.slice(0, UPLOAD_FILENAME_MAX_LENGTH);
  }
  return (
    safe.slice(0, UPLOAD_FILENAME_MAX_LENGTH - extension.length) + extension
  );
}

export function exceedsImageStorageLimit(
  fileCount: number,
  totalBytes: number,
  incomingBytes: number,
  maxFileCount: number,
  maxStorageBytes: number,
): boolean {
  return (
    fileCount >= maxFileCount || totalBytes + incomingBytes > maxStorageBytes
  );
}
