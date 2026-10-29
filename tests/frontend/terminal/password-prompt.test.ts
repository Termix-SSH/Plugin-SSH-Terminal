import { describe, expect, it } from "vitest";
import {
  isPasswordPrompt,
  isSudoCommand,
  isSudoPrompt,
  stripAnsi,
  suTargetUser,
} from "../../../src/frontend/terminal/password-prompt";

describe("isPasswordPrompt", () => {
  it("matches sudo, sudo-rs, macOS and SSH prompts", () => {
    expect(isPasswordPrompt("[sudo] password for luke: ")).toBe(true);
    expect(isPasswordPrompt("[sudo: authenticate] Password: ")).toBe(true);
    expect(isPasswordPrompt("Password:")).toBe(true);
    expect(isPasswordPrompt("root@host's password: ")).toBe(true);
  });

  it("ignores ordinary output", () => {
    expect(isPasswordPrompt("luke@host:~$ ")).toBe(false);
    expect(isPasswordPrompt("Password: ok\nluke@host:~$ ")).toBe(false);
  });
});

describe("isSudoPrompt", () => {
  it("knows Linux sudo by its prompt", () => {
    expect(isSudoPrompt("[sudo] password for luke: ", "")).toBe(true);
    expect(isSudoPrompt("[sudo: authenticate] Password: ", "")).toBe(true);
  });

  it("knows macOS sudo by the command that was run", () => {
    expect(isSudoPrompt("Password:", "sudo ls /var/root")).toBe(true);
    expect(isSudoPrompt("Password:", "cd /etc && sudo vim hosts")).toBe(true);
    expect(isSudoPrompt("Sorry, try again.\nPassword:", "")).toBe(true);
  });

  it("treats a bare prompt after another command as a login prompt", () => {
    expect(isSudoPrompt("Password:", "ssh other-host")).toBe(false);
    expect(isSudoPrompt("Password:", "echo pseudo")).toBe(false);
  });
});

describe("isSudoCommand", () => {
  it("finds sudo as a word only", () => {
    expect(isSudoCommand("sudo -i")).toBe(true);
    expect(isSudoCommand("ls; sudo reboot")).toBe(true);
    expect(isSudoCommand("sudoedit file")).toBe(false);
    expect(isSudoCommand("visudo")).toBe(false);
  });
});

describe("stripAnsi", () => {
  it("lets a colored sudo prompt end in a password prompt", () => {
    const esc = String.fromCharCode(27);
    const prompt = `${esc}[1m[sudo] password for me: ${esc}(B${esc}[m`;
    expect(isPasswordPrompt(prompt)).toBe(false);
    expect(isPasswordPrompt(stripAnsi(prompt))).toBe(true);
  });

  it("drops window title sequences", () => {
    const esc = String.fromCharCode(27);
    const bel = String.fromCharCode(7);
    expect(stripAnsi(`${esc}]0;title${bel}Password: `)).toBe("Password: ");
  });
});

describe("suTargetUser", () => {
  it("finds the user su switches to", () => {
    expect(suTargetUser("su")).toBe("root");
    expect(suTargetUser("su -")).toBe("root");
    expect(suTargetUser("su - postgres")).toBe("postgres");
    expect(suTargetUser("su -l deploy")).toBe("deploy");
    expect(suTargetUser("su app -c 'whoami'")).toBe("app");
    expect(suTargetUser("su -s /bin/bash www-data")).toBe("www-data");
    expect(suTargetUser("cd /tmp && su bob")).toBe("bob");
  });

  it("ignores other commands and sudo su", () => {
    expect(suTargetUser("sudo su -")).toBeNull();
    expect(suTargetUser("sumo")).toBeNull();
    expect(suTargetUser("ls su")).toBeNull();
  });
});
