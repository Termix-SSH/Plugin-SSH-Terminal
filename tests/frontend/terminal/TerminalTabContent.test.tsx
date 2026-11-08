import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { TabProps } from "@termix-ssh/plugin-sdk/frontend";

const captured = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));

vi.mock("../../../src/frontend/terminal/Terminal", () => ({
  Terminal: (props: Record<string, unknown>) => {
    captured.props.push(props);
    return null;
  },
}));

vi.mock(
  "../../../src/frontend/terminal/command-history/CommandHistoryContext",
  () => ({
    CommandHistoryProvider: ({ children }: { children: ReactNode }) => (
      <>{children}</>
    ),
  }),
);

vi.mock("@termix-ssh/plugin-sdk/ui", () => ({
  useIsMobile: () => false,
  LoadingState: () => null,
}));

import { TerminalTabContent } from "../../../src/frontend/terminal/TerminalTabContent";

afterEach(() => {
  cleanup();
  captured.props = [];
});

function renderTab(
  inSplit?: boolean,
  data?: Record<string, unknown>,
  options: { id?: number | string; editHost?: (id: number) => void } = {},
) {
  const props = {
    tab: {
      id: "t1",
      instanceId: "i1",
      type: "terminal",
      label: "web-01",
      data,
    },
    host: { id: options.id ?? "1", name: "web-01", ip: "10.0.0.1", port: 22 },
    sshHost: { id: 1 },
    label: "web-01",
    isVisible: true,
    isFocusedPane: true,
    inSplit,
    handleRef: null,
    shell: {
      closeTab: vi.fn(),
      renameTab: vi.fn(),
      openTab: vi.fn(),
      editHost: options.editHost,
    },
  } as unknown as TabProps;
  render(<TerminalTabContent {...props} />);
}

describe("TerminalTabContent in a split", () => {
  it("tells the terminal it is in a split, so it does not grab focus", async () => {
    renderTab(true);
    await waitFor(() => expect(captured.props.length).toBeGreaterThan(0));
    expect(captured.props.at(-1)?.splitScreen).toBe(true);
  });

  it("lets a terminal on its own take focus as before", async () => {
    renderTab(undefined);
    await waitFor(() => expect(captured.props.length).toBeGreaterThan(0));
    expect(captured.props.at(-1)?.splitScreen).toBe(false);
  });
  it("attaches an independent tab to the exact requested tmux session", async () => {
    renderTab(undefined, { tmuxSession: "agent's session" });
    await waitFor(() => expect(captured.props.length).toBeGreaterThan(0));
    expect(captured.props.at(-1)?.executeCommand).toBe(
      "tmux attach-session -t '=agent'\\''s session'",
    );
  });
  it("does not execute anything when a restored tmux session value is invalid", async () => {
    renderTab(undefined, { tmuxSession: 42 });
    await waitFor(() => expect(captured.props.length).toBeGreaterThan(0));
    expect(captured.props.at(-1)?.executeCommand).toBeUndefined();
  });
});

describe("TerminalTabContent host editing", () => {
  it.each([7, "7"])(
    "opens the existing host editor for saved ID %j",
    async (id) => {
      const editHost = vi.fn();
      renderTab(undefined, undefined, { id, editHost });
      await waitFor(() => expect(captured.props.length).toBeGreaterThan(0));
      const edit = captured.props.at(-1)?.onEditHost;
      expect(edit).toBeTypeOf("function");
      (edit as () => void)();
      expect(editHost).toHaveBeenCalledWith(7);
    },
  );

  it.each([
    "quick-connect-7",
    "7suffix",
    "",
    "1e2",
    "0x7",
    " 7",
    0,
    -7,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
  ])("does not offer editing for unsaved or invalid ID %j", async (id) => {
    const editHost = vi.fn();
    renderTab(undefined, undefined, { id, editHost });
    await waitFor(() => expect(captured.props.length).toBeGreaterThan(0));
    expect(captured.props.at(-1)?.onEditHost).toBeUndefined();
    expect(editHost).not.toHaveBeenCalled();
  });

  it("does not offer editing when the shell does not support it", async () => {
    renderTab(undefined, undefined, { id: 7 });
    await waitFor(() => expect(captured.props.length).toBeGreaterThan(0));
    expect(captured.props.at(-1)?.onEditHost).toBeUndefined();
  });
});
