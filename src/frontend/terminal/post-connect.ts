/**
 * Whether a "connected" message is a brand new shell. Env exports, the
 * startup snippet and auto mosh run only then, never on a reattach or when
 * joining someone else's session.
 */
export function shouldRunPostConnect(message: {
  newSession?: unknown;
}): boolean {
  return message.newSession === true;
}
