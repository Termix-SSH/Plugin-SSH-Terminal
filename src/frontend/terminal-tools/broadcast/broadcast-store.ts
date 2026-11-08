import { useSyncExternalStore } from "react";
import {
  getSessionHandle,
  listSessions,
  subscribeSessions,
} from "../../session-registry";
import {
  formatPaste,
  isSignalKey,
  stripTerminalReplies,
  translateInput,
} from "./translate-input";

export interface BroadcastState {
  members: readonly string[];
  paused: boolean;
  /** Members asking for a password right now. */
  atPrompt: readonly string[];
}

const IDLE: BroadcastState = { members: [], paused: false, atPrompt: [] };

let state = IDLE;
let stopWatchingSessions: (() => void) | null = null;
const promptIds = new Set<string>();
const listeners = new Set<() => void>();

function publish(next: Omit<BroadcastState, "atPrompt">): void {
  state = {
    ...next,
    atPrompt: next.members.filter((id) => promptIds.has(id)),
  };
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getBroadcastState(): BroadcastState {
  return state;
}

export function useBroadcast(): BroadcastState {
  return useSyncExternalStore(subscribe, getBroadcastState);
}

// Closed tabs leave the group, and a group of one has nobody left to reach.
function pruneClosedSessions(): void {
  const open = new Set(listSessions().map((session) => session.id));
  const members = state.members.filter((id) => open.has(id));
  if (members.length === state.members.length) return;
  if (
    members.length === 0 ||
    (state.members.length >= 2 && members.length <= 1)
  )
    stopBroadcast();
  else publish({ ...state, members });
}

export function stopBroadcast(): void {
  stopWatchingSessions?.();
  stopWatchingSessions = null;
  publish(IDLE);
}

export function setBroadcastMembers(members: readonly string[]): void {
  if (members.length === 0) {
    stopBroadcast();
    return;
  }
  stopWatchingSessions ??= subscribeSessions(pruneClosedSessions);
  publish({ ...state, members: [...new Set(members)] });
}

/** Starts a group, adds the terminal to it, or ends it from a member. */
export function toggleBroadcast(id: string): void {
  if (state.members.includes(id)) stopBroadcast();
  else setBroadcastMembers([...state.members, id]);
}

export function setBroadcastPaused(paused: boolean): void {
  publish({ ...state, paused });
}

export function reportPasswordPrompt(id: string, asking: boolean): void {
  if (promptIds.has(id) === asking) return;
  if (asking) promptIds.add(id);
  else promptIds.delete(id);
  if (state.members.includes(id)) publish(state);
}

/** Hands what a member's user typed to the rest of the group. */
export function mirrorTypedInput(sourceId: string, data: string): void {
  if (state.paused || !state.members.includes(sourceId)) return;
  const source = getSessionHandle(sourceId);
  if (!source) return;
  const typed = stripTerminalReplies(data);
  if (!typed) return;
  const signal = isSignalKey(typed);
  // A password typed here must never reach the other hosts.
  if (source.isAtPasswordPrompt() && !signal) return;
  const modes = source.getInputModes();
  for (const id of state.members) {
    if (id === sourceId) continue;
    const target = getSessionHandle(id);
    if (!target?.isConnected()) continue;
    if (target.isAtPasswordPrompt() && !signal) continue;
    target.injectInput(translateInput(typed, modes, target.getInputModes()));
  }
}

/** Sends text from the compose box or the send key menu to every member. */
export function sendToBroadcastGroup(
  text: string,
  options: { run?: boolean; raw?: boolean } = {},
): { sent: number; skipped: number } {
  let sent = 0;
  let skipped = 0;
  for (const id of state.members) {
    const target = getSessionHandle(id);
    if (
      !target?.isConnected() ||
      (target.isAtPasswordPrompt() && !isSignalKey(text))
    ) {
      skipped++;
      continue;
    }
    const body = options.raw
      ? text
      : formatPaste(text, target.getInputModes().bracketedPaste);
    target.injectInput(options.run ? `${body}\r` : body);
    sent++;
  }
  return { sent, skipped };
}

export interface PasswordFillCounts {
  filled: number;
  notAsking: number;
  noPassword: number;
}

/** Fills only the terminals that are asking, each with its own host's password. */
export async function fillPasswords(
  ids: readonly string[],
): Promise<PasswordFillCounts> {
  const counts: PasswordFillCounts = { filled: 0, notAsking: 0, noPassword: 0 };
  const results = await Promise.all(
    ids.map((id) =>
      (
        getSessionHandle(id)?.fillPassword() ?? Promise.resolve("no-prompt")
      ).catch(() => "no-password" as const),
    ),
  );
  for (const result of results) {
    if (result === "filled") counts.filled++;
    else if (result === "no-prompt") counts.notAsking++;
    else counts.noPassword++;
  }
  return counts;
}

/** Test seam. */
export function resetBroadcastStore(): void {
  stopBroadcast();
  promptIds.clear();
}
