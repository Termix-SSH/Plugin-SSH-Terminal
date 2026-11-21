import { beforeEach, describe, expect, it } from "vitest";
import {
  asksForUsername,
  recentUsernames,
  rememberUsername,
  validUsername,
} from "../../../src/frontend/terminal/ask-username";

beforeEach(() => localStorage.clear());

describe("ask for username", () => {
  it("asks only for the $ask marker", () => {
    expect(asksForUsername("$ask")).toBe(true);
    expect(asksForUsername("root")).toBe(false);
    expect(asksForUsername(undefined)).toBe(false);
  });

  it("checks names and keeps the last five per host, newest first", () => {
    expect(validUsername("site-1")).toBe(true);
    expect(validUsername("-x")).toBe(false);
    for (const name of ["a", "b", "c", "d", "e", "f", "a"]) {
      rememberUsername(7, name);
    }
    expect(recentUsernames(7)).toEqual(["a", "f", "e", "d", "c"]);
    expect(recentUsernames(8)).toEqual([]);
  });
});
