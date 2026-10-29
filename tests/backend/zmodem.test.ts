import { describe, expect, it } from "vitest";
import { decodeZmodemInput, ZmodemGate } from "../../src/backend/zmodem.js";

const SZ_START = Buffer.from("rz\r**\x18B00000000000000\r\x8a\x11", "latin1");

describe("ZmodemGate", () => {
  it("passes everything as text until the browser turns it on", () => {
    const gate = new ZmodemGate();
    expect(gate.split(SZ_START)).toEqual({ text: SZ_START });
    expect(gate.active).toBe(false);
  });

  it("switches to binary at the ZMODEM header and stays there", () => {
    const gate = new ZmodemGate();
    gate.enable(true);
    const first = gate.split(SZ_START);
    expect(first.text?.toString("latin1")).toBe("rz\r");
    expect(first.binary?.toString("latin1").startsWith("**\x18B0")).toBe(true);
    expect(gate.active).toBe(true);

    const next = Buffer.from([0x00, 0xff, 0x18]);
    expect(gate.split(next)).toEqual({ binary: next });

    gate.end();
    expect(gate.split(Buffer.from("ls\r\n"))).toEqual({
      text: Buffer.from("ls\r\n"),
    });
  });

  it("drops a transfer when turned off", () => {
    const gate = new ZmodemGate();
    gate.enable(true);
    gate.split(SZ_START);
    gate.enable(false);
    expect(gate.active).toBe(false);
  });

  it("only takes base64 input", () => {
    expect(decodeZmodemInput("AAEC")).toEqual(Buffer.from([0, 1, 2]));
    expect(decodeZmodemInput("not base64!")).toBeNull();
    expect(decodeZmodemInput(42)).toBeNull();
  });
});
