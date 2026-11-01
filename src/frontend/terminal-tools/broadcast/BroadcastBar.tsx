import { useState, useSyncExternalStore } from "react";
import {
  Keyboard,
  KeyRound,
  Pause,
  PencilLine,
  Play,
  Radio,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { sessionsSnapshot, subscribeSessions } from "../../session-registry";
import { fillPasswordsWithToast, SEND_KEYS } from "../ToolsMenu";
import {
  sendToBroadcastGroup,
  setBroadcastPaused,
  stopBroadcast,
  useBroadcast,
} from "./broadcast-store";
import { BroadcastCompose } from "./BroadcastCompose";
import { BroadcastTargets } from "./BroadcastTargets";

const BAR_BUTTON =
  "inline-flex h-6 shrink-0 items-center gap-1 px-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:bg-muted data-[state=open]:text-foreground";

/** Sits on top of every terminal in the group while a broadcast runs. */
export function BroadcastBar({
  tabId,
  onCustomKey,
}: {
  tabId: string;
  onCustomKey: () => void;
}) {
  const { t } = useTranslation();
  const { members, paused, atPrompt } = useBroadcast();
  const sessions = useSyncExternalStore(subscribeSessions, sessionsSnapshot);
  const [composing, setComposing] = useState(false);
  // A group of one has nobody to reach, so ask who else right away.
  const [targetsOpen, setTargetsOpen] = useState(members.length < 2);

  const offline = sessions.filter(
    (session) => members.includes(session.id) && session.connected === false,
  ).length;
  const status = paused
    ? t("terminalTools.broadcast.paused")
    : atPrompt.includes(tabId)
      ? t("terminalTools.broadcast.pausedForPassword")
      : t("terminalTools.broadcast.on");

  function sendKey(data: string) {
    const { skipped } = sendToBroadcastGroup(data, { raw: true });
    if (skipped > 0) {
      toast.warning(t("terminalTools.broadcast.skipped", { count: skipped }));
    }
  }

  return (
    <div
      data-broadcast-bar
      className="relative z-[110] shrink-0 border-b border-border bg-sidebar"
    >
      <div className="flex flex-wrap items-center gap-0.5 px-1 py-0.5">
        <span
          role="status"
          className="inline-flex items-center gap-1.5 px-1.5 text-xs font-medium"
          style={{ color: "var(--warning)" }}
        >
          <Radio className="size-3.5 shrink-0" />
          {status}
        </span>
        <Popover open={targetsOpen} onOpenChange={setTargetsOpen}>
          <PopoverTrigger asChild>
            <button type="button" className={BAR_BUTTON}>
              <Users className="size-3.5" />
              {t("terminalTools.broadcast.members", { count: members.length })}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-2">
            <BroadcastTargets tabId={tabId} members={members} />
          </PopoverContent>
        </Popover>
        {offline > 0 && (
          <span className="px-1 text-[11px] text-muted-foreground">
            {t("terminalTools.broadcast.offlineCount", { count: offline })}
          </span>
        )}
        <button
          type="button"
          className={BAR_BUTTON}
          aria-pressed={composing}
          onClick={() => setComposing((value) => !value)}
        >
          <PencilLine className="size-3.5" />
          {t("terminalTools.broadcast.compose")}
        </button>
        <button
          type="button"
          className={BAR_BUTTON}
          onClick={() => void fillPasswordsWithToast(t, members)}
        >
          <KeyRound className="size-3.5" />
          {t("terminalTools.fill.label")}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={BAR_BUTTON}>
              <Keyboard className="size-3.5" />
              {t("terminalTools.keys.title")}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {SEND_KEYS.map(({ key, data }) => (
              <DropdownMenuItem key={key} onSelect={() => sendKey(data)}>
                {key}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onSelect={onCustomKey}>
              {t("terminalTools.keys.custom")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="flex-1" />
        <button
          type="button"
          className={BAR_BUTTON}
          onClick={() => setBroadcastPaused(!paused)}
        >
          {paused ? (
            <Play className="size-3.5" />
          ) : (
            <Pause className="size-3.5" />
          )}
          {paused
            ? t("terminalTools.broadcast.resume")
            : t("terminalTools.broadcast.pause")}
        </button>
        <button type="button" className={BAR_BUTTON} onClick={stopBroadcast}>
          <X className="size-3.5" />
          {t("terminalTools.broadcast.stopShort")}
        </button>
      </div>
      {composing && <BroadcastCompose />}
    </div>
  );
}
