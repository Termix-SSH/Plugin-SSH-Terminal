import { describe, expect, it } from "vitest";
import { tmuxAttachCommand } from "../../../src/frontend/terminal/tmux-attach-command";
describe("tmux attach command", () => {
  it("uses exact matching and shell quotes instead of accepting a command", () => {
    expect(tmuxAttachCommand("codex-session")).toBe(
      "tmux attach-session -t '=codex-session'",
    );
    expect(tmuxAttachCommand("a'; echo injected; '")).toBe(
      "tmux attach-session -t '=a'\\''; echo injected; '\\'''",
    );
  });
});
