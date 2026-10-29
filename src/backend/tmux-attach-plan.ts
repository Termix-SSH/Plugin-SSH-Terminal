export type TmuxAttachPlan = "create" | "attach" | "pick";

/**
 * What Auto-Tmux does once the host's sessions are listed: start one when
 * there is none, reattach to the only one, and ask only when there is a choice.
 * askWhenOne shows the picker for a single session too, so a new tab can start
 * its own session.
 */
export function planTmuxAttach(
  sessionCount: number,
  askWhenOne = false,
): TmuxAttachPlan {
  if (sessionCount === 0) return "create";
  return sessionCount === 1 && !askWhenOne ? "attach" : "pick";
}
