/** Use the native paste payload, without another clipboard read or image re-encoding. */
export function createTerminalNativePasteHandler(
  pasteText: (text: string) => void,
  uploadImage: (file: File) => void,
): (event: ClipboardEvent) => void {
  return (event) => {
    const data = event.clipboardData;
    if (!data) return;
    let image: File | null | undefined;
    for (const item of Array.from(data.items)) {
      if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
      image = item.getAsFile();
      if (image) break;
    }
    image ??= Array.from(data.files).find((file) =>
      file.type.startsWith("image/"),
    );
    const text = data.getData("text/plain");
    if (!image && !text) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (image) uploadImage(image);
    else pasteText(text);
  };
}
