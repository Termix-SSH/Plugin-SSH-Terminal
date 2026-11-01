import { describe, expect, it } from "vitest";
import { planTmuxAttach } from "../../src/backend/tmux-attach-plan.js";

const idle = { attachedClients: 0 };
const open = { attachedClients: 1 };

describe("planTmuxAttach", () => {
  it("creates a session when the host has none", () => {
    expect(planTmuxAttach([])).toBe("create");
  });

  it("reattaches without asking to one session nobody is using", () => {
    expect(planTmuxAttach([idle])).toBe("attach");
  });

  it("asks when the only session is already open in another tab", () => {
    expect(planTmuxAttach([open])).toBe("pick");
  });

  it("asks which session when there are several", () => {
    expect(planTmuxAttach([idle, idle])).toBe("pick");
    expect(planTmuxAttach([idle, open, idle])).toBe("pick");
  });

  it("asks with one session when the host wants a choice", () => {
    expect(planTmuxAttach([idle], true)).toBe("pick");
    expect(planTmuxAttach([], true)).toBe("create");
  });
});
