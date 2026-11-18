// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createTerminalImageDropHandlers } from "../../../src/frontend/terminal/terminal-image-drop";

function dragEvent(files: File[] | null, types = files ? ["Files"] : []) {
  return {
    dataTransfer: { types, files: files ?? [], dropEffect: "none" },
    preventDefault: vi.fn(),
  };
}

function setup() {
  const options = {
    uploadImages: vi.fn(),
    rejectFiles: vi.fn(),
    setDragging: vi.fn(),
  };
  return { options, handlers: createTerminalImageDropHandlers(options) };
}

const png = new File([new Uint8Array([137, 80, 78, 71])], "capture.png", {
  type: "image/png",
});
const jpeg = new File(["jpeg"], "photo.jpg", { type: "image/jpeg" });
const pdf = new File(["pdf"], "document.pdf", { type: "application/pdf" });

describe("terminal image drop", () => {
  it("uploads a dropped image and stops the browser opening it", () => {
    const { options, handlers } = setup();
    const event = dragEvent([png]);
    handlers.onDrop(event as never);
    expect(options.uploadImages).toHaveBeenCalledExactlyOnceWith([png]);
    expect(options.rejectFiles).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });
  it("uploads every image in drop order and skips other files", () => {
    const { options, handlers } = setup();
    handlers.onDrop(dragEvent([jpeg, pdf, png]) as never);
    expect(options.uploadImages).toHaveBeenCalledExactlyOnceWith([jpeg, png]);
    expect(options.rejectFiles).not.toHaveBeenCalled();
  });
  it("rejects a drop with no image, and still stops the browser opening it", () => {
    const { options, handlers } = setup();
    const event = dragEvent([pdf]);
    handlers.onDrop(event as never);
    expect(options.rejectFiles).toHaveBeenCalledOnce();
    expect(options.uploadImages).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalledOnce();
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
    expect(options.uploadImages).not.toHaveBeenCalled();
    expect(options.rejectFiles).not.toHaveBeenCalled();
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
