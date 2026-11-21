import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import {
  ImageNormalizeError,
  normalizeImage,
  orientPixels,
} from "../../../src/backend/images/image-normalize.js";
import {
  BLUE,
  closeTo,
  halves,
  jpegClaiming,
  jpegImage,
  pixelAt,
  pngClaiming,
  pngImage,
  RED,
  WEBP_BYTES,
} from "./image-fixtures.js";

function normalizeError(bytes: Buffer): ImageNormalizeError {
  try {
    normalizeImage(bytes);
  } catch (error) {
    if (error instanceof ImageNormalizeError) return error;
    throw error;
  }
  throw new Error("normalizeImage accepted the image");
}

describe("normalizeImage", () => {
  it("re-encodes a PNG as a PNG with the same pixels", () => {
    const pixels = halves(6, 4);
    pixels[3] = 128; // one see-through pixel, so alpha is kept
    const result = normalizeImage(pngImage(6, 4, pixels));
    expect(result.extension).toBe("png");
    const png = PNG.sync.read(result.data);
    expect([png.width, png.height]).toEqual([6, 4]);
    expect(png.data).toEqual(pixels);
  });

  it("turns a JPEG with EXIF orientation 6 upright", () => {
    // Stored 32x16, left half red: shown turned a quarter clockwise.
    const result = normalizeImage(jpegImage(32, 16, 6));
    expect(result.extension).toBe("png");
    const png = PNG.sync.read(result.data);
    expect([png.width, png.height]).toEqual([16, 32]);
    expect(closeTo(pixelAt(png, 8, 4), RED)).toBe(true);
    expect(closeTo(pixelAt(png, 8, 28), BLUE)).toBe(true);
  });

  it("leaves a JPEG without an orientation as it was taken", () => {
    const png = PNG.sync.read(normalizeImage(jpegImage(32, 16)).data);
    expect([png.width, png.height]).toEqual([32, 16]);
    expect(closeTo(pixelAt(png, 4, 8), RED)).toBe(true);
  });

  it("stores a WebP as it came", () => {
    expect(normalizeImage(WEBP_BYTES)).toEqual({
      data: WEBP_BYTES,
      extension: "webp",
    });
  });

  it("refuses a PNG over the pixel limit before decoding it", () => {
    const error = normalizeError(pngClaiming(8_000, 8_000));
    expect(error.code).toBe("IMAGE_DECODE_FAILED");
    expect(error.message).toBe("Image exceeds the pixel limit");
  });

  it("stores a JPEG over its pixel limit as it came, without decoding it", () => {
    // 16.8 MP, and 64 MP: over the PNG limit too.
    for (const [width, height] of [
      [4200, 4000],
      [8000, 8000],
    ]) {
      const jpeg = jpegClaiming(width!, height!, 6);
      expect(normalizeImage(jpeg)).toEqual({ data: jpeg, extension: "jpg" });
    }
  });

  it("keeps an image as it came when its PNG would be over the size limit", () => {
    const jpeg = jpegImage(32, 16, 6);
    expect(normalizeImage(jpeg, 64)).toEqual({ data: jpeg, extension: "jpg" });
    const png = pngImage(6, 4, halves(6, 4));
    expect(normalizeImage(png, 16)).toEqual({ data: png, extension: "png" });
  });

  it("doesn't decode an image that is over the size limit as it came", () => {
    // Broken after the header, so decoding them would fail.
    const png = pngImage(4, 4, halves(4, 4)).subarray(0, 40);
    expect(normalizeImage(png, 32)).toEqual({ data: png, extension: "png" });
    const full = jpegImage(16, 16);
    const jpeg = full.subarray(0, full.length - 200);
    expect(normalizeImage(jpeg, 64)).toEqual({ data: jpeg, extension: "jpg" });
  });

  it("refuses a file that is not an image it knows", () => {
    for (const bytes of [
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      Buffer.from("BM\0\0\0\0"),
      Buffer.alloc(0),
    ]) {
      expect(normalizeError(bytes).code).toBe("IMAGE_FORMAT_UNSUPPORTED");
    }
  });

  it("reports a broken PNG or JPEG as a decode failure", () => {
    const png = pngImage(4, 4, halves(4, 4));
    expect(normalizeError(png.subarray(0, 40)).code).toBe(
      "IMAGE_DECODE_FAILED",
    );
    const jpeg = jpegImage(16, 16);
    expect(normalizeError(jpeg.subarray(0, jpeg.length - 200)).code).toBe(
      "IMAGE_DECODE_FAILED",
    );
  });
});

describe("orientPixels", () => {
  // 3x2 pixels numbered 1 to 6, row by row, in the red channel.
  const source = {
    width: 3,
    height: 2,
    data: new Uint8Array([1, 2, 3, 4, 5, 6].flatMap((n) => [n, 0, 0, 255])),
  };
  const shown = (orientation: number) => {
    const out = orientPixels(source, orientation);
    const reds = Array.from(out.data.filter((_, i) => i % 4 === 0));
    return { size: [out.width, out.height], reds };
  };

  it("turns each EXIF orientation the way a viewer shows it", () => {
    expect(shown(1)).toEqual({ size: [3, 2], reds: [1, 2, 3, 4, 5, 6] });
    expect(shown(2)).toEqual({ size: [3, 2], reds: [3, 2, 1, 6, 5, 4] });
    expect(shown(3)).toEqual({ size: [3, 2], reds: [6, 5, 4, 3, 2, 1] });
    expect(shown(4)).toEqual({ size: [3, 2], reds: [4, 5, 6, 1, 2, 3] });
    expect(shown(5)).toEqual({ size: [2, 3], reds: [1, 4, 2, 5, 3, 6] });
    expect(shown(6)).toEqual({ size: [2, 3], reds: [4, 1, 5, 2, 6, 3] });
    expect(shown(7)).toEqual({ size: [2, 3], reds: [6, 3, 5, 2, 4, 1] });
    expect(shown(8)).toEqual({ size: [2, 3], reds: [3, 6, 2, 5, 1, 4] });
  });
});
