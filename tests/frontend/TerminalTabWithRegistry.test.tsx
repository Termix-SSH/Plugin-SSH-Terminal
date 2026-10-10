import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEffect, type ReactNode, type Ref } from "react";
import type { TabProps } from "@termix-ssh/plugin-sdk/frontend";

const fakeHandle = vi.hoisted(() => ({ sendInput: vi.fn(), paste: vi.fn() }));

vi.mock("../../src/frontend/terminal/Terminal", () => ({
  Terminal: ({ ref }: { ref?: Ref<unknown> }) => {
    useEffect(() => {
      if (typeof ref === "function") ref(fakeHandle);
      else if (ref) (ref as { current: unknown }).current = fakeHandle;
    }, [ref]);
    return null;
  },
}));

vi.mock(
  "../../src/frontend/terminal/command-history/CommandHistoryContext",
  () => ({
    CommandHistoryProvider: ({ children }: { children: ReactNode }) => (
      <>{children}</>
    ),
  }),
);

vi.mock("@termix-ssh/plugin-sdk/ui", () => ({
  useIsMobile: () => false,
}));

import { TerminalTabWithRegistry } from "../../src/frontend/TerminalTabWithRegistry";
import {
  listSessions,
  sendToActive,
} from "../../src/frontend/session-registry";

afterEach(() => cleanup());

describe("TerminalTabWithRegistry", () => {
  it("registers the session when core passes a callback ref", async () => {
    const handleRef = vi.fn();
    const props = {
      tab: { id: "t1", instanceId: "i1", type: "terminal", label: "web-01" },
      host: { id: "1", name: "web-01", ip: "10.0.0.1", port: 22 },
      sshHost: { id: 1 },
      label: "web-01",
      isVisible: true,
      isFocusedPane: true,
      handleRef,
      shell: { closeTab: vi.fn(), renameTab: vi.fn(), openTab: vi.fn() },
    } as unknown as TabProps;
    render(<TerminalTabWithRegistry {...props} />);

    await waitFor(() =>
      expect(listSessions().map((s) => s.id)).toEqual(["t1"]),
    );
    expect(handleRef).toHaveBeenCalledWith(fakeHandle);
    expect(sendToActive("ls", { run: true })).toBe(true);
    expect(fakeHandle.sendInput).toHaveBeenCalledWith("ls\r");

    cleanup();
    expect(listSessions()).toEqual([]);
  });
});
