function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** `<host>-<date>-<time>.txt`, safe to save on any system. */
export function outputFileName(host: string, at: Date = new Date()): string {
  const safeHost =
    host
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^[-.]+|-+$/g, "") || "terminal";
  const date = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  const time = `${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
  return `${safeHost}-${date}-${time}.txt`;
}

export function downloadText(name: string, text: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
