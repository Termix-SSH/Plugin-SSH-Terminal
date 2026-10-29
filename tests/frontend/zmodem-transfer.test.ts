import { describe, expect, it } from "vitest";
import {
  base64ToBytes,
  bytesToBase64,
  ZmodemController,
  type ZmodemState,
} from "../../src/frontend/terminal/zmodem-transfer";

const latin1 = (text: string) =>
  bytesToBase64(Array.from(text, (c) => c.charCodeAt(0)));

function setUp() {
  const states: ZmodemState[] = [];
  const sent: Array<{ type: string; data?: string }> = [];
  const written: Uint8Array[] = [];
  const controller = new ZmodemController((state) => states.push(state));
  controller.attach({
    send: (message) => sent.push(message),
    write: (bytes) => written.push(bytes),
  });
  return { controller, states, sent, written };
}

describe("ZmodemController", () => {
  it("round trips base64", () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255]);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(
      Array.from(bytes),
    );
  });

  it("hands back output that only looked like ZMODEM", () => {
    const { controller, sent, written } = setUp();
    controller.feed(latin1("plain text"));
    expect(new TextDecoder().decode(written[0])).toBe("plain text");
    expect(sent).toEqual([{ type: "zend" }]);
  });

  it("answers sz with ZRINIT and shows a download", () => {
    const { controller, sent, states } = setUp();
    controller.feed(latin1("**\x18B00000000000000\r\x8a\x11"));
    const zinput = sent.find((m) => m.type === "zinput");
    expect(zinput).toBeDefined();
    const reply = String.fromCharCode(...base64ToBytes(zinput!.data!));
    // ZRINIT is header type 01.
    expect(reply.startsWith("**\x18B01")).toBe(true);
    expect(sent.some((m) => m.type === "zend")).toBe(false);
    controller.abort();
    expect(states.at(-1)).toEqual({ phase: "idle" });
    expect(sent.at(-1)).toEqual({ type: "zend" });
  });

  it("asks for files when the host runs rz", async () => {
    const { controller, states, sent } = setUp();
    // ZRINIT from rz: flags say it can take full duplex and overlap.
    controller.feed(latin1("**\x18B0100000023be50\r\x8a\x11"));
    expect(states.at(-1)).toEqual({ phase: "choose" });
    const before = sent.length;
    controller.sendFiles([]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    // No files: the session closes with ZFIN (header type 08).
    const replies = sent
      .slice(before)
      .filter((m) => m.type === "zinput")
      .map((m) => String.fromCharCode(...base64ToBytes(m.data!)));
    expect(replies.some((r) => r.includes("**\x18B08"))).toBe(true);
    controller.abort();
    expect(states.at(-1)).toEqual({ phase: "idle" });
  });
});
