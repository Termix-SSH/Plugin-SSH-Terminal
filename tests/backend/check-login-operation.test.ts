import { describe, expect, it, vi } from "vitest";
import type {
  PluginContext,
  PluginOperationContext,
} from "@termix-ssh/plugin-sdk/backend";
import { registerOperations } from "../../src/backend/operations.js";

function setup(enableSsh: boolean) {
  const handlers = new Map<
    string,
    { run: (i: unknown, c: PluginOperationContext) => Promise<unknown> }
  >();
  const exec = vi.fn(async () => ({ code: 0, stdout: "", stderr: "" }));
  const ctx = {
    currentActor: () => "user-1",
    hosts: { get: async (id: number) => ({ id, enableSsh }) },
    ssh: { exec },
    operations: {
      register: (id: string, h: never) => handlers.set(id, h),
    },
  } as unknown as PluginContext;
  registerOperations(ctx, {} as never);
  const run = () =>
    handlers
      .get("ssh-terminal.check-login")!
      .run({}, { hostId: 4 } as PluginOperationContext) as Promise<{
      data: { status: string };
    }>;
  return { run, exec };
}

describe("ssh-terminal.check-login", () => {
  it("skips a host whose SSH protocol is off (#95)", async () => {
    const { run, exec } = setup(false);
    const result = await run();
    expect(result.data.status).toBe("unknown");
    expect(exec).not.toHaveBeenCalled();
  });

  it("logs in to a host with SSH on, with a command PowerShell and cmd run too (#103)", async () => {
    const { run, exec } = setup(true);
    const result = await run();
    expect(result.data.status).toBe("ok");
    expect(exec).toHaveBeenCalledWith(4, "exit 0", expect.anything());
  });
});
