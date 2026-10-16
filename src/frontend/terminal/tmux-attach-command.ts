/** Pass only the session name; quote it and force exact matching. Never accept a raw command. */
export function tmuxAttachCommand(session: string): string {
  return `tmux attach-session -t '=${session.replace(/'/g, "'\\''")}'`;
}
