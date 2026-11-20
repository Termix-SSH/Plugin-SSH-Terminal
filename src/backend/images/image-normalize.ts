import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import {
  exceedsNormalizedImageSize,
  imageExtensionForBytes,
  type ImageExtension,
} from "./image-utils.js";

/** Most pixels decoded from a PNG, checked from the header first. */
export const MAX_PNG_INPUT_PIXELS = 40_000_000;

/**
 * Most pixels decoded from a JPEG; a larger one is stored as it came. jpeg-js
 * keeps every 8x8 block as its own array on the JS heap, about 10 MB per
 * megapixel for a 4:4:4 JPEG, and running out of the plugin's heap (256 MB)
 * ends the process with every terminal in it.
 */
export const MAX_JPEG_INPUT_PIXELS = 16_000_000;

export class ImageNormalizeError extends Error {
  constructor(
    readonly code: "IMAGE_FORMAT_UNSUPPORTED" | "IMAGE_DECODE_FAILED",
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ImageNormalizeError";
  }
}

export interface NormalizedImage {
  data: Buffer;
  extension: ImageExtension;
}

interface HeaderInfo {
  width: number;
  height: number;
  /** EXIF orientation, 1 to 8. */
  orientation: number;
}

interface Pixels {
  width: number;
  height: number;
  /** RGBA, 8 bits per channel. */
  data: Uint8Array;
}

/** Width and height from a PNG's IHDR. */
function pngInfo(bytes: Buffer): HeaderInfo | null {
  if (bytes.length < 24 || bytes.toString("latin1", 12, 16) !== "IHDR") {
    return null;
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    orientation: 1,
  };
}

/** The EXIF orientation (1 to 8) in a TIFF-structured EXIF block. */
function exifOrientation(tiff: Buffer): number {
  if (tiff.length < 8) return 1;
  const order = tiff.toString("latin1", 0, 2);
  if (order !== "II" && order !== "MM") return 1;
  const little = order === "II";
  const u16 = (at: number) =>
    little ? tiff.readUInt16LE(at) : tiff.readUInt16BE(at);
  const u32 = (at: number) =>
    little ? tiff.readUInt32LE(at) : tiff.readUInt32BE(at);
  if (u16(2) !== 42) return 1;
  const ifd = u32(4);
  if (ifd + 2 > tiff.length) return 1;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > tiff.length) return 1;
    // Tag 0x0112 is Orientation, a SHORT kept in the entry itself.
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 2) === 3 ? u16(entry + 8) : 1;
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}

/** Size and EXIF orientation from a JPEG's segments before the image data. */
function jpegInfo(bytes: Buffer): HeaderInfo | null {
  let orientation = 1;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1]!;
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = bytes.readUInt16BE(offset + 2);
    const end = offset + 2 + length;
    if (length < 2 || end > bytes.length) return null;
    const segment = bytes.subarray(offset + 4, end);
    if (marker === 0xe1 && segment.toString("latin1", 0, 6) === "Exif\0\0") {
      orientation = exifOrientation(segment.subarray(6));
    }
    // SOF0 to SOF15; C4, C8 and CC are other markers in the same range.
    const isFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isFrame) {
      if (segment.length < 5) return null;
      return {
        height: segment.readUInt16BE(1),
        width: segment.readUInt16BE(3),
        orientation,
      };
    }
    offset = end;
  }
  return null;
}

/**
 * Turns RGBA pixels upright for an EXIF orientation, as a viewer would show
 * them. 5 to 8 swap the width and height.
 */
