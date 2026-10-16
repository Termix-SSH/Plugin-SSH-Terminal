import { describe, expect, it } from "vitest";
import { tmuxScrollCommand } from "../../src/backend/tmux-scroll.js";

describe("tmuxScrollCommand", () => {
  it("enters copy mode and scrolls up", () => {
    const command = tmuxScrollCommand("main", "up", 6);
    expect(command).toContain("copy-mode -e -t '=main'");
    expect(command).toContain("-X -N 6 scroll-up");
  });

  it("only scrolls down, without entering copy mode", () => {
    const command = tmuxScrollCommand("main", "down", 3);
    expect(command).not.toContain("copy-mode");
    expect(command).toContain("-X -N 3 scroll-down");
  });

  it("quotes the session name and caps the line count", () => {
    const command = tmuxScrollCommand("a'; rm -rf /", "up", 9999);
    expect(command).toContain(`-t '=a'\\''; rm -rf /'`);
    expect(command).toContain("-N 200 ");
  });
});
