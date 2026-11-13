import { describe, expect, it } from "vitest";
import { authFollowUp } from "../../src/backend/helpers.js";

describe("authFollowUp", () => {
  const context = { error: new Error("denied"), retries: 0 };

  it("answers the same for a provider in core and one in a plugin process", async () => {
    const outcome = { status: "interaction-required", message: "Sign in" };
    await expect(authFollowUp(() => outcome, context)).resolves.toBe(outcome);
    await expect(authFollowUp(async () => outcome, context)).resolves.toBe(
      outcome,
    );
  });

  it("means nothing without a hook or when the hook fails", async () => {
    await expect(authFollowUp(undefined, context)).resolves.toBeUndefined();
    await expect(
      authFollowUp(async () => {
        throw new Error("gone");
      }, context),
    ).resolves.toBeUndefined();
    await expect(
      authFollowUp(() => {
        throw new Error("gone");
      }, context),
    ).resolves.toBeUndefined();
  });
});
