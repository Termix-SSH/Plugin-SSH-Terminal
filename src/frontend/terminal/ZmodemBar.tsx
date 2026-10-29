import { useRef } from "react";
import { Download, Upload, X } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { Button } from "@termix-ssh/plugin-sdk/ui";
import type { ZmodemState } from "./zmodem-transfer";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

/** The rz/sz strip over the bottom of the terminal. */
export function ZmodemBar({
  state,
  onFiles,
  onCancel,
}: {
  state: ZmodemState;
  onFiles: (files: File[]) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  if (state.phase === "idle") return null;

  const percent =
    state.phase !== "choose" && state.total > 0
      ? Math.min(100, Math.round((state.done / state.total) * 100))
      : null;

  return (
    <div className="absolute inset-x-0 bottom-0 z-[120] flex items-center gap-2 border-t border-border bg-background/95 px-3 py-2 text-xs">
      {state.phase === "receiving" ? (
        <Download className="size-3.5 shrink-0 text-accent-brand" />
      ) : (
        <Upload className="size-3.5 shrink-0 text-accent-brand" />
      )}
      {state.phase === "choose" ? (
        <>
          <span className="flex-1 truncate">{t("zmodem.waiting")}</span>
          <input
            ref={input}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              onFiles(files);
            }}
          />
          <Button size="sm" onClick={() => input.current?.click()}>
            {t("zmodem.choose")}
          </Button>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate">
            {t(
              state.phase === "sending" ? "zmodem.sending" : "zmodem.receiving",
              { name: state.name },
            )}
          </span>
          <span className="font-mono text-muted-foreground">
            {formatBytes(state.done)}
            {state.total > 0 ? ` / ${formatBytes(state.total)}` : ""}
            {percent !== null ? ` | ${percent}%` : ""}
          </span>
        </>
      )}
      <Button
        size="icon"
        variant="ghost"
        className="size-7"
        aria-label={t("zmodem.cancel")}
        title={t("zmodem.cancel")}
        onClick={onCancel}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
