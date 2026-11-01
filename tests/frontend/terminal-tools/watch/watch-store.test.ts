import { afterEach, describe, expect, it, vi } from "vitest";
import { registerSession } from "../../../../src/frontend/session-registry";
import type { TerminalHandle } from "../../../../src/frontend/terminal/terminal-types";
import type { WatchRule } from "../../../../src/frontend/terminal-tools/watch/match";
import {
  isWatchRuleOn,
  removeWatchRuleEverywhere,
  resetWatchStore,
  setWatchAlertSender,
  setWatchRule,
} from "../../../../src/frontend/terminal-tools/watch/watch-store";

const rule: WatchRule = {
  id: "r",
  name: "rule",
  kind: "match",
  pattern: "boom",
};
const disposers: Array<() => void> = [];

afterEach(() => {
  resetWatchStore();
  for (const dispose of disposers.splice(0)) dispose();
});

function open(id: string) {
  const listeners = new Set<(chunk: string) => void>();
  const unsubscribe = vi.fn();
  const handle = {
    subscribeOutput: (listener: (chunk: string) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        unsubscribe();
      };
    },
  };
  const dispose = registerSession(
    { id, hostId: 1 },
    handle as unknown as TerminalHandle,
  );
  disposers.push(dispose);
  return {
    dispose,
    unsubscribe,
    output: (chunk: string) => listeners.forEach((fn) => fn(chunk)),
  };
}

describe("watch store", () => {
  it("sends an alert when a rule that is on fires", () => {
    const send = vi.fn();
    setWatchAlertSender(send);
    const a = open("a");
    a.output("boom\n");
    expect(send).not.toHaveBeenCalled();
    setWatchRule("a", rule, true);
    a.output("boom\n");
    expect(send).toHaveBeenCalledWith("a", rule, { line: "boom" });
  });

  it("is per terminal", () => {
    const send = vi.fn();
    setWatchAlertSender(send);
    const a = open("a");
    const b = open("b");
    setWatchRule("a", rule, true);
    b.output("boom\n");
    expect(send).not.toHaveBeenCalled();
    expect(isWatchRuleOn("a", "r")).toBe(true);
    expect(isWatchRuleOn("b", "r")).toBe(false);
    a.output("boom\n");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("stops listening when the last rule goes off", () => {
    const a = open("a");
    setWatchRule("a", rule, true);
    setWatchRule("a", rule, false);
    expect(a.unsubscribe).toHaveBeenCalled();
    expect(isWatchRuleOn("a", "r")).toBe(false);
  });

  it("forgets a closed terminal", () => {
    const a = open("a");
    setWatchRule("a", rule, true);
    a.dispose();
    expect(isWatchRuleOn("a", "r")).toBe(false);
    expect(a.unsubscribe).toHaveBeenCalled();
  });

  it("turns a deleted rule off everywhere", () => {
    open("a");
    open("b");
    setWatchRule("a", rule, true);
    setWatchRule("b", rule, true);
    removeWatchRuleEverywhere(rule);
    expect(isWatchRuleOn("a", "r")).toBe(false);
    expect(isWatchRuleOn("b", "r")).toBe(false);
  });
});
