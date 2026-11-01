import { useSyncExternalStore } from "react";
import { Button, Checkbox } from "@termix-ssh/plugin-sdk/ui";
import { useShell, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  sessionsSnapshot,
  subscribeSessions,
  type TerminalSessionInfo,
} from "../../session-registry";
import { setBroadcastMembers } from "./broadcast-store";

export function sessionLabel(session: TerminalSessionInfo): string {
  return session.label || session.hostName || session.ip || session.id;
}

/** Who a broadcast reaches: quick picks and one row per open terminal. */
export function BroadcastTargets({
  tabId,
  members,
}: {
  tabId: string;
  members: readonly string[];
}) {
  const { t } = useTranslation();
  const shell = useShell();
  const sessions = useSyncExternalStore(subscribeSessions, sessionsSnapshot);
  const open = new Set(sessions.map((session) => session.id));

  const splitPanes =
    shell?.split.summaries
      .find((split) => split.panes.some((pane) => pane.tabId === tabId))
      ?.panes.map((pane) => pane.tabId)
      .filter((id): id is string => !!id && open.has(id)) ?? [];
  const folder = sessions.find((session) => session.id === tabId)?.folder;
  const sameFolder = folder
    ? sessions.filter((session) => session.folder === folder)
    : [];

  function toggle(id: string) {
    // This terminal stays in, Stop is how it leaves.
    if (id === tabId) return;
    setBroadcastMembers(
      members.includes(id)
        ? members.filter((member) => member !== id)
        : [...members, id],
    );
  }

  return (
    <div className="flex w-64 flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        <Button
          variant="outline"
          size="xs"
          onClick={() =>
            setBroadcastMembers(sessions.map((session) => session.id))
          }
        >
          {t("terminalTools.broadcast.allOpen")}
        </Button>
        {splitPanes.length > 1 && (
          <Button
            variant="outline"
            size="xs"
            onClick={() => setBroadcastMembers(splitPanes)}
          >
            {t("terminalTools.broadcast.thisSplit")}
          </Button>
        )}
        {sameFolder.length > 1 && (
          <Button
            variant="outline"
            size="xs"
            onClick={() =>
              setBroadcastMembers(sameFolder.map((session) => session.id))
            }
          >
            {t("terminalTools.broadcast.sameFolder")}
          </Button>
        )}
      </div>
      <div className="flex max-h-60 flex-col overflow-y-auto border border-border">
        {sessions.map((session) => (
          <button
            key={session.id}
            type="button"
            disabled={session.id === tabId}
            onClick={() => toggle(session.id)}
            className="flex items-center gap-2 border-b border-border/60 px-2 py-1.5 text-left text-xs last:border-0 hover:bg-muted/40 disabled:cursor-default"
          >
            <Checkbox
              checked={members.includes(session.id)}
              tabIndex={-1}
              className="pointer-events-none"
            />
            <span className="min-w-0 flex-1 truncate">
              {sessionLabel(session)}
            </span>
            {session.connected === false && (
              <span className="shrink-0 text-muted-foreground">
                {t("terminalTools.broadcast.offline")}
              </span>
            )}
          </button>
        ))}
      </div>
      {sessions.length < 2 && (
        <span className="text-[11px] text-muted-foreground">
          {t("terminalTools.broadcast.openMore")}
        </span>
      )}
    </div>
  );
}
