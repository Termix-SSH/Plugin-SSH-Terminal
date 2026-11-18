import { describe, expect, it } from "vitest";
import {
  buildFileUploadFormData,
  buildImageUploadFormData,
  isConvertibleImage,
  selectImageUploadApi,
} from "../../../src/frontend/terminal/terminal-image-upload";

describe("buildImageUploadFormData", () => {
  it("tags a picked-file upload with source=file and a client timestamp", () => {
    const file = new File(["png-bytes"], "photo.png", { type: "image/png" });

    const form = buildImageUploadFormData(file, "tab-1", "file");

    expect(form.get("image")).toBe(file);
    expect(form.get("instanceId")).toBe("tab-1");
    expect(form.get("source")).toBe("file");
    const timestamp = form.get("clientUploadTimestamp");
    expect(typeof timestamp).toBe("string");
    expect(Number.isNaN(Date.parse(timestamp as string))).toBe(false);
  });

  it("tags a clipboard upload with source=clipboard", () => {
    const file = new File(["png-bytes"], "clipboard-image.png", {
      type: "image/png",
    });

    const form = buildImageUploadFormData(file, "tab-1", "clipboard");

    expect(form.get("source")).toBe("clipboard");
  });

  it("uses the caller-provided client timestamp unchanged", () => {
    const file = new File(["png-bytes"], "photo.png", { type: "image/png" });

    const form = buildImageUploadFormData(
      file,
      "tab-1",
      "file",
      "2026-08-15T12:00:00.000Z",
    );

    expect(form.get("clientUploadTimestamp")).toBe("2026-08-15T12:00:00.000Z");
  });
});

describe("selectImageUploadApi", () => {
  const localApi = { name: "local" };
  const remoteApi = { name: "remote" };

  it("uploads to the linked server when the session was opened there", () => {
    expect(selectImageUploadApi("remote", localApi, remoteApi)).toBe(remoteApi);
  });

  it("uploads to the local backend when the session is local", () => {
    expect(selectImageUploadApi("local", localApi, remoteApi)).toBe(localApi);
  });
});

describe("buildFileUploadFormData", () => {
  it("sends the file under its own name with the tab and a client timestamp", () => {
    const file = new File(["%PDF"], "Q3 report.pdf", {
      type: "application/pdf",
    });

    const form = buildFileUploadFormData(file, "tab-1");

    const sent = form.get("file") as File;
    expect(sent.name).toBe("Q3 report.pdf");
    expect(sent.size).toBe(4);
    expect(form.get("instanceId")).toBe("tab-1");
    expect(form.has("image")).toBe(false);
    const timestamp = form.get("clientUploadTimestamp");
    expect(Number.isNaN(Date.parse(timestamp as string))).toBe(false);
  });
});

describe("isConvertibleImage", () => {
  const typed = (type: string) => new File(["x"], "x", { type });

  it("sends the image types the backend converts to PNG down the image path", () => {
    for (const type of [
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/HEIC",
    ]) {
      expect(isConvertibleImage(typed(type))).toBe(true);
    }
  });

  it("uploads other files as they are, image types the backend cannot decode included", () => {
    for (const type of ["image/svg+xml", "image/bmp", "application/pdf", ""]) {
      expect(isConvertibleImage(typed(type))).toBe(false);
    }
  });
});
