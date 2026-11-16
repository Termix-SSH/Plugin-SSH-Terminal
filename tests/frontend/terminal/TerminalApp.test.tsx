import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useCommandHistory } from "../../../src/frontend/terminal/command-history/CommandHistoryContext";

const captured = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));

vi.mock("../../../src/frontend/terminal/Terminal", () => ({
  Terminal: (props: Record<string, unknown>) => {
    captured.props.push(props);
    useCommandHistory();
    return <div>terminal</div>;
  },
}));

vi.mock("@termix-ssh/plugin-sdk/ui", () => ({
  FullScreenAppWrapper: ({
    children,
  }: {
    children: (host: unknown, phase: string) => ReactNode;
  }) => <>{children({ id: 15, name: "web", ip: "10.0.0.1" }, "ready")}</>,
  ConnectionScreen: () => null,
}));

vi.mock("@termix-ssh/plugin-sdk/frontend", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import TerminalApp from "../../../src/frontend/terminal/TerminalApp";

afterEach(() => {
  cleanup();
  captured.props = [];
});

describe("TerminalApp", () => {
  it("renders the terminal inside a command history provider", () => {
    render(<TerminalApp hostId="15" />);
    expect(screen.getByText("terminal")).toBeTruthy();
  });

  it("asks for a direct attach to the tmux session it was opened for", () => {
    render(<TerminalApp hostId="15" tmuxSession="build" />);
    expect(captured.props.at(-1)?.tmuxAttachSession).toBe("build");
    expect(captured.props.at(-1)?.executeCommand).toBe(
      "tmux attach-session -t '=build'",
    );
  });

  it("asks for no tmux session when opened without one", () => {
    render(<TerminalApp hostId="15" />);
    expect(captured.props.at(-1)?.tmuxAttachSession).toBeUndefined();
  });
});
