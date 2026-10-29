const PASSWORD_PROMPT =
  /(?:\[sudo\][^\n\r]*:\s*$|sudo:[^\n\r]*password[^\n\r]*required|password for [^\n\r]*:\s*$|Password:\s*$|password:\s*$)/im;

// macOS and BSD sudo only print "Password:", so the command and sudo's retry
// message are what tell it apart from an SSH login prompt.
const SUDO_OUTPUT = /\[sudo\b|sudo:|Sorry, try again/i;
const SUDO_COMMAND = /(?:^|[\s;&|(])sudo(?:\s|$)/;

/** Whether recent terminal output ends in a password prompt. */
export function isPasswordPrompt(output: string): boolean {
  return PASSWORD_PROMPT.test(output);
}

export function isSudoCommand(line: string): boolean {
  return SUDO_COMMAND.test(line);
}

/** Whether a password prompt comes from sudo. */
export function isSudoPrompt(output: string, lastCommand: string): boolean {
  return SUDO_OUTPUT.test(output) || isSudoCommand(lastCommand);
}

const SU_VALUE_OPTIONS = new Set([
  "-c",
  "--command",
  "-s",
  "--shell",
  "-g",
  "--group",
  "-G",
  "--supp-group",
  "-w",
  "--whitelist-environment",
]);

/**
 * The user a su command switches to (root when none is named), or null when
 * the line is not su. sudo su asks for the sudo password, so it is not su here.
 */
export function suTargetUser(line: string): string | null {
  const trimmed = line.trim();
  if (isSudoCommand(trimmed)) return null;
  const match = trimmed.match(/(?:^|[;&|(]\s*)su(?:\s+([^;&|]*))?$/);
  if (!match) return null;
  const args = (match[1] ?? "").trim().split(/\s+/).filter(Boolean);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (SU_VALUE_OPTIONS.has(arg)) {
      i++;
      continue;
    }
    if (arg.startsWith("-")) continue;
    return /^[a-z_][a-z0-9_.-]*\$?$/i.test(arg) ? arg : null;
  }
  return "root";
}

// Also covers charset switches like ESC ( B, which colored prompts end with,
// and OSC titles. Left in, they hide the prompt from the end-of-line match.
const ANSI =
  /\x1b(?:\][^\x07\x1b]*(?:\x07|\x1b\\)|[()#%*+][ -~]|[@-Z\\-_]|\[[0-9:;<=>?!]*[@-~])/g;

export function stripAnsi(output: string): string {
  return output.replace(ANSI, "");
}
