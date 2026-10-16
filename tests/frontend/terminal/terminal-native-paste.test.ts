// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createTerminalNativePasteHandler } from "../../../src/frontend/terminal/terminal-native-paste";

function pasteEvent(image: File | null, text = "", filesOnly = false) {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: {
      items:
        image && !filesOnly
          ? [{ kind: "file", type: image.type, getAsFile: () => image }]
          : [],
      files: image ? [image] : [],
      getData: () => text,
    },
  });
  return event as ClipboardEvent;
}

describe("terminal native paste", () => {
  it("uploads original PNG bytes and blocks xterm", () => {
    const container = document.createElement("div");
    const textarea = document.createElement("textarea");
    container.append(textarea);
    const paste = vi.fn();
    const upload = vi.fn();
    const xtermPaste = vi.fn();
    container.addEventListener(
      "paste",
      createTerminalNativePasteHandler(paste, upload),
      true,
    );
    textarea.addEventListener("paste", xtermPaste);
    const image = new File([new Uint8Array([137, 80, 78, 71])], "capture.png", {
      type: "image/png",
    });
    const event = pasteEvent(image);
    textarea.dispatchEvent(event);
    expect(upload).toHaveBeenCalledExactlyOnceWith(image);
    expect(paste).not.toHaveBeenCalled();
    expect(xtermPaste).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });
  it("pastes the text when an app copies text with an image of it", () => {
    const paste = vi.fn();
    const upload = vi.fn();
    const image = new File(["png"], "cells.png", { type: "image/png" });
    createTerminalNativePasteHandler(paste, upload)(pasteEvent(image, "a\tb"));
    expect(paste).toHaveBeenCalledExactlyOnceWith("a\tb");
    expect(upload).not.toHaveBeenCalled();
  });
  it("supports files without clipboard items", () => {
    const upload = vi.fn();
    const file = new File(["jpeg"], "a.jpg", { type: "image/jpeg" });
    createTerminalNativePasteHandler(
      vi.fn(),
      upload,
    )(pasteEvent(file, "", true));
    expect(upload).toHaveBeenCalledExactlyOnceWith(file);
  });
  it("pastes normal text once and ignores an empty clipboard", () => {
    const paste = vi.fn();
    const upload = vi.fn();
    const handle = createTerminalNativePasteHandler(paste, upload);
    handle(pasteEvent(null, "hello\nworld"));
    expect(paste).toHaveBeenCalledExactlyOnceWith("hello\nworld");
    const empty = pasteEvent(null);
    handle(empty);
    expect(empty.defaultPrevented).toBe(false);
    expect(upload).not.toHaveBeenCalled();
  });
  it("does not consume missing clipboard data or unsupported files", () => {
    const paste = vi.fn();
    const upload = vi.fn();
    const handle = createTerminalNativePasteHandler(paste, upload);
    const missing = new Event("paste", { cancelable: true }) as ClipboardEvent;
    handle(missing);
    const file = new File(["pdf"], "document.pdf", { type: "application/pdf" });
    const unsupported = pasteEvent(file);
    handle(unsupported);
    expect(missing.defaultPrevented).toBe(false);
    expect(unsupported.defaultPrevented).toBe(false);
    expect(paste).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });
  it("falls back to text when an image item has no file", () => {
    const paste = vi.fn();
    const upload = vi.fn();
    const event = pasteEvent(null, "fallback text");
    Object.assign(event.clipboardData!, {
      items: [{ kind: "file", type: "image/png", getAsFile: () => null }],
    });
    createTerminalNativePasteHandler(paste, upload)(event);
    expect(paste).toHaveBeenCalledExactlyOnceWith("fallback text");
    expect(upload).not.toHaveBeenCalled();
  });
  it("continues past unavailable image items", () => {
    const image = new File(["png"], "capture.png", { type: "image/png" });
    const upload = vi.fn();
    const event = pasteEvent(image);
    Object.assign(event.clipboardData!, {
      items: [
        { kind: "file", type: "image/png", getAsFile: () => null },
        { kind: "file", type: "image/png", getAsFile: () => image },
      ],
      files: [],
    });
    createTerminalNativePasteHandler(vi.fn(), upload)(event);
    expect(upload).toHaveBeenCalledExactlyOnceWith(image);
  });
  it("consumes text before xterm's own listener and supports listener cleanup", () => {
    const container = document.createElement("div");
    const textarea = document.createElement("textarea");
    container.append(textarea);
    const paste = vi.fn();
    const xtermPaste = vi.fn();
    const handle = createTerminalNativePasteHandler(paste, vi.fn());
    container.addEventListener("paste", handle, true);
    textarea.addEventListener("paste", xtermPaste);
    textarea.dispatchEvent(pasteEvent(null, "text"));
    expect(paste).toHaveBeenCalledExactlyOnceWith("text");
    expect(xtermPaste).not.toHaveBeenCalled();
    container.removeEventListener("paste", handle, true);
    textarea.dispatchEvent(pasteEvent(null, "after cleanup"));
    expect(xtermPaste).toHaveBeenCalledOnce();
    expect(paste).toHaveBeenCalledOnce();
  });
});
