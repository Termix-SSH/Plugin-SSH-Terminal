/** The part of a drag event the drop handlers use, native or React. */
export interface TerminalDragEvent {
  dataTransfer: DataTransfer | null;
  preventDefault: () => void;
}

export interface TerminalImageDropHandlers {
  onDragEnter: (event: TerminalDragEvent) => void;
  onDragOver: (event: TerminalDragEvent) => void;
  onDragLeave: (event: TerminalDragEvent) => void;
  onDrop: (event: TerminalDragEvent) => void;
}

function carriesFiles(event: TerminalDragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

/**
 * Take files dragged onto the terminal. Images go to `uploadImages`, in the
 * order they were dropped. A drop with no image calls `rejectFiles`. Either way
 * the browser no longer opens the dropped file in place of the page. Drags
 * without files, like selected text, are left alone.
 *
 * `setDragging` says when a file drag is over the terminal. Enter and leave
 * also fire for every child the pointer crosses, so they are counted.
 */
export function createTerminalImageDropHandlers(options: {
  uploadImages: (files: File[]) => void;
  rejectFiles: () => void;
  setDragging: (dragging: boolean) => void;
}): TerminalImageDropHandlers {
  let depth = 0;
  const leave = () => {
    depth = 0;
    options.setDragging(false);
  };
  return {
    onDragEnter(event) {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth++;
      if (depth === 1) options.setDragging(true);
    },
    onDragOver(event) {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    },
    onDragLeave(event) {
      if (!carriesFiles(event) || depth === 0) return;
      depth--;
      if (depth === 0) options.setDragging(false);
    },
    onDrop(event) {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      leave();
      const images = Array.from(event.dataTransfer?.files ?? []).filter(
        (file) => file.type.startsWith("image/"),
      );
      if (images.length > 0) options.uploadImages(images);
      else options.rejectFiles();
    },
  };
}
