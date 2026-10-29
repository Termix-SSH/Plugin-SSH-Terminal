// zmodem.js ships no types.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import ZmodemModule from "zmodem.js/src/zmodem_browser";

/* eslint-disable @typescript-eslint/no-explicit-any */
const Zmodem = ZmodemModule as any;
type ZSession = any;
type ZDetection = any;
type ZSentry = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

export type ZmodemState =
  | { phase: "idle" }
  /** The host ran rz and waits for files from the browser. */
  | { phase: "choose" }
  | {
      phase: "sending" | "receiving";
      name: string;
      done: number;
      total: number;
    };

export interface ZmodemIo {
  /** Sends a socket message ({type: "zinput" | "zend", ...}). */
  send: (message: { type: string; data?: string }) => void;
  /** Writes bytes that are not part of a transfer to the terminal. */
  write: (bytes: Uint8Array) => void;
}

export function bytesToBase64(bytes: ArrayLike<number>): string {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(
      ...Array.prototype.slice.call(bytes, i, i + step),
    );
  }
  return btoa(binary);
}

export function base64ToBytes(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Runs rz and sz transfers for one terminal. The server sends "zdata" while
 * the shell talks ZMODEM; this answers with "zinput" and says "zend" once the
 * transfer is over, or when the bytes turned out not to be ZMODEM.
 */
export class ZmodemController {
  private io: ZmodemIo | null = null;
  private sentry: ZSentry | null = null;
  private session: ZSession | null = null;

  constructor(private readonly onState: (state: ZmodemState) => void) {}

  /** Starts fresh on a new socket. */
  attach(io: ZmodemIo): void {
    this.reset();
    this.io = io;
    this.sentry = new Zmodem.Sentry({
      to_terminal: (octets: number[]) =>
        this.io?.write(Uint8Array.from(octets)),
      sender: (octets: number[]) =>
        this.io?.send({ type: "zinput", data: bytesToBase64(octets) }),
      on_retract: () => this.finish(),
      on_detect: (detection: ZDetection) => this.start(detection),
    });
  }

  /** Bytes from a "zdata" frame. */
  feed(data: string): void {
    if (!this.sentry) return;
    try {
      this.sentry.consume(base64ToBytes(data));
    } catch {
      this.abort();
      return;
    }
    // A false start (output that only looked like ZMODEM) goes back to text.
    if (!this.session) this.io?.send({ type: "zend" });
  }

  /** Sends the picked files to the host's rz. */
  sendFiles(files: File[]): void {
    const session = this.session;
    if (!session || session.type !== "send") return;
    if (files.length === 0) {
      this.closeSend(session);
      return;
    }
    const total = files.reduce((sum, file) => sum + file.size, 0);
    let done = 0;
    this.onState({ phase: "sending", name: files[0].name, done, total });
    void Zmodem.Browser.send_files(session, files, {
      on_progress: (file: File, _xfer: unknown, piece: Uint8Array) => {
        done += piece.length;
        this.onState({ phase: "sending", name: file.name, done, total });
      },
    })
      .then(() => this.closeSend(session))
      .catch(() => this.abort());
  }

  /** Stops the transfer and tells the host. */
  abort(): void {
    try {
      this.session?.abort();
    } catch {
      // already over
    }
    this.finish();
  }

  dispose(): void {
    this.reset();
    this.io = null;
  }

  private closeSend(session: ZSession): void {
    // rz answers the close; give up waiting after a few seconds.
    const timer = setTimeout(() => {
      if (this.session === session) this.finish();
    }, 5000);
    Promise.resolve()
      .then(() => session.close())
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(timer);
        if (this.session === session) this.finish();
      });
  }

  private start(detection: ZDetection): void {
    const session: ZSession = detection.confirm();
    this.session = session;
    session.on("session_end", () => this.finish());
    if (session.type === "send") {
      this.onState({ phase: "choose" });
      return;
    }
    session.on("offer", (offer: ZSession) => {
      const details = offer.get_details() as { name: string; size?: number };
      const total = details.size ?? 0;
      let done = 0;
      this.onState({ phase: "receiving", name: details.name, done, total });
      offer.on("input", (payload: Uint8Array) => {
        done += payload.length;
        this.onState({ phase: "receiving", name: details.name, done, total });
      });
      offer
        .accept()
        .then(() =>
          Zmodem.Browser.save_to_disk(offer.get_payloads(), details.name),
        )
        .catch(() => undefined);
    });
    session.start();
  }

  private finish(): void {
    const wasActive = this.session !== null;
    this.session = null;
    this.onState({ phase: "idle" });
    if (wasActive) this.io?.send({ type: "zend" });
  }

  private reset(): void {
    this.session = null;
    this.sentry = null;
    this.onState({ phase: "idle" });
  }
}
