import { describe, expect, it } from "vitest";
import {
  exceedsImageStorageLimit,
  exceedsNormalizedImageSize,
  imageExtensionForBytes,
  createConcurrencyLimiter,
  isExpiredImage,
  isImageFilename,
  sanitizeUploadFilename,
} from "../../../src/backend/images/image-utils.js";

describe("terminal image utilities", () => {
  it("accepts UUID-based image filenames", () => {
    expect(isImageFilename("b797234d-eb5d-4b1b-b7f3-17c26f257506.jpeg")).toBe(
      true,
    );
  });

  it("rejects unsafe or unrelated filenames", () => {
    expect(isImageFilename("../secrets.txt")).toBe(false);
    expect(isImageFilename("not-an-image.jpeg")).toBe(false);
    expect(isImageFilename("b797234d-eb5d-4b1b-b7f3-17c26f257506")).toBe(false);
  });

  it("tells an image's type from its first bytes", () => {
    const bytes = (...parts: Array<string | number[]>) =>
      Buffer.concat(
        parts.map((part) =>
          typeof part === "string"
            ? Buffer.from(part, "latin1")
            : Buffer.from(part),
        ),
      );
    // An ftyp box: size, "ftyp", major brand, minor version, compatible brands.
    const ftyp = (...brands: string[]) => {
      const box = bytes([0, 0, 0, 0], "ftyp", brands[0]!, [0, 0, 0, 0]);
      const all = Buffer.concat([box, bytes(...brands.slice(1))]);
      all.writeUInt32BE(all.length, 0);
      return all;
    };
    const cases: Array<[Buffer, string | undefined]> = [
      [bytes([0x89], "PNG\r\n", [0x1a, 0x0a]), "png"],
      [bytes([0xff, 0xd8, 0xff, 0xe0]), "jpg"],
      [bytes("GIF89a"), "gif"],
      [bytes("RIFF", [1, 0, 0, 0], "WEBPVP8L"), "webp"],
      [bytes("II*", [0]), "tiff"],
      [bytes("MM", [0, 0x2a]), "tiff"],
      [bytes([0, 0, 0, 0x0c], "jP  \r\n", [0x87, 0x0a]), "jp2"],
      [bytes([0xff, 0x0a]), "jxl"],
      [ftyp("avif", "mif1", "miaf"), "avif"],
      [ftyp("mif1", "mif1", "avif"), "avif"],
      [ftyp("heic", "mif1", "heic"), "heic"],
      [ftyp("mif1", "mif1"), "heif"],
      [ftyp("isom", "isom", "mp41"), undefined],
      [bytes("<svg xmlns='http://www.w3.org/2000/svg'/>"), undefined],
      [bytes("BM"), undefined],
      [bytes("RIFF", [1, 0, 0, 0], "WAVE"), undefined],
      [Buffer.alloc(0), undefined],
    ];
    for (const [input, extension] of cases) {
      expect(imageExtensionForBytes(input)).toBe(extension);
    }
  });

  it("rejects normalized output beyond the byte ceiling", () => {
    expect(exceedsNormalizedImageSize(10_000_001, 10_000_000)).toBe(true);
    expect(exceedsNormalizedImageSize(10_000_000, 10_000_000)).toBe(false);
  });
  it("expires files older than the configured TTL", () => {
    expect(isExpiredImage(1_000, 3_000, 1_000)).toBe(true);
    expect(isExpiredImage(2_500, 3_000, 1_000)).toBe(false);
  });

  it("treats a zero TTL as retention disabled", () => {
    expect(isExpiredImage(1_000, 999_999, 0)).toBe(false);
  });

  it("bounds the admission queue", async () => {
    const limiter = createConcurrencyLimiter(1, 0);
    const release = await limiter.acquire();
    await expect(limiter.acquire()).rejects.toThrow("queue is full");
    release();
  });

  it("rejects uploads that exceed the count or byte limit", () => {
    expect(exceedsImageStorageLimit(100, 10, 1, 100, 1000)).toBe(true);
    expect(exceedsImageStorageLimit(1, 900, 101, 100, 1000)).toBe(true);
    expect(exceedsImageStorageLimit(1, 900, 100, 100, 1000)).toBe(false);
  });

  it("bounds concurrent work", async () => {
    const limiter = createConcurrencyLimiter(1);
    let active = 0;
    let peak = 0;
    const task = async () => {
      const release = await limiter.acquire();
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      release();
    };

    await Promise.all([task(), task(), task()]);

    expect(peak).toBe(1);
    expect(limiter.active).toBe(0);
  });
});

