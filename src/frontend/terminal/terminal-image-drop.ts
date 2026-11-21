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
 * The dropped files in drop order, and how many dropped items were folders.
 * A folder shows up as a file that cannot be read, so it is told apart by its
 * entry, which is only available during the drop event.
 */
function droppedFiles(dataTransfer: DataTransfer | null): {
  files: File[];
  folders: number;
} {
  const items = Array.from(dataTransfer?.items ?? []).filter(
    (item) => item.kind === "file",
  );
  if (items.length === 0) {
    return { files: Array.from(dataTransfer?.files ?? []), folders: 0 };
  }
  const files: File[] = [];
  let folders = 0;
  for (const item of items) {
    if (item.webkitGetAsEntry?.()?.isDirectory) {
      folders++;
      continue;
    }
    const file = item.getAsFile();
    if (file) files.push(file);
  }
  return { files, folders };
}

/**
 * Take files dragged onto the terminal. The files go to `uploadFiles`, images
 * and other files alike, in the order they were dropped. Folders are skipped
 * and reported to `rejectFolders`. Either way the browser no longer opens the
 * dropped file in place of the page. Drags without files, like selected text,
 * are left alone.
 *
 * `setDragging` says when a file drag is over the terminal. Enter and leave
 * also fire for every child the pointer crosses, so they are counted.
 */
export function createTerminalImageDropHandlers(options: {
  uploadFiles: (files: File[]) => void;
  rejectFolders: () => void;
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
      const { files, folders } = droppedFiles(event.dataTransfer);
      if (folders > 0) options.rejectFolders();
      if (files.length > 0) options.uploadFiles(files);
    },
  };
}
