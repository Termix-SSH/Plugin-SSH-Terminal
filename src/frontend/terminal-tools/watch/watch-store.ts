import { useSyncExternalStore } from "react";
import {
  getSessionHandle,
  getSessionInfo,
  listSessions,
  subscribeSessions,
} from "../../session-registry";
import {
  createWatchTracker,
  type WatchHit,
  type WatchRule,
  type WatchTracker,
} from "./match";

interface ActiveRule {
  rule: WatchRule;
  tracker: WatchTracker;
}

interface TabWatch {
  rules: Map<string, ActiveRule>;
  unsubscribe: () => void;
}

export type WatchAlertSender = (
  sessionId: string,
  rule: WatchRule,
  hit: WatchHit,
) => void;

const tabs = new Map<string, TabWatch>();
const listeners = new Set<() => void>();
let version = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let stopWatchingSessions: (() => void) | null = null;
let sendAlert: WatchAlertSender = () => {};

function changed(): void {
  version++;
  for (const listener of [...listeners]) listener();
}

function isAway(sessionId: string): boolean {
  if (typeof document !== "undefined") {
    if (document.hidden || !document.hasFocus()) return true;
  }
  return getSessionInfo(sessionId)?.visible === false;
}

function deliver(sessionId: string, rule: WatchRule, hit: WatchHit | null) {
  if (hit) sendAlert(sessionId, rule, hit);
}

function tickAll(): void {
  const now = Date.now();
  for (const [sessionId, tab] of tabs) {
    const away = isAway(sessionId);
    for (const { rule, tracker } of tab.rules.values()) {
      deliver(sessionId, rule, tracker.tick(now, away));
    }
  }
}

function syncBackground(): void {
  if (tabs.size > 0) {
    timer ??= setInterval(tickAll, 1000);
    stopWatchingSessions ??= subscribeSessions(dropClosedSessions);
    return;
  }
  if (timer) clearInterval(timer);
  timer = null;
  stopWatchingSessions?.();
  stopWatchingSessions = null;
}

function dropClosedSessions(): void {
  const open = new Set(listSessions().map((session) => session.id));
  let removed = false;
  for (const [sessionId, tab] of tabs) {
    if (open.has(sessionId)) continue;
    tab.unsubscribe();
    tabs.delete(sessionId);
    removed = true;
  }
  if (!removed) return;
  syncBackground();
  changed();
}

/** Set once at activation: where a fired rule goes. */
export function setWatchAlertSender(sender: WatchAlertSender): void {
  sendAlert = sender;
}

/** Turns a saved rule on or off for one terminal. */
export function setWatchRule(
  sessionId: string,
  rule: WatchRule,
  on: boolean,
): void {
  let tab = tabs.get(sessionId);
  if (on) {
    if (!tab) {
      const handle = getSessionHandle(sessionId);
      if (!handle) return;
      const created: TabWatch = {
        rules: new Map(),
        unsubscribe: handle.subscribeOutput((chunk) => {
          const now = Date.now();
          const away = isAway(sessionId);
          for (const active of created.rules.values()) {
            deliver(
              sessionId,
              active.rule,
              active.tracker.feed(chunk, now, away),
            );
          }
        }),
      };
      tab = created;
      tabs.set(sessionId, tab);
    }
    tab.rules.set(rule.id, { rule, tracker: createWatchTracker(rule) });
  } else if (tab) {
    tab.rules.delete(rule.id);
    if (tab.rules.size === 0) {
      tab.unsubscribe();
      tabs.delete(sessionId);
    }
  }
  syncBackground();
  changed();
}

/** Turns a deleted rule off everywhere. */
export function removeWatchRuleEverywhere(rule: WatchRule): void {
  for (const sessionId of [...tabs.keys()]) {
    setWatchRule(sessionId, rule, false);
  }
}

export function isWatchRuleOn(sessionId: string, ruleId: string): boolean {
  return tabs.get(sessionId)?.rules.has(ruleId) ?? false;
}

export function noteWatchInput(sessionId: string): void {
  const tab = tabs.get(sessionId);
  if (!tab) return;
  const now = Date.now();
  for (const { tracker } of tab.rules.values()) tracker.noteInput(now);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** How many rules are on for a terminal, kept current. */
export function useWatchCount(sessionId: string | undefined): number {
  useSyncExternalStore(subscribe, () => version);
  return sessionId ? (tabs.get(sessionId)?.rules.size ?? 0) : 0;
}

/** Test seam. */
export function resetWatchStore(): void {
  for (const tab of tabs.values()) tab.unsubscribe();
  tabs.clear();
  syncBackground();
  sendAlert = () => {};
}
