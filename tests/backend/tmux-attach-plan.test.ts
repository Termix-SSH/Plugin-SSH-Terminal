import { describe, expect, it } from "vitest";
import { planTmuxAttach } from "../../src/backend/tmux-attach-plan.js";

describe("planTmuxAttach", () => {
  it("creates a session when the host has none", () => {
    expect(planTmuxAttach(0)).toBe("create");
  });

  it("reattaches without asking when there is exactly one", () => {
    expect(planTmuxAttach(1)).toBe("attach");
  });

  it("asks which session when there are several", () => {
    expect(planTmuxAttach(2)).toBe("pick");
    expect(planTmuxAttach(7)).toBe("pick");
  });

  it("asks with one session when the host wants a choice", () => {
    expect(planTmuxAttach(1, true)).toBe("pick");
    expect(planTmuxAttach(0, true)).toBe("create");
  });
});
