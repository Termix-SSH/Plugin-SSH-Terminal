/**
 * Sequences a program sends to ask the terminal something (device
 * attributes, cursor position, colors, versions). Live, the terminal answers
 * them; replayed on reattach it would answer again, and the answers land in
 * the shell as typed text (1;2c at the prompt). So they are taken out of the
 * replay. Nothing they draw is lost: they draw nothing.
 */
const QUERIES = [
  // DA1, DA2, DA3: ESC [ c, ESC [ > c, ESC [ = c (optional 0)
  /\x1b\[[>=]?0?c/g,
  // DSR status and cursor position: ESC [ 5 n, ESC [ 6 n, ESC [ ? 6 n
  /\x1b\[\??[56]n/g,
  // XTVERSION: ESC [ > q, ESC [ > 0 q
  /\x1b\[>0?q/g,
  // DECRQM: ESC [ ? Ps $ p and ESC [ Ps $ p
  /\x1b\[\??\d+\$p/g,
  // Kitty keyboard query: ESC [ ? u
  /\x1b\[\?u/g,
  // Window size reports: ESC [ 14 t, ESC [ 16 t, ESC [ 18 t
  /\x1b\[1[468]t/g,
  // OSC color queries: ESC ] 4;n;? / 10;? / 11;? / 12;? ending in BEL or ST
  /\x1b\](?:4;\d+|1[0-2]);\?(?:\x07|\x1b\\)/g,
  // DCS requests: XTGETTCAP (ESC P + q ...) and DECRQSS (ESC P $ q ...)
  /\x1bP[+$]q[^\x1b\x07]*(?:\x07|\x1b\\)/g,
];

export function stripTerminalQueries(data: string): string;
export function stripTerminalQueries(
  data: string | null | undefined,
): string | null | undefined;
export function stripTerminalQueries(
  data: string | null | undefined,
): string | null | undefined {
  if (!data || !data.includes("\x1b")) return data;
  let out = data;
  for (const query of QUERIES) out = out.replace(query, "");
  return out;
}
