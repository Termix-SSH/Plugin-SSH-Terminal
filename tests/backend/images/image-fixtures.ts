import jpeg from "jpeg-js";
import { PNG } from "pngjs";

export const RED = [255, 0, 0, 255];
export const BLUE = [0, 0, 255, 255];

/** RGBA pixels, the left half red and the right half blue. */
export function halves(width: number, height: number): Buffer {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data.set(x < width / 2 ? RED : BLUE, (y * width + x) * 4);
    }
  }
  return data;
}

export function pngImage(width: number, height: number, data: Buffer): Buffer {
  const png = new PNG({ width, height });
  data.copy(png.data);
  return PNG.sync.write(png);
}

/** A JPEG of `halves`, with an EXIF Orientation tag when one is given. */
export function jpegImage(
  width: number,
  height: number,
  orientation?: number,
): Buffer {
  const encoded = Buffer.from(
    jpeg.encode({ width, height, data: halves(width, height) }, 95).data,
  );
  if (orientation === undefined) return encoded;
  // Exif header, a big-endian TIFF header, and IFD0 with one SHORT entry.
  const tiff = Buffer.alloc(26);
  tiff.write("MM", 0, "latin1");
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4);
  tiff.writeUInt16BE(1, 8);
  tiff.writeUInt16BE(0x0112, 10);
  tiff.writeUInt16BE(3, 12);
  tiff.writeUInt32BE(1, 14);
  tiff.writeUInt16BE(orientation, 18);
  const body = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
  const app1 = Buffer.alloc(4);
  app1.writeUInt16BE(0xffe1, 0);
  app1.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([
    encoded.subarray(0, 2),
    app1,
    body,
    encoded.subarray(2),
  ]);
}

/** A PNG whose header claims a size, with no real pixels behind it. */
export function pngClaiming(width: number, height: number): Buffer {
  const png = pngImage(1, 1, Buffer.from(RED));
  png.writeUInt32BE(width, 16);
  png.writeUInt32BE(height, 20);
  return png;
}

/** A small JPEG whose frame header claims a size. */
export function jpegClaiming(
  width: number,
  height: number,
  orientation?: number,
): Buffer {
  const image = jpegImage(16, 16, orientation);
  const sof = image.indexOf(Buffer.from([0xff, 0xc0]));
  image.writeUInt16BE(height, sof + 5);
  image.writeUInt16BE(width, sof + 7);
  return image;
}

/**
 * A JPEG of random pixels, the same each time. As a PNG it takes about 3
 * bytes a pixel, far more than as a JPEG, like a photo.
 */
export function noisyJpeg(width: number, height: number): Buffer {
  const data = Buffer.alloc(width * height * 4, 255);
  let seed = 1;
  for (let i = 0; i < data.length; i++) {
    if (i % 4 === 3) continue;
    seed = (seed * 1103515245 + 12345) >>> 0;
    data[i] = seed >>> 24;
  }
  return Buffer.from(jpeg.encode({ width, height, data }, 90).data);
}

/** A 1x1 lossless WebP. */
export const WEBP_BYTES = Buffer.from(
  "UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==",
  "base64",
);

/** The RGBA pixel at (x, y) of a decoded image. */
export function pixelAt(
  image: { width: number; data: Uint8Array },
  x: number,
  y: number,
): number[] {
  const i = (y * image.width + x) * 4;
  return Array.from(image.data.subarray(i, i + 4));
}

/** Whether two RGBA pixels are within a JPEG's rounding of each other. */
export function closeTo(actual: number[], expected: number[]): boolean {
  return actual.every((value, i) => Math.abs(value - expected[i]!) <= 24);
}
