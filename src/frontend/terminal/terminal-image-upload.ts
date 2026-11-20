export type TerminalImageUploadSource = "file" | "clipboard";

export function buildImageUploadFormData(
  file: File,
  instanceId: string,
  source: TerminalImageUploadSource,
  clientUploadTimestamp = new Date().toISOString(),
): FormData {
  const form = new FormData();
  form.append("image", file);
  form.append("instanceId", instanceId);
  form.append("source", source);
  form.append("clientUploadTimestamp", clientUploadTimestamp);
  return form;
}

// The image types the backend takes as images: a PNG or JPEG is stored as an
// upright PNG, the others as they came. Any other dropped file, an SVG or a
// BMP included, is uploaded as a file.
const CONVERTIBLE_IMAGE_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/jp2",
  "image/jpeg",
  "image/jxl",
  "image/png",
  "image/tiff",
  "image/webp",
]);

export function isConvertibleImage(file: File): boolean {
  return CONVERTIBLE_IMAGE_TYPES.has(file.type.toLowerCase());
}

/** The upload of a dropped file that is not an image. It keeps its name. */
export function buildFileUploadFormData(
  file: File,
  instanceId: string,
  clientUploadTimestamp = new Date().toISOString(),
): FormData {
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("instanceId", instanceId);
  form.append("clientUploadTimestamp", clientUploadTimestamp);
  return form;
}

/**
 * The API client an image upload goes to. The backend stores the image through
 * the terminal's SSH session, so the upload has to reach the backend that holds
 * that session: the linked server for a session opened there from the desktop
 * app, the local backend otherwise.
 */
export function selectImageUploadApi<T>(
  sessionOrigin: "local" | "remote",
  localApi: T,
  remoteApi: T,
): T {
  return sessionOrigin === "remote" ? remoteApi : localApi;
}
