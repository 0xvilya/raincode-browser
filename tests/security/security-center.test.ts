import { describe, expect, it } from "vitest";
import { commandSchema } from "../../src/shared/contracts";
describe("Security Center IPC", () => {
  const policy = {
    type: "permission.set",
    profileId: "default",
    origin: "https://example.com",
    permission: "notifications",
    decision: "deny",
  };
  it("accepts canonical, scoped site policy and a data-free audit", () => {
    expect(commandSchema.safeParse(policy).success).toBe(true);
    expect(commandSchema.safeParse({ type: "security.audit" }).success).toBe(
      true,
    );
  });
  it.each([
    "file:///etc/passwd",
    "https://user:secret@example.com",
    "https://example.com/path",
    "https://example.com/?token=secret",
    "null",
  ])("rejects non-origin %s", (origin) => {
    expect(commandSchema.safeParse({ ...policy, origin }).success).toBe(false);
  });
  it("rejects privileged capabilities, missing scopes and extra data", () => {
    expect(
      commandSchema.safeParse({ ...policy, permission: "screenCapture" })
        .success,
    ).toBe(false);
    expect(commandSchema.safeParse({ ...policy, profileId: "" }).success).toBe(
      false,
    );
    expect(
      commandSchema.safeParse({ ...policy, apiKey: "secret" }).success,
    ).toBe(false);
    expect(
      commandSchema.safeParse({ type: "security.audit", execute: "code" })
        .success,
    ).toBe(false);
  });
});
