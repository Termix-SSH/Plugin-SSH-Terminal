import { describe, expect, it } from "vitest";
import { parseManifest } from "@termix-ssh/plugin-sdk/manifest";
import {
  matchesWhen,
  type OperationWhen,
} from "@termix-ssh/plugin-sdk/operations";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import manifest from "../../manifest.json";
import { registerOperations } from "../../src/backend/operations.js";

describe("declared actions", () => {
  it("is a valid manifest", () => {
    expect(parseManifest(manifest).errors ?? []).toEqual([]);
  });

  it("has a handler for every declared action and nothing else", () => {
    const registered: string[] = [];
    const ctx = {
      operations: {
        register: (id: string) => {
          registered.push(id);
        },
      },
    } as unknown as PluginContext;
    (registerOperations as (...args: unknown[]) => void)(ctx, {}, {}, {});
    const declared = (
      manifest.contributes as { operations: { actions: { id: string }[] } }
    ).operations.actions.map((action) => action.id);
    expect([...registered].sort()).toEqual([...declared].sort());
  });

  it("needs edit for anything destructive", () => {
    const actions = (
      manifest.contributes as {
        operations: { actions: { risk: string; hostAccess?: string }[] };
      }
    ).operations.actions;
    for (const action of actions) {
      if (action.risk === "destructive") {
        expect(["edit", "manage"]).toContain(action.hostAccess);
      }
    }
  });

  it("leaves hosts without an SSH terminal alone, like an RDP-only host", () => {
    const actions = (
      manifest.contributes as {
        operations: { actions: { scope: string; when?: OperationWhen }[] };
      }
    ).operations.actions.filter((action) => action.scope === "host");
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      expect(
        matchesWhen(action.when, { settings: { enableTerminal: false } }),
      ).toBe(false);
      expect(
        matchesWhen(action.when, { settings: { enableTerminal: true } }),
      ).toBe(true);
    }
  });
});
