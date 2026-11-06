import { describe, expect, it } from "vitest";
import type {
  PluginContext,
  PluginOperationContext,
} from "@termix-ssh/plugin-sdk/backend";
import { registerOperations } from "../../src/backend/operations.js";

describe("ssh-terminal.sessions", () => {
  it("lists the open sessions of one host", async () => {
    const handlers = new Map<
      string,
      { run: (i: unknown, c: PluginOperationContext) => Promise<unknown> }
    >();
    const ctx = {
      currentActor: () => "user-1",
      operations: {
        register: (id: string, h: never) => handlers.set(id, h),
      },
    } as unknown as PluginContext;
    registerOperations(ctx, {} as never, () => [
      {
        id: "a",
        hostId: 1,
        hostName: "web",
        connected: true,
        createdAt: 0,
        lastDetachedAt: null,
        tmuxSessionName: null,
      },
      {
        id: "b",
        hostId: 2,
        hostName: "db",
        connected: false,
        createdAt: 0,
        lastDetachedAt: 5,
        tmuxSessionName: "main",
      },
    ]);
    const result = (await handlers
      .get("ssh-terminal.sessions")!
      .run({}, { hostId: 2 } as PluginOperationContext)) as {
      data: { rows: { id: string; name: string; state: string }[] };
    };
    expect(result.data.rows).toEqual([
      expect.objectContaining({ id: "b", name: "main", state: "detached" }),
    ]);
  });
});
