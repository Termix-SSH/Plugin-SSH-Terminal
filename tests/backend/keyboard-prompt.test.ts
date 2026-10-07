import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  PluginKeyboardInteractiveDecision,
  PluginKeyboardInteractivePrompt,
  PluginSshHost,
} from "@termix-ssh/plugin-sdk/backend";
import { SSHAuthManager } from "../../src/backend/keyboard-prompt.js";

/**
 * Stands in for core's classifier (ctx.ssh.classifyKeyboardInteractive),
 * which core's own tests cover. These tests are about what the terminal does
 * with each decision: the socket messages, the answers and the timeouts.
 */
const PASSWORD = /password/i;
const FORTI = /type\s+['"]?push['"]?/i;
const PUSH_MENU = /choose.*push.*totp/i;
const PUSH =
  /press enter.*(push|send)|push notification|authentication by phone/i;
const TOTP =
  /verification code|verification_code|token|otp|2fa|authenticator|google.*auth/i;

function classify(
  round: {
    name: string;
    instructions: string;
    prompts: PluginKeyboardInteractivePrompt[];
  },
  host: PluginSshHost,
): PluginKeyboardInteractiveDecision {
  // Stands in for a plugin's keyboard-interactive handler.
  if (/gateway sign-in/i.test(round.name)) {
    return {
      kind: "browser",
      id: "gateway",
      label: "Gateway",
      url: round.instructions.match(/https?:\/\/\S+/)?.[0] ?? null,
      code: round.instructions.match(/Security key: (\S+)/)?.[1] ?? "",
      instructions: round.instructions,
    };
  }
  const texts = round.prompts.map((p) => p.prompt);
  const isPushFlow =
    !texts.some((t) => FORTI.test(t)) &&
    texts.some((t) => PUSH_MENU.test(t) || PUSH.test(t));
  if (!isPushFlow) {
    const totp = round.prompts.findIndex((p) => TOTP.test(p.prompt));
    if (totp !== -1) return { kind: "totp", promptIndex: totp };
  }
  const stored = !!host.password && host.authType !== "none";
  const first = round.prompts.findIndex(
    (p) => !(PASSWORD.test(p.prompt) && stored),
  );
  if (first === -1) {
    return {
      kind: "auto",
      responses: round.prompts.map((p) =>
        PASSWORD.test(p.prompt) ? String(host.password) : "",
      ),
    };
  }
  return { kind: "input", promptIndex: first, isPush: PUSH.test(texts[first]) };
}

const log = { info: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() };

function createManager() {
  const sent: Record<string, unknown>[] = [];
  const ws = { send: (data: string) => sent.push(JSON.parse(data)) } as any;
  const manager = new SSHAuthManager({
    ssh: { classifyKeyboardInteractive: classify },
    log,
    userId: "user-1",
    ws,
    hostId: 1,
    isKeyboardInteractive: false,
    keyboardInteractiveFinish: null,
    totpPromptSent: false,
    browserSignInId: null,
    totpTimeout: null,
    browserSignInTimeout: null,
    totpAttempts: 0,
  });
  return { manager, sent };
}

describe("SSHAuthManager.handleKeyboardInteractive", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("routes a TOTP verification prompt to the totp flow", () => {
    const { manager, sent } = createManager();
    const finish = vi.fn();

    manager.handleKeyboardInteractive(
      "",
      "",
      "",
      [{ prompt: "Verification code: ", echo: true }],
      finish,
      { username: "root", authType: "none" },
    );

    expect(sent).toEqual([
      {
        type: "connection_log",
        data: {
          stage: "auth",
          level: "info",
          message: "TOTP verification required",
        },
      },
      { type: "totp_required", prompt: "Verification code: " },
    ]);
    expect(finish).not.toHaveBeenCalled();
  });

  it("sends a JumpCloud-style push/TOTP menu as a text prompt, not a push confirm", () => {
    const { manager, sent } = createManager();
    const finish = vi.fn();

    manager.handleKeyboardInteractive(
      "",
      "",
      "",
      [{ prompt: "Choose [1] Push, or [2] TOTP: ", echo: true }],
      finish,
      { username: "root", authType: "none" },
    );

    expect(sent).toEqual([
      {
        type: "connection_log",
        data: {
          stage: "auth",
          level: "info",
          message: "Password authentication required",
        },
      },
      {
        type: "password_required",
        prompt: "Choose [1] Push, or [2] TOTP: ",
        echo: true,
        isPush: false,
      },
    ]);

    manager.context.keyboardInteractiveFinish?.(["1"]);

    expect(finish).toHaveBeenCalledWith(["1"]);
  });

  it("asks again when a menu choice is followed by a push confirm round", () => {
    const { manager, sent } = createManager();
    const menuFinish = vi.fn();
    const confirmFinish = vi.fn();
    const host = { username: "root", authType: "none" };

    manager.handleKeyboardInteractive(
      "",
      "",
      "",
      [{ prompt: "Choose [1] Push, or [2] TOTP: ", echo: true }],
      menuFinish,
      host,
    );
    manager.context.keyboardInteractiveFinish?.(["1"]);
    expect(menuFinish).toHaveBeenCalledWith(["1"]);

    manager.handleKeyboardInteractive(
      "",
      "",
      "",
      [{ prompt: "Press enter to send Push", echo: true }],
      confirmFinish,
      host,
    );

    expect(sent.filter((m) => m.type === "password_required")).toEqual([
      {
        type: "password_required",
        prompt: "Choose [1] Push, or [2] TOTP: ",
        echo: true,
        isPush: false,
      },
      {
        type: "password_required",
        prompt: "Press enter to send Push",
        echo: true,
        isPush: true,
      },
    ]);

    manager.context.keyboardInteractiveFinish?.([""]);
    expect(confirmFinish).toHaveBeenCalledWith([""]);
  });

  it("silently auto-answers a plain password prompt when a stored password exists", () => {
    const { manager, sent } = createManager();
    const finish = vi.fn();

    manager.handleKeyboardInteractive(
      "",
      "",
      "",
      [{ prompt: "Password: ", echo: false }],
      finish,
      { username: "root", password: "hunter2", authType: "password" },
    );

    expect(finish).toHaveBeenCalledWith(["hunter2"]);
    expect(sent).toEqual([]);
  });

  it("prompts the user for a push-confirm prompt and accepts an empty response", () => {
    const { manager, sent } = createManager();
    const finish = vi.fn();

    manager.handleKeyboardInteractive(
      "",
      "",
      "",
      [{ prompt: "Press enter to send Push request: ", echo: true }],
      finish,
      { username: "root", authType: "none" },
    );

    expect(sent).toEqual([
      {
        type: "connection_log",
        data: {
          stage: "auth",
          level: "info",
          message: "Password authentication required",
        },
      },
      {
        type: "password_required",
        prompt: "Press enter to send Push request: ",
        echo: true,
        isPush: true,
      },
    ]);

    manager.context.keyboardInteractiveFinish?.([""]);

    expect(finish).toHaveBeenCalledWith([""]);
  });

  it("uses a longer timeout for push-style prompts than generic prompts", () => {
    vi.useFakeTimers();
    try {
      const { manager, sent } = createManager();
      const finish = vi.fn();

      manager.handleKeyboardInteractive(
        "",
        "",
        "",
        [{ prompt: "Press enter to send Push request: ", echo: true }],
        finish,
        { username: "root", authType: "none" },
      );

      vi.advanceTimersByTime(180001);
      expect(sent.some((m) => m.type === "error")).toBe(false);

      vi.advanceTimersByTime(120000);
      expect(sent.some((m) => m.type === "error")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("routes a FortiToken prompt to the totp flow instead of the push-confirm flow", () => {
    const { manager, sent } = createManager();
    const finish = vi.fn();

    manager.handleKeyboardInteractive(
      "",
      "",
      "",
      [
        {
          prompt:
            "Enter your Token or type 'push' to receive a push notification: ",
          echo: true,
        },
      ],
      finish,
      { username: "root", authType: "none" },
    );

    expect(sent).toEqual([
      {
        type: "connection_log",
        data: {
          stage: "auth",
          level: "info",
          message: "TOTP verification required",
        },
      },
      {
        type: "totp_required",
        prompt:
          "Enter your Token or type 'push' to receive a push notification: ",
      },
    ]);

    manager.context.keyboardInteractiveFinish?.(["push"]);

    expect(finish).toHaveBeenCalledWith(["push"]);
  });

  it("sends a claimed browser round under its handler's name", () => {
    const { manager, sent } = createManager();
    const finish = vi.fn();

    manager.handleKeyboardInteractive(
      "Gateway sign-in",
      "Visit https://gateway.example.com/auth to continue. Security key: AB12",
      "",
      [{ prompt: "Press enter once done: ", echo: true }],
      finish,
      { username: "root", authType: "none" },
    );

    expect(sent).toEqual([
      {
        type: "connection_log",
        data: {
          stage: "auth",
          level: "info",
          message: "Gateway sign-in required",
        },
      },
      {
        type: "gateway_auth_required",
        kind: "browser",
        label: "Gateway",
        url: "https://gateway.example.com/auth",
        securityKey: "AB12",
        instructions:
          "Visit https://gateway.example.com/auth to continue. Security key: AB12",
      },
    ]);
    expect(manager.context.browserSignInId).toBe("gateway");
  });
});
