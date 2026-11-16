export function getErrorMessage(
  error: unknown,
  fallback = "Unknown error",
): string {
  return error instanceof Error ? error.message : fallback;
}

/** A sign in link from the SSH server, only when it is a plain web address. */
export function safeSignInUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}
