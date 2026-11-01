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
