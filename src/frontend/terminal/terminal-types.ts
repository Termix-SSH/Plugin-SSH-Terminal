import type { HostSshOptions } from "@termix-ssh/plugin-sdk/frontend";

export interface TerminalHostConfig {
  id?: number;
  instanceId?: string;
  restoredSessionId?: string | null;
  /** Set when this tab joins someone else's live shared SSH session instead of connecting/attaching. */
  joinSharedSessionId?: string | null;
  joinShareId?: string | null;
  name?: string;
  ip: string;
  port: number;
  username: string;
  password?: string;
  key?: string;
  keyPassword?: string;
  keyType?: string;
  authType?: string;
  credentialId?: number;
  sshOptions?: HostSshOptions | null;
  [key: string]: unknown;
}

export interface TerminalInputModes {
  applicationCursor: boolean;
  bracketedPaste: boolean;
  backspace: "normal" | "control-h";
}

/** One line of scrollback, with the rows it covers when it wraps. */
export interface TerminalBufferLine {
  text: string;
  firstRow: number;
  lastRow: number;
}

export type PasswordFillResult = "filled" | "no-prompt" | "no-password";

/** Tools that draw their own UI inside the terminal. */
export type TerminalToolView =
  "find" | "findAll" | "watch" | "sendKey" | "resetShell";

export interface TerminalHandle {
  disconnect: () => void;
  reconnect: () => void;
  reconnectIfDisconnected: () => boolean;
  isConnected: () => boolean;
  fit: () => void;
  focus: () => void;
  /** Writes to this session only, for callers that pick their own targets. */
  sendInput: (data: string) => void;
  /** Input as if typed here, so a broadcast group gets it too. */
  typeInput: (data: string) => void;
  /** Input from a broadcast group. Kept in history, never sent on again. */
  injectInput: (data: string) => void;
  subscribeOutput: (listener: (data: string) => void) => () => void;
  /** Pass mirror for a paste the user made here, which a group should get too. */
  paste: (text: string, options?: { mirror?: boolean }) => void;
  notifyResize: () => void;
  refresh: () => void;
  getApplicationCursorKeysMode: () => boolean;
  getInputModes: () => TerminalInputModes;
  isAtPasswordPrompt: () => boolean;
  /** Answers a password prompt with this host's saved password. */
  fillPassword: () => Promise<PasswordFillResult>;
  readBufferLines: () => TerminalBufferLine[];
  getSelection: () => string;
  revealLines: (firstRow: number, lastRow: number) => void;
  clearScrollback: () => void;
  resetDisplay: () => void;
  openTool: (view: TerminalToolView) => void;
  getShareTarget: () => unknown;
  openFileManager: () => void;
  getCwd: () => Promise<string | null>;
}
