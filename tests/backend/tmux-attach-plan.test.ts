import { describe, expect, it } from "vitest";
import {
  findTmuxSession,
  planTmuxAttach,
  readTmuxSessionRef,
} from "../../src/backend/tmux-attach-plan.js";

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

describe("findTmuxSession", () => {
  const sessions = [
    { name: "main", created: 100 },
    { name: "Fix the login page", created: 200 },
    { name: "build", created: 300 },
  ];

  it("finds a renamed session by its creation time", () => {
    expect(
      findTmuxSession(sessions, { name: "termix-3-ab12", created: 200 }),
    ).toBe(sessions[1]);
  });

  it("does not take another session that got the old name", () => {
    expect(findTmuxSession(sessions, { name: "main", created: 150 })).toBe(
      null,
    );
  });

  it("uses the name between sessions created in the same second", () => {
    const twins = [
      { name: "a", created: 500 },
      { name: "b", created: 500 },
    ];
    expect(findTmuxSession(twins, { name: "b", created: 500 })).toBe(twins[1]);
    expect(findTmuxSession(twins, { name: "c", created: 500 })).toBe(null);
  });

  it("matches the name when the creation time is unknown", () => {
    expect(findTmuxSession(sessions, { name: "build" })).toBe(sessions[2]);
    expect(findTmuxSession(sessions, { name: "gone" })).toBe(null);
  });

  it("finds nothing on a host without sessions", () => {
    expect(findTmuxSession([], { name: "main", created: 100 })).toBe(null);
  });
});

describe("readTmuxSessionRef", () => {
  it("keeps a name and a numeric creation time", () => {
    expect(readTmuxSessionRef({ name: "main", created: 100 })).toEqual({
      name: "main",
      created: 100,
    });
    expect(readTmuxSessionRef({ name: "main", created: "100" })).toEqual({
      name: "main",
    });
  });

  it("drops anything without a usable name", () => {
    expect(readTmuxSessionRef(undefined)).toBe(undefined);
    expect(readTmuxSessionRef("main")).toBe(undefined);
    expect(readTmuxSessionRef({ name: "" })).toBe(undefined);
    expect(readTmuxSessionRef({ name: 7 })).toBe(undefined);
    expect(readTmuxSessionRef({ name: "x".repeat(257) })).toBe(undefined);
  });
});
