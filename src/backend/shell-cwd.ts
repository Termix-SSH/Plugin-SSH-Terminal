/**
 * Prints the working directory of the interactive shell on the same SSH
 * connection. An exec channel starts in the home directory, but it shares
 * the connection's sshd process with the terminal's shell: walk up to that
 * sshd, find its child with a tty, and read the directory of the shell's
 * foreground process, or of the shell itself. Falls back to the exec's own
 * directory where /proc is missing (macOS, BSD). Runs under sh, whatever the
 * login shell is.
 */
const SCRIPT = [
  "p=$PPID; i=0; found=;",
  "while [ $i -lt 4 ]; do",
  'case "$(ps -o comm= -p "$p" 2>/dev/null)" in *sshd*) found=1; break;; esac;',
  'p=$(ps -o ppid= -p "$p" 2>/dev/null | tr -d " "); i=$((i+1));',
  "done;",
  '[ -n "$found" ] || { pwd; exit 0; };',
  'for c in $(ps -o pid= --ppid "$p" 2>/dev/null); do',
  't=$(ps -o tty= -p "$c" 2>/dev/null | tr -d " ");',
  'if [ -z "$t" ] || [ "$t" = "?" ]; then continue; fi;',
  'f=$(ps -o tpgid= -p "$c" 2>/dev/null | tr -d " ");',
  'd=$(readlink "/proc/$f/cwd" 2>/dev/null || readlink "/proc/$c/cwd" 2>/dev/null);',
  'if [ -n "$d" ]; then echo "$d"; exit 0; fi;',
  "done; pwd",
].join(" ");

export const SHELL_CWD_COMMAND = `sh -c '${SCRIPT}'`;
