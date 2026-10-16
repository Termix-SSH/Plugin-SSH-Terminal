/**
 * The tmux command that scrolls a session's active pane. Up enters copy mode
 * first; -e leaves it again once the pane is scrolled back to the bottom.
 */
export function tmuxScrollCommand(
  sessionName: string,
  direction: "up" | "down",
  lines: number,
): string {
  const target = `'=${sessionName.replace(/'/g, "'\\''")}'`;
  const count = Math.min(Math.max(Math.round(lines) || 1, 1), 200);
  const scroll = `send-keys -t ${target} -X -N ${count} scroll-${direction}`;
  return direction === "up"
    ? `tmux copy-mode -e -t ${target} \\; ${scroll}`
    : `tmux ${scroll} 2>/dev/null || true`;
}
