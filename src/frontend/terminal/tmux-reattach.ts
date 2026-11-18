/** The tmux session a tab shows, kept so a new login can attach it again. */
export interface RememberedTmuxSession {
  name: string;
  /** tmux's session_created in seconds; it survives a rename, the name does not. */
  created?: number;
}

/**
 * What the tab remembers once the backend attached or created a tmux session.
 * The backend sends the creation time when it can read it. A session picked
 * from the list keeps the time the list showed for it.
 */
export function rememberTmuxSession(
  previous: RememberedTmuxSession | null,
  sessionName: string,
  created: unknown,
): RememberedTmuxSession | null {
  if (!sessionName) return null;
  if (typeof created === "number" && Number.isFinite(created)) {
    return { name: sessionName, created };
  }
  if (previous?.name === sessionName && previous.created !== undefined) {
    return { name: sessionName, created: previous.created };
  }
  return { name: sessionName };
}
