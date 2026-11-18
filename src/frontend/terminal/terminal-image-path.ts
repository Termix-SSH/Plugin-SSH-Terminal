/**
 * Return an absolute POSIX path as one safe shell argument for terminal input.
 *
 * The backend already constrains this to an absolute agent-visible path. This
 * helper handles spaces and shell metacharacters at the final terminal-input
 * boundary so configured paths cannot become shell syntax.
 */
export function quoteTerminalImagePath(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

const BRACKETED_PASTE = /^\x1b\[200~([\s\S]*)\x1b\[201~$/;

/**
 * Types uploaded paths into one terminal so each is a separate argument. A
 * path is quoted and followed by a space, and gets a space in front too when
 * it comes right after a word the user typed (`explain '/tmp/x.png' `).
 *
 * `userTyped` follows the end of what the user types: text, pastes and
 * Backspace. Enter, Tab and Ctrl keys start over, since the line is then new
 * or unknown. Other escape sequences, like arrow keys, mouse reports and
 * focus changes, are ignored.
 */
export function createUploadedPathInput() {
  let line = "";
  const append = (text: string) => {
    line = (line + text).slice(-64);
  };
  return {
    userTyped(data: string) {
      if (data.startsWith("\x1b")) {
        const paste = BRACKETED_PASTE.exec(data);
        if (!paste) return;
        data = paste[1];
      }
      for (const char of data) {
        if (char === "\x7f" || char === "\b") {
          line = line.slice(0, -1);
        } else if (char < " ") {
          line = "";
          if (char === "\x1b") return;
        } else {
          append(char);
        }
      }
    },
    path(path: string): string {
      const input =
        (/\S$/.test(line) ? " " : "") + quoteTerminalImagePath(path) + " ";
      append(input);
      return input;
    },
  };
}
