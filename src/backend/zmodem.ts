/**
 * ZMODEM (rz/sz from lrzsz) sends raw bytes that UTF-8 text frames would
 * mangle. When the shell starts a transfer, the session switches to base64
 * "zdata" frames until the browser says the transfer is over with "zend".
 */

/** The start of a ZMODEM hex header, which both sz and rz send first. */
export const ZMODEM_START = Buffer.from("**\x18B0", "latin1");

export interface ZmodemSplit {
  /** Bytes before the transfer, still shown as text. */
  text?: Buffer;
  /** Bytes for the browser's ZMODEM handler. */
  binary?: Buffer;
}

export class ZmodemGate {
  private enabled = false;
  private transferring = false;

  /** Only a browser that said it handles ZMODEM gets binary frames. */
  enable(on: boolean): void {
    this.enabled = on;
    if (!on) this.transferring = false;
  }

  get active(): boolean {
    return this.transferring;
  }

  end(): void {
    this.transferring = false;
  }

  split(data: Buffer): ZmodemSplit {
    if (!this.enabled) return { text: data };
    if (this.transferring) return { binary: data };
    const at = data.indexOf(ZMODEM_START);
    if (at < 0) return { text: data };
    this.transferring = true;
    return {
      ...(at > 0 ? { text: data.subarray(0, at) } : {}),
      binary: data.subarray(at),
    };
  }
}

/** Raw bytes from a "zinput" frame, or null when it is not base64. */
export function decodeZmodemInput(data: unknown): Buffer | null {
  if (typeof data !== "string" || data.length === 0) return null;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data)) return null;
  return Buffer.from(data, "base64");
}
