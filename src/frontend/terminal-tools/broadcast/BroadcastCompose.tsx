import { useRef, useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button, Checkbox, Label, Textarea } from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { sendToBroadcastGroup } from "./broadcast-store";

const MAX_HISTORY = 50;
const history: string[] = [];

/** Write a command first, then send it to the whole group at once. */
export function BroadcastCompose() {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [run, setRun] = useState(true);
  const position = useRef(-1);

  function send() {
    if (!text.trim()) return;
    const { sent, skipped } = sendToBroadcastGroup(text, { run });
    if (skipped > 0) {
      toast.warning(t("terminalTools.broadcast.skipped", { count: skipped }));
    }
    if (sent === 0) return;
    if (history[0] !== text) history.unshift(text);
    history.length = Math.min(history.length, MAX_HISTORY);
    position.current = -1;
    setText("");
  }

  function recall(step: number) {
    const next = position.current + step;
    if (next >= history.length) return;
    position.current = Math.max(next, -1);
    setText(position.current < 0 ? "" : history[position.current]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    e.stopPropagation();
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      send();
    } else if (e.key === "ArrowUp" && e.currentTarget.selectionStart === 0) {
      e.preventDefault();
      recall(1);
    } else if (
      e.key === "ArrowDown" &&
      position.current >= 0 &&
      e.currentTarget.selectionEnd === text.length
    ) {
      e.preventDefault();
      recall(-1);
    }
  }

  return (
    <div className="flex items-start gap-2 border-t border-border p-1.5">
      <Textarea
        value={text}
        rows={2}
        autoFocus
        spellCheck={false}
        placeholder={t("terminalTools.broadcast.composeHint")}
        aria-label={t("terminalTools.broadcast.compose")}
        className="min-h-0 flex-1 resize-y font-mono text-xs"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div className="flex shrink-0 flex-col gap-1.5">
        <Button size="xs" disabled={!text.trim()} onClick={send}>
          <Send className="size-3" />
          {t("terminalTools.broadcast.send")}
        </Button>
        <Label className="flex items-center gap-1.5 text-[11px] font-normal">
          <Checkbox
            checked={run}
            onCheckedChange={(next) => setRun(next === true)}
          />
          {t("terminalTools.broadcast.pressEnter")}
        </Label>
      </div>
    </div>
  );
}
