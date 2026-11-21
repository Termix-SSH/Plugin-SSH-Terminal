import { describe, expect, it } from "vitest";
import {
  isAskUsername,
  isValidLoginName,
} from "../../src/backend/ask-username.js";

describe("ask for username", () => {
  it("knows the marker", () => {
    expect(isAskUsername("$ask")).toBe(true);
    expect(isAskUsername(" $ask ")).toBe(true);
    expect(isAskUsername("root")).toBe(false);
  });

  it("takes plain login names only", () => {
    expect(isValidLoginName("site1-user")).toBe(true);
    expect(isValidLoginName("deploy@corp")).toBe(true);
    expect(isValidLoginName("-oProxyCommand")).toBe(false);
    expect(isValidLoginName("a b")).toBe(false);
    expect(isValidLoginName("$ask")).toBe(false);
    expect(isValidLoginName("")).toBe(false);
  });
});
