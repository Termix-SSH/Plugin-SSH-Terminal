/** A host username of "$ask" means: ask who to log in as on every connect. */
export const ASK_USERNAME = "$ask";

const RECENT_MAX = 5;
const key = (hostId: unknown) => `termix.askUsername.${String(hostId ?? "")}`;

export function asksForUsername(username: unknown): boolean {
  return typeof username === "string" && username.trim() === ASK_USERNAME;
}

/** A login name a server would take: no spaces, quotes or control marks. */
export function validUsername(value: string): boolean {
  return /^[A-Za-z0-9_][A-Za-z0-9._@$-]{0,63}$/.test(value.trim());
}

export function recentUsernames(hostId: unknown): string[] {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(key(hostId)) ?? "[]",
    );
    return Array.isArray(parsed)
      ? parsed
          .filter((v): v is string => typeof v === "string")
          .slice(0, RECENT_MAX)
      : [];
  } catch {
    return [];
  }
}

export function rememberUsername(hostId: unknown, username: string): void {
  try {
    const next = [
      username,
      ...recentUsernames(hostId).filter((u) => u !== username),
    ];
    localStorage.setItem(
      key(hostId),
      JSON.stringify(next.slice(0, RECENT_MAX)),
    );
  } catch {
    // Storage can be blocked. Then nothing is remembered.
  }
}
