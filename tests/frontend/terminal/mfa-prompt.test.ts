/// <reference types="vite/client" />
/**
 * The terminal's MFA dialog plumbing, run straight out of Terminal.tsx: how a
 * password_required message picks the dialog mode, what submitting sends,
 * and that the dialog is torn down once the server moves on.
 */
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import sourceText from "../../../src/frontend/terminal/Terminal.tsx?raw";

function slice(from: string, to: string, start = 0): string {
  const begin = sourceText.indexOf(from, start);
  const end = sourceText.indexOf(to, begin);
  if (begin === -1 || end === -1) throw new Error(`Missing ${from}`);
  return sourceText.slice(begin, end);
}

/** handleTotpSubmit, dismissMfaPrompt and handleTotpCancel, as written. */
const handlers = slice(
  "    function handleTotpSubmit(code: string) {",
  "    function clearBrowserSignIn() {",
);

/** The password_required branch of the socket message handler. */
const browserBranch = sourceText.indexOf('msg.kind === "browser"');
const passwordRequired = sourceText.slice(
  sourceText.indexOf('} else if (msg.type === "password_required") {'),
  sourceText.lastIndexOf("} else if (", browserBranch),
);

const build = new Function(
  "state",
  ts.transpileModule(
    `
  const { mfaPromptMode, isPasswordPrompt, webSocketRef, totpTimeoutRef,
    connectionTimeoutRef, setMfaWaiting, setTotpRequired, setTotpPrompt,
    setIsPasswordPrompt, setMfaPromptMode, onClose, t, setTimeout,
    clearTimeout } = state;
  ${handlers}
  function onPasswordRequired(msg) {
    if (false) {
    ${passwordRequired}
    }
  }
  return { handleTotpSubmit, dismissMfaPrompt, handleTotpCancel, onPasswordRequired };
`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText,
) as (state: Record<string, unknown>) => {
  handleTotpSubmit: (code: string) => void;
  dismissMfaPrompt: () => void;
  handleTotpCancel: () => void;
  onPasswordRequired: (msg: Record<string, unknown>) => void;
};

function create(overrides: Record<string, unknown> = {}) {
  const state = {
    mfaPromptMode: "totp",
    isPasswordPrompt: true,
    webSocketRef: { current: { send: vi.fn() } },
    totpTimeoutRef: { current: 7 },
    connectionTimeoutRef: { current: null },
    setMfaWaiting: vi.fn(),
    setTotpRequired: vi.fn(),
    setTotpPrompt: vi.fn(),
    setIsPasswordPrompt: vi.fn(),
    setMfaPromptMode: vi.fn(),
    onClose: vi.fn(),
    t: (key: string) => key,
    setTimeout: vi.fn(() => 99),
    clearTimeout: vi.fn(),
    ...overrides,
  };
  return { state, ...build(state) };
}

describe("password_required picks the dialog mode", () => {
  it("trusts the backend: a menu is typed even though its text mentions push", () => {
    const { state, onPasswordRequired } = create();
    onPasswordRequired({
      type: "password_required",
      prompt: "Choose [1] Push, or [2] TOTP:",
      echo: true,
      isPush: false,
    });
    expect(state.setMfaPromptMode).toHaveBeenCalledWith("menu");
    expect(state.setTotpRequired).toHaveBeenCalledWith(true);
    expect(state.setIsPasswordPrompt).toHaveBeenCalledWith(true);
    expect(state.setTimeout).toHaveBeenCalledWith(expect.any(Function), 180000);
  });

  it("trusts the backend: a confirm-only push waits longer", () => {
    const { state, onPasswordRequired } = create();
    onPasswordRequired({
      type: "password_required",
      prompt: "Press enter to send Push",
      echo: true,
      isPush: true,
    });
    expect(state.setMfaPromptMode).toHaveBeenCalledWith("push");
    expect(state.setTimeout).toHaveBeenCalledWith(expect.any(Function), 300000);
  });

  it.each([
    ["Choose [1] Push, or [2] TOTP:", true, "menu"],
    ["Press enter to send Push", true, "push"],
    ["Password:", false, "password"],
  ])(
    "falls back to the prompt text for an older server: %s -> %s",
    (prompt, echo, mode) => {
      const { state, onPasswordRequired } = create();
      onPasswordRequired({ type: "password_required", prompt, echo });
      expect(state.setMfaPromptMode).toHaveBeenCalledWith(mode);
    },
  );
});

describe("submitting the dialog", () => {
  it("sends an empty answer for a push confirm and keeps the dialog waiting", () => {
    const { state, handleTotpSubmit } = create({ mfaPromptMode: "push" });
    handleTotpSubmit("");
    expect(state.webSocketRef.current.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "password_response", data: { code: "" } }),
    );
    expect(state.setMfaWaiting).toHaveBeenCalledWith(true);
    expect(state.setTotpRequired).not.toHaveBeenCalled();
  });

  it("sends a menu choice and closes the dialog", () => {
    const { state, handleTotpSubmit } = create({ mfaPromptMode: "menu" });
    handleTotpSubmit("1");
    expect(state.webSocketRef.current.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "password_response", data: { code: "1" } }),
    );
    expect(state.clearTimeout).toHaveBeenCalledWith(7);
    expect(state.setTotpRequired).toHaveBeenCalledWith(false);
  });

  it("never sends an empty answer outside push mode", () => {
    const { state, handleTotpSubmit } = create({ mfaPromptMode: "menu" });
    handleTotpSubmit("");
    expect(state.webSocketRef.current.send).not.toHaveBeenCalled();
  });
});

describe("dismissing the dialog", () => {
  it("stops the timer and resets every piece of dialog state", () => {
    const { state, dismissMfaPrompt } = create();
    dismissMfaPrompt();
    expect(state.clearTimeout).toHaveBeenCalledWith(7);
    expect(state.totpTimeoutRef.current).toBeNull();
    expect(state.setTotpRequired).toHaveBeenCalledWith(false);
    expect(state.setTotpPrompt).toHaveBeenCalledWith("");
    expect(state.setIsPasswordPrompt).toHaveBeenCalledWith(false);
    expect(state.setMfaPromptMode).toHaveBeenCalledWith("totp");
    expect(state.setMfaWaiting).toHaveBeenCalledWith(false);
    expect(state.onClose).not.toHaveBeenCalled();
  });

  it("cancel dismisses and then closes the tab", () => {
    const { state, handleTotpCancel } = create();
    handleTotpCancel();
    expect(state.setTotpRequired).toHaveBeenCalledWith(false);
    expect(state.onClose).toHaveBeenCalledOnce();
  });

  it("runs first thing when the session connects or fails", () => {
    expect(sourceText).toMatch(
      /msg\.type === "connected"\) \{\s*dismissMfaPrompt\(\);/,
    );
    expect(sourceText).toMatch(
      /msg\.type === "error"\) \{\s*const errorMessage = [^\n]*\n\s*dismissMfaPrompt\(\);/,
    );
  });
});