export function orientPixels(image: Pixels, orientation: number): Pixels {
  if (orientation < 2 || orientation > 8) return image;
  const { width: w, height: h } = image;
  const aligned =
    image.data.byteOffset % 4 === 0 ? image.data : image.data.slice();
  const source = new Uint32Array(aligned.buffer, aligned.byteOffset, w * h);
  const swap = orientation >= 5;
  const outWidth = swap ? h : w;
  const outHeight = swap ? w : h;
  // Output pixel (x, y) comes from source pixel base + x * dx + y * dy.
  const [base, dx, dy] = {
    2: [w - 1, -1, w],
    3: [w * h - 1, -1, -w],
    4: [w * (h - 1), 1, -w],
    5: [0, w, 1],
    6: [w * (h - 1), -w, 1],
    7: [w * h - 1, -w, -1],
    8: [w - 1, w, -1],
  }[orientation]!;
  const out = new Uint32Array(w * h);
  let i = 0;
  for (let y = 0; y < outHeight; y++) {
    let from = base + y * dy;
    for (let x = 0; x < outWidth; x++) {
      out[i++] = source[from]!;
      from += dx;
    }
  }
  return {
    width: outWidth,
    height: outHeight,
    data: new Uint8Array(out.buffer),
  };
}

function isOpaque(data: Uint8Array): boolean {
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) return false;
  }
  return true;
}

/** Size and orientation from the header, before anything is decoded. */
function headerInfo(bytes: Buffer, extension: "png" | "jpg"): HeaderInfo {
  const info = extension === "png" ? pngInfo(bytes) : jpegInfo(bytes);
  if (!info?.width || !info.height) {
    throw new ImageNormalizeError(
      "IMAGE_DECODE_FAILED",
      "Image size not found",
    );
  }
  return info;
}

function decode(
  bytes: Buffer,
  extension: "png" | "jpg",
  orientation: number,
): Pixels {
  try {
    if (extension === "png") {
      const png = PNG.sync.read(bytes, { checkCRC: true });
      return { width: png.width, height: png.height, data: png.data };
    }
    const image = jpeg.decode(bytes, {
      useTArray: true,
      formatAsRGBA: true,
      maxResolutionInMP: MAX_JPEG_INPUT_PIXELS / 1_000_000,
    });
    return orientPixels(image, orientation);
  } catch (error) {
    throw new ImageNormalizeError(
      "IMAGE_DECODE_FAILED",
      error instanceof Error ? error.message : String(error),
      error,
    );
  }
}

/**
 * Turns a PNG or JPEG upload into an upright PNG without its metadata, in
 * plain JavaScript (plugins can't load native modules). Other image formats,
 * a JPEG over its pixel limit, and an image whose PNG would be over the size
 * limit are kept as they came, under the extension their first bytes give.
 */
export function normalizeImage(
  bytes: Buffer,
  maxBytes?: number,
): NormalizedImage {
  const extension = imageExtensionForBytes(bytes);
  if (!extension) {
    throw new ImageNormalizeError(
      "IMAGE_FORMAT_UNSUPPORTED",
      "Unsupported image format",
    );
  }
  if (extension !== "png" && extension !== "jpg") {
    return { data: bytes, extension };
  }
  const { width, height, orientation } = headerInfo(bytes, extension);
  if (extension === "jpg" && width * height > MAX_JPEG_INPUT_PIXELS) {
    return { data: bytes, extension };
  }
  if (width * height > MAX_PNG_INPUT_PIXELS) {
    throw new ImageNormalizeError(
      "IMAGE_DECODE_FAILED",
      "Image exceeds the pixel limit",
    );
  }
  const image = decode(bytes, extension, orientation);
  // Sized after construction, so PNG doesn't allocate a second pixel buffer.
  const png = new PNG();
  png.width = image.width;
  png.height = image.height;
  png.data = Buffer.from(
    image.data.buffer,
    image.data.byteOffset,
    image.data.length,
  );
  const data = PNG.sync.write(png, {
    colorType: isOpaque(image.data) ? 2 : 6,
  });
  // A photo is often far bigger as a PNG than as a JPEG.
  if (exceedsNormalizedImageSize(data.length, maxBytes)) {
    return { data: bytes, extension };
  }
  return { data, extension: "png" };
}
