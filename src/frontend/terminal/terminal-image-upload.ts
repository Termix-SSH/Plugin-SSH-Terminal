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
