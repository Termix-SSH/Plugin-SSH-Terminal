// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createTerminalImageDropHandlers } from "../../../src/frontend/terminal/terminal-image-drop";

function dragEvent(files: File[] | null, types = files ? ["Files"] : []) {
  return {
    dataTransfer: { types, files: files ?? [], dropEffect: "none" },
    preventDefault: vi.fn(),
  };
}

/** A drop as Chrome reports it: one item per dropped file or folder. */
function itemDropEvent(entries: Array<File | "folder">) {
  const items = entries.map((entry) =>
    entry === "folder"
      ? {
          kind: "file",
          webkitGetAsEntry: () => ({ isDirectory: true }),
          getAsFile: () => new File([], "folder"),
        }
      : {
          kind: "file",
          webkitGetAsEntry: () => ({ isDirectory: false }),
          getAsFile: () => entry,
        },
  );
  return {
    dataTransfer: {
      types: ["Files"],
      items,
      files: entries.filter((entry) => entry !== "folder"),
      dropEffect: "none",
    },
    preventDefault: vi.fn(),
  };
}

function setup() {
  const options = {
    uploadFiles: vi.fn(),
    rejectFolders: vi.fn(),
    setDragging: vi.fn(),
  };
  return { options, handlers: createTerminalImageDropHandlers(options) };
}

const png = new File([new Uint8Array([137, 80, 78, 71])], "capture.png", {
  type: "image/png",
});
const jpeg = new File(["jpeg"], "photo.jpg", { type: "image/jpeg" });
const pdf = new File(["pdf"], "document.pdf", { type: "application/pdf" });
const log = new File(["log"], "server.log", { type: "" });

describe("terminal file drop", () => {
  it("uploads a dropped image and stops the browser opening it", () => {
    const { options, handlers } = setup();
    const event = dragEvent([png]);
    handlers.onDrop(event as never);
    expect(options.uploadFiles).toHaveBeenCalledExactlyOnceWith([png]);
    expect(options.rejectFolders).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });
  it("uploads a file that is not an image, and stops the browser opening it", () => {
    const { options, handlers } = setup();
    const event = dragEvent([pdf]);
    handlers.onDrop(event as never);
    expect(options.uploadFiles).toHaveBeenCalledExactlyOnceWith([pdf]);
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });
  it("uploads images and other files together, in drop order", () => {
    const { options, handlers } = setup();
    handlers.onDrop(dragEvent([jpeg, pdf, log, png]) as never);
    expect(options.uploadFiles).toHaveBeenCalledExactlyOnceWith([
      jpeg,
      pdf,
      log,
      png,
    ]);
  });
  it("skips a dropped folder, says so, and uploads the files beside it", () => {
    const { options, handlers } = setup();
    const event = itemDropEvent([pdf, "folder", png]);
    handlers.onDrop(event as never);
    expect(options.uploadFiles).toHaveBeenCalledExactlyOnceWith([pdf, png]);
    expect(options.rejectFolders).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });
  it("uploads nothing when only folders are dropped", () => {
    const { options, handlers } = setup();
    handlers.onDrop(itemDropEvent(["folder", "folder"]) as never);
    expect(options.rejectFolders).toHaveBeenCalledOnce();
    expect(options.uploadFiles).not.toHaveBeenCalled();
  });
  it("allows the drop while files are dragged over the terminal", () => {
    const { handlers } = setup();
    const event = dragEvent([]);
    handlers.onDragOver(event as never);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.dataTransfer.dropEffect).toBe("copy");
  });
  it("leaves drags without files alone", () => {
    const { options, handlers } = setup();
    const text = dragEvent(null, ["text/plain"]);
    const missing = { dataTransfer: null, preventDefault: vi.fn() };
    for (const event of [text, missing]) {
      handlers.onDragEnter(event as never);
      handlers.onDragOver(event as never);
      handlers.onDragLeave(event as never);
      handlers.onDrop(event as never);
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
    expect(options.setDragging).not.toHaveBeenCalled();
    expect(options.uploadFiles).not.toHaveBeenCalled();
    expect(options.rejectFolders).not.toHaveBeenCalled();
  });
  it("reports dragging once while the pointer crosses child elements", () => {
    const { options, handlers } = setup();
    handlers.onDragEnter(dragEvent([]) as never);
    handlers.onDragEnter(dragEvent([]) as never);
    handlers.onDragLeave(dragEvent([]) as never);
    expect(options.setDragging.mock.calls).toEqual([[true]]);
    handlers.onDragLeave(dragEvent([]) as never);
    expect(options.setDragging.mock.calls).toEqual([[true], [false]]);
    handlers.onDragLeave(dragEvent([]) as never);
    expect(options.setDragging).toHaveBeenCalledTimes(2);
  });
  it("stops reporting dragging after a drop, and starts again on the next drag", () => {
    const { options, handlers } = setup();
    handlers.onDragEnter(dragEvent([]) as never);
    handlers.onDragEnter(dragEvent([]) as never);
    handlers.onDrop(dragEvent([png]) as never);
    expect(options.setDragging).toHaveBeenLastCalledWith(false);
    handlers.onDragEnter(dragEvent([]) as never);
    expect(options.setDragging).toHaveBeenLastCalledWith(true);
    expect(options.setDragging).toHaveBeenCalledTimes(3);
  });
});
