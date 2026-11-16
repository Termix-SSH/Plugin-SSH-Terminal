export type TmuxAttachPlan = "create" | "attach" | "pick";

/**
 * What Auto-Tmux does once the host's sessions are listed: start one when
 * there is none, reattach to the only one, and ask only when there is a choice.
 * A single session that another tab is already showing also asks, since joining
 * it just mirrors that tab. askWhenOne shows the picker for a single session in
 * every case.
 */
export function planTmuxAttach(
  sessions: ReadonlyArray<{ attachedClients?: number }>,
  askWhenOne = false,
): TmuxAttachPlan {
  if (sessions.length === 0) return "create";
  if (sessions.length > 1 || askWhenOne) return "pick";
  return (sessions[0].attachedClients ?? 0) > 0 ? "pick" : "attach";
}

/** The tmux session a tab was showing, as the tab remembers it. */
export interface TmuxSessionRef {
  name: string;
  /** tmux's session_created, in seconds, when the backend could read it. */
  created?: number;
}

/**
 * Finds the session a tab was showing again after its connection ended.
 * Sessions get renamed (by hand or by a hook), so a known creation time picks
 * the session and the name only breaks a tie between sessions created in the
 * same second. Without a time the name has to match. Null when the session is
 * gone or it is unclear which one it was.
 */
export function findTmuxSession<T extends { name: string; created?: number }>(
  sessions: ReadonlyArray<T>,
  ref: TmuxSessionRef,
): T | null {
  if (typeof ref.created === "number") {
    const sameTime = sessions.filter((s) => s.created === ref.created);
    if (sameTime.length === 1) return sameTime[0];
    return sameTime.find((s) => s.name === ref.name) ?? null;
  }
  return sessions.find((s) => s.name === ref.name) ?? null;
}

/** A remembered session from a client message, or undefined when malformed. */
export function readTmuxSessionRef(value: unknown): TmuxSessionRef | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { name, created } = value as { name?: unknown; created?: unknown };
  if (typeof name !== "string" || name === "" || name.length > 256) {
    return undefined;
  }
  return typeof created === "number" && Number.isFinite(created)
    ? { name, created }
    : { name };
}