describe("sanitizeUploadFilename", () => {
  // What the maintainers asked for: only these characters, never a leading
  // dot or dash, at most 100 characters.
  const SAFE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,99}$/;

  it("keeps a name that is already safe", () => {
    expect(sanitizeUploadFilename("report-2026_v2.pdf")).toBe(
      "report-2026_v2.pdf",
    );
  });

  it("changes every other character to an underscore", () => {
    expect(sanitizeUploadFilename("Q3 report (final).pdf")).toBe(
      "Q3_report__final_.pdf",
    );
    expect(sanitizeUploadFilename("a'b\"c`d$e;f|g&h*i?j.txt")).toBe(
      "a_b_c_d_e_f_g_h_i_j.txt",
    );
  });

  it("never keeps a newline or other control character", () => {
    expect(sanitizeUploadFilename("notes\nrm -rf ~\r\t\u0000.md")).toBe(
      "notes_rm_-rf_____.md",
    );
  });

  it("never keeps a path separator", () => {
    expect(sanitizeUploadFilename("../../etc/passwd")).toBe("_.._etc_passwd");
    expect(sanitizeUploadFilename("C:\\Windows\\win.ini")).toBe(
      "C__Windows_win.ini",
    );
  });

  it("turns one accented, CJK or emoji character into one underscore", () => {
    expect(sanitizeUploadFilename("résumé 简历.pdf")).toBe("r_sum____.pdf");
    expect(sanitizeUploadFilename("re\u0301sume\u0301.pdf")).toBe("r_sum_.pdf");
    expect(sanitizeUploadFilename("📄.txt")).toBe("_.txt");
  });

  it("strips leading dots and dashes", () => {
    expect(sanitizeUploadFilename(".env")).toBe("env");
    expect(sanitizeUploadFilename("--help.txt")).toBe("help.txt");
    expect(sanitizeUploadFilename("-.-.x")).toBe("x");
  });

  it("falls back to file when nothing is left", () => {
    expect(sanitizeUploadFilename("")).toBe("file");
    expect(sanitizeUploadFilename("...")).toBe("file");
    expect(sanitizeUploadFilename("-")).toBe("file");
  });

  it("cuts a long name to 100 characters and keeps the extension", () => {
    const name = sanitizeUploadFilename(`${"a".repeat(150)}.tar.gz`);
    expect(name).toBe(`${"a".repeat(97)}.gz`);
    expect(name).toHaveLength(100);
  });

  it("cuts a long name with no real extension to 100 characters", () => {
    expect(sanitizeUploadFilename("a".repeat(120))).toBe("a".repeat(100));
    expect(
      sanitizeUploadFilename(`${"a".repeat(50)}.${"b".repeat(80)}`),
    ).toHaveLength(100);
  });

  it("always returns a safe name", () => {
    const names = [
      "",
      ".",
      "..",
      "-n",
      " leading space",
      "\u202Eexe.txt",
      "$(curl evil)",
      "a\nb",
      "😀".repeat(200),
      `.${"x".repeat(300)}.sh`,
      "x.\n",
    ];
    for (const name of names) {
      expect(sanitizeUploadFilename(name)).toMatch(SAFE_NAME);
    }
  });
});
