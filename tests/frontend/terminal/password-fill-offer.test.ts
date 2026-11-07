import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import {
  isPasswordPrompt as endsInPasswordPrompt,
  isSudoPrompt as isSudoPromptOutput,
} from "../../../src/frontend/terminal/password-prompt";

// Runs the terminal's real prompt handling with fakes around it.
const source = fs.readFileSync("src/frontend/terminal/Terminal.tsx", "utf8");
const start = source.indexOf("    async function resolvePasswordForPrompt(");
const end = source.indexOf(
  "    /**",
  source.indexOf("function offerPasswordFill("),
);
const code = ts.transpileModule(
  source.slice(start, end) + "\n({ maybeOfferPasswordFill });",
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

function setup(hostConfig: Record<string, unknown>, saved: string | null) {
  const confirm = vi.fn(async () => false);
  const getHostPassword = vi.fn(async () => saved);
  const { maybeOfferPasswordFill } = vm.runInNewContext(code, {
    hostConfig: { id: 9, ...hostConfig },
    termSettingsRef: {
      current: { passwordPromptAutoFill: true, sudoPasswordAutoFill: true },
    },
    passwordPromptBufferRef: { current: "" },
    passwordPromptShownRef: { current: false },
    lastCommandRef: { current: "sudo apt update" },
    webSocketRef: { current: null },
    endsInPasswordPrompt,
    isSudoPromptOutput,
    suTargetUser: () => null,
    offerSuPasswordFill: vi.fn(),
    getHostPassword,
    confirm,
    t: (key: string) => key,
    WebSocket: { OPEN: 1 },
    setTimeout,
  }) as { maybeOfferPasswordFill: (data: string) => void };
  return { maybeOfferPasswordFill, confirm, getHostPassword };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("password fill offer", () => {
  it("offers when the host says it has a sudo password", async () => {
    const h = setup({ hasSudoPassword: true }, null);
    h.maybeOfferPasswordFill("[sudo] password for me: ");
    await tick();
    expect(h.confirm).toHaveBeenCalledTimes(1);
    expect(h.getHostPassword).not.toHaveBeenCalled();
  });

  it("looks the password up when an older core sends no flags", async () => {
    const h = setup({}, "secret");
    h.maybeOfferPasswordFill("[sudo] password for me: ");
    await tick();
    expect(h.getHostPassword).toHaveBeenCalledWith(9, "sudoPassword");
    expect(h.confirm).toHaveBeenCalledTimes(1);
  });

  it("stays quiet when nothing is saved", async () => {
    const flagsOff = setup(
      { hasPassword: false, hasSudoPassword: false },
      null,
    );
    flagsOff.maybeOfferPasswordFill("[sudo] password for me: ");
    const noFlags = setup({}, null);
    noFlags.maybeOfferPasswordFill("[sudo] password for me: ");
    await tick();
    expect(flagsOff.getHostPassword).not.toHaveBeenCalled();
    expect(flagsOff.confirm).not.toHaveBeenCalled();
    expect(noFlags.confirm).not.toHaveBeenCalled();
  });
});
