import { describe, expect, it, vi } from "vitest";

// The backend on the Windows desktop app resolves paths the Windows way.
vi.mock("path", async () => {
  const path = await vi.importActual<typeof import("path")>("path");
  return { ...path.win32, default: path.win32 };
});

const { parseImageHostPath, parseImageLocalDir } =
  await import("../../../src/backend/images/image-storage-settings.js");

describe("image folders on Windows", () => {
  it("takes a local folder written with backslashes", () => {
    expect(parseImageLocalDir("C:\\Users\\x\\img")).toBe("C:\\Users\\x\\img");
    expect(parseImageLocalDir("C:/Users/x/img")).toBe("C:\\Users\\x\\img");
  });

  it("still refuses parent segments in a local folder", () => {
    expect(parseImageLocalDir("C:\\Users\\..\\img")).toBeNull();
    expect(parseImageLocalDir("img\\pictures")).toBeNull();
  });

  it("keeps the host path POSIX only", () => {
    expect(parseImageHostPath("/srv/img")).toBe("/srv/img");
    expect(parseImageHostPath("/srv\\img")).toBeNull();
  });
});
