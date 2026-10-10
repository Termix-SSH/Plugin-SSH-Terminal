import { useState, useRef, useEffect, useSyncExternalStore } from "react";
import { KeyRound, Terminal, Keyboard } from "lucide-react";
import { toast } from "sonner";
import {
  Button,
  Checkbox,
  GroupHeading,
  SwitchRow,
} from "@termix-ssh/plugin-sdk/ui";
import {
  getClientPreference,
  getHostPassword,
  setClientPreference,
  useTranslation,
  type PanelProps,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  getSessionHandle,
  sessionsSnapshot,
  subscribeSessions,
} from "../session-registry";

/**
 * SSH Tools: type into several open terminals at once, fill their saved
 * passwords, and the terminal's clipboard preferences.
 */
export function SshToolsPanel({ targetTab }: PanelProps) {
  const { t } = useTranslation();
  const terminalTabs = useSyncExternalStore(
    subscribeSessions,
    sessionsSnapshot,
  );
  const activeTabId = targetTab?.id ?? "";
  const [keyRecording, setKeyRecording] = useState(false);
  const [rightClickPaste, setRightClickPaste] = useState(
    () => getClientPreference("rightClickCopyPaste") !== "false",
  );
  const [ctrlVPaste, setCtrlVPaste] = useState(
    () => getClientPreference("ctrlVPaste") !== "false",
  );
  const [copyOnSelect, setCopyOnSelect] = useState(
    () => getClientPreference("copyOnSelect") === "true",
  );
  const [selectedTabIds, setSelectedTabIds] = useState<Set<string>>(
    () =>
      new Set(
        activeTabId && terminalTabs.some((tab) => tab.id === activeTabId)
          ? [activeTabId]
          : [],
      ),
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (keyRecording) inputRef.current?.focus();
  }, [keyRecording]);

  function toggleTab(id: string) {
    setSelectedTabIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function selectAll() {
    setSelectedTabIds(new Set(terminalTabs.map((tab) => tab.id)));
  }

  function deselectAll() {
    setSelectedTabIds(new Set());
  }

  function broadcast(data: string) {
    for (const tabId of selectedTabIds) {
      getSessionHandle(tabId)?.sendInput(data);
    }
  }

  async function fillPassword() {
    let filled = 0;
    let missing = 0;

    for (const tabId of selectedTabIds) {
      const tab = terminalTabs.find((session) => session.id === tabId);
      const hostId = tab?.hostId ?? null;
      const ref = getSessionHandle(tabId);
      if (!hostId || !ref) {
        missing++;
        continue;
      }

      const password = await getHostPassword(hostId, "password");
      if (!password) {
        missing++;
        continue;
      }

      ref.sendInput(password + "\r");
      filled++;
    }

    if (filled > 0) {
      toast.success(t("sshTools.fillPasswordSuccess", { count: filled }));
    }
    if (missing > 0) {
      toast.error(t("sshTools.fillPasswordMissing", { count: missing }));
    }
  }

  function broadcastArrow(normalSeq: string, appSeq: string) {
    for (const tabId of selectedTabIds) {
      const ref = getSessionHandle(tabId);
      if (!ref) continue;
      const appMode = ref.getApplicationCursorKeysMode?.() ?? false;
      ref.sendInput(appMode ? appSeq : normalSeq);
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    e.stopPropagation();
    const text = e.clipboardData.getData("text");
    if (text) broadcast(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const ctrl = e.ctrlKey;
    const { key } = e;

    // Let Ctrl/Cmd+V fall through so the browser fires a paste event
    // instead of being swallowed by the preventDefault() below.
    if ((ctrl || e.metaKey) && key.toLowerCase() === "v") {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    if (ctrl) {
      const ctrlMap: Record<string, string> = {
        c: "\x03",
        d: "\x04",
        l: "\x0C",
        u: "\x15",
        k: "\x0B",
        a: "\x01",
        e: "\x05",
        w: "\x17",
        z: "\x1A",
        r: "\x12",
      };
      const seq = ctrlMap[key.toLowerCase()];
      if (seq) {
        broadcast(seq);
        return;
      }
    }

    if (key === "ArrowUp") {
      broadcastArrow("\x1B[A", "\x1BOA");
      return;
    }
    if (key === "ArrowDown") {
      broadcastArrow("\x1B[B", "\x1BOB");
      return;
    }
    if (key === "ArrowRight") {
      broadcastArrow("\x1B[C", "\x1BOC");
      return;
    }
    if (key === "ArrowLeft") {
      broadcastArrow("\x1B[D", "\x1BOD");
      return;
    }

    const specialMap: Record<string, string> = {
      Enter: "\r",
      Backspace: "\x7F",
      Delete: "\x1B[3~",
      Tab: "\t",
      Escape: "\x1B",
      Home: "\x1B[H",
      End: "\x1B[F",
      PageUp: "\x1B[5~",
      PageDown: "\x1B[6~",
      Insert: "\x1B[2~",
      F1: "\x1BOP",
      F2: "\x1BOQ",
      F3: "\x1BOR",
      F4: "\x1BOS",
      F5: "\x1B[15~",
      F6: "\x1B[17~",
      F7: "\x1B[18~",
      F8: "\x1B[19~",
      F9: "\x1B[20~",
      F10: "\x1B[21~",
      F11: "\x1B[23~",
      F12: "\x1B[24~",
    };

    const seq = specialMap[key];
    if (seq) {
      broadcast(seq);
      return;
    }

    if (!ctrl && !e.altKey && !e.metaKey && key.length === 1) {
      broadcast(key);
    }
  }

  function toggleRecording() {
    const next = !keyRecording;
    if (!next) {
      // clear the phantom text when stopping
      if (inputRef.current) inputRef.current.value = "";
    }
    setKeyRecording(next);
  }

  return (
    <div className="flex flex-col gap-2 p-2.5">
      <GroupHeading
        title={t("sshTools.keyRecordingTitle")}
        count={selectedTabIds.size || undefined}
        action={
          terminalTabs.length > 0 ? (
            <span className="flex items-center">
              <Button variant="ghost" size="xs" onClick={selectAll}>
                {t("sshTools.selectAll")}
              </Button>
              <Button variant="ghost" size="xs" onClick={deselectAll}>
                {t("sshTools.selectNone")}
              </Button>
            </span>
          ) : undefined
        }
      />
      <span className="text-[11px] text-muted-foreground">
        {t("sshTools.recordToTerminals")}
      </span>

      {terminalTabs.length === 0 ? (
        <div className="flex items-center gap-1.5 border border-dashed border-border px-2.5 py-2 text-muted-foreground">
          <Terminal className="size-3 shrink-0" />
          <span className="text-xs">{t("sshTools.noTerminalTabsOpen")}</span>
        </div>
      ) : (
        <div className="flex flex-col border border-border">
          {terminalTabs.map((tab) => {
            const selected = selectedTabIds.has(tab.id);
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => toggleTab(tab.id)}
                className={`flex items-center gap-2 border-b border-border/60 px-2.5 py-1.5 text-left transition-colors last:border-0 ${
                  selected
                    ? "bg-accent-brand/10 text-accent-brand"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                }`}
              >
                <Checkbox
                  checked={selected}
                  tabIndex={-1}
                  className="pointer-events-none"
                />
                <Terminal className="size-3 shrink-0 opacity-60" />
                <span className="flex-1 truncate text-xs font-medium">
                  {tab.label || tab.hostName || tab.ip}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={selectedTabIds.size === 0}
          className={`min-w-0 flex-1 ${keyRecording ? "border-accent-brand/40 bg-accent-brand/10 text-accent-brand hover:bg-accent-brand/20 hover:text-accent-brand" : ""}`}
          onClick={toggleRecording}
        >
          <Keyboard className="size-3.5" />
          <span className="truncate">
            {keyRecording
              ? t("sshTools.stopRecording")
              : t("sshTools.startRecording")}
          </span>
        </Button>
        <Button
          variant="outline"
          disabled={selectedTabIds.size === 0}
          className="min-w-0 flex-1"
          onClick={() => {
            void fillPassword();
          }}
        >
          <KeyRound className="size-3.5" />
          <span className="truncate">{t("sshTools.fillPassword")}</span>
        </Button>
      </div>
      {selectedTabIds.size === 0 && terminalTabs.length > 0 && (
        <span className="text-[11px] text-muted-foreground">
          {t("sshTools.selectTerminalsAbove")}
        </span>
      )}

      {keyRecording && (
        <input
          ref={inputRef}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onChange={(e) => {
            // Keystrokes are broadcast directly via handleKeyDown; the
            // field itself must stay empty. This also catches paste
            // insertion on browsers that fire "input" before we can
            // intercept it in onPaste.
            e.target.value = "";
          }}
          placeholder={t("sshTools.broadcastInputPlaceholder")}
          className="h-8 w-full caret-transparent border border-accent-brand/40 bg-background px-2.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-accent-brand/70"
        />
      )}

      <GroupHeading title={t("sshTools.settingsTitle")} className="pt-2" />
      <div className="flex flex-col border border-border bg-card px-3">
        <SwitchRow
          label={t("sshTools.enableRightClickCopyPaste")}
          checked={rightClickPaste}
          onChange={(next) => {
            setRightClickPaste(next);
            setClientPreference("rightClickCopyPaste", next ? "true" : "false");
          }}
        />
        <SwitchRow
          label={t("sshTools.ctrlVPaste")}
          checked={ctrlVPaste}
          onChange={(next) => {
            setCtrlVPaste(next);
            setClientPreference("ctrlVPaste", next ? "true" : "false");
          }}
        />
        <SwitchRow
          label={t("sshTools.copyOnSelect")}
          checked={copyOnSelect}
          onChange={(next) => {
            setCopyOnSelect(next);
            setClientPreference("copyOnSelect", next ? "true" : "false");
          }}
        />
      </div>
    </div>
  );
}
