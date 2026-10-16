import { describe, expect, it } from "vitest";
import { SHELL_CWD_COMMAND } from "../../src/backend/shell-cwd.js";

describe("SHELL_CWD_COMMAND", () => {
  it("runs under sh so any login shell can start it", () => {
    expect(SHELL_CWD_COMMAND.startsWith("sh -c '")).toBe(true);
    expect(SHELL_CWD_COMMAND.slice(7, -1)).not.toContain("'");
  });

  it("reads the shell's directory and falls back to pwd", () => {
    expect(SHELL_CWD_COMMAND).toContain('readlink "/proc/$c/cwd"');
    expect(SHELL_CWD_COMMAND.endsWith("pwd'")).toBe(true);
  });
});
