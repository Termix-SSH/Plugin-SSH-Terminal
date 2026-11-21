import { describe, expect, it } from "vitest";
import {
  createUploadedPathInput,
  quoteTerminalImagePath,
} from "../../../src/frontend/terminal/terminal-image-path";

describe("quoteTerminalImagePath", () => {
  it("preserves spaces as one shell argument", () => {
    expect(quoteTerminalImagePath("/mnt/my images/clipboard.png")).toBe(
      "'/mnt/my images/clipboard.png'",
    );
  });

  it("does not expose shell metacharacters as syntax", () => {
    expect(
      quoteTerminalImagePath("/tmp/$(touch /tmp/pwned);`id`; 'quoted'.png"),
    ).toBe("'/tmp/$(touch /tmp/pwned);`id`; '\\''quoted'\\''.png'");
  });

  it("quotes an empty path instead of returning executable input", () => {
    expect(quoteTerminalImagePath("")).toBe("''");
  });
});

describe("createUploadedPathInput", () => {
  /** Keys arrive from xterm one at a time. */
  function type(
    input: ReturnType<typeof createUploadedPathInput>,
    text: string,
  ) {
    for (const key of text) input.userTyped(key);
  }

  it("types the quoted path followed by a space", () => {
    expect(createUploadedPathInput().path("/tmp/my image.png")).toBe(
      "'/tmp/my image.png' ",
    );
  });

  it("keeps words and paths apart on both sides", () => {
    const input = createUploadedPathInput();
    let typed = "";
    type(input, "test");
    typed += "test" + input.path("/tmp/a.png");
    type(input, "test");
    typed += "test" + input.path("/tmp/b.csv");
    typed += input.path("/tmp/c.pdf");
    expect(typed).toBe("test '/tmp/a.png' test '/tmp/b.csv' '/tmp/c.pdf' ");
  });

  it("adds no second space after a typed space", () => {
    const input = createUploadedPathInput();
    type(input, "test ");
    expect(input.path("/tmp/a.png")).toBe("'/tmp/a.png' ");
  });

  it("follows Backspace", () => {
    const input = createUploadedPathInput();
    type(input, "test \x7f");
    expect(input.path("/tmp/a.png")).toBe(" '/tmp/a.png' ");
    input.userTyped("\x7f");
    expect(input.path("/tmp/b.png")).toBe(" '/tmp/b.png' ");
  });

  it("starts over after Enter, Tab or Ctrl+C", () => {
    for (const key of ["\r", "\t", "\x03"]) {
      const input = createUploadedPathInput();
      type(input, "test" + key);
      expect(input.path("/tmp/a.png")).toBe("'/tmp/a.png' ");
    }
  });

  it("ignores arrow keys, mouse reports and focus changes", () => {
    const input = createUploadedPathInput();
    type(input, "test");
    input.userTyped("\x1b[I");
    input.userTyped("\x1b[<0;10;5M");
    input.userTyped("\x1b[D");
    expect(input.path("/tmp/a.png")).toBe(" '/tmp/a.png' ");
  });

  it("counts a bracketed paste as typed text", () => {
    const input = createUploadedPathInput();
    input.userTyped("\x1b[200~see\x1b[201~");
    expect(input.path("/tmp/a.png")).toBe(" '/tmp/a.png' ");
  });
});
