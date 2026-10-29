import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { commandSchema } from "../../src/shared/contracts";

describe("AI IPC boundary", () => {
  const chat = {
    type: "ai.chat.start",
    id: randomUUID(),
    requestId: randomUUID(),
    messages: [{ role: "user", content: "hello" }],
    cloudConsent: false,
  };

  it("requires an explicit cloud-consent boolean and bounds chat input", () => {
    expect(commandSchema.safeParse(chat).success).toBe(true);
    expect(
      commandSchema.safeParse({ ...chat, cloudConsent: undefined }).success,
    ).toBe(false);
    expect(
      commandSchema.safeParse({ ...chat, cloudConsent: "yes" }).success,
    ).toBe(false);
    expect(
      commandSchema.safeParse({
        ...chat,
        messages: [{ role: "user", content: "x".repeat(65537) }],
      }).success,
    ).toBe(false);
  });

  it("rejects extra secret and context fields in chat commands", () => {
    expect(commandSchema.safeParse({ ...chat, apiKey: "secret" }).success).toBe(
      false,
    );
    expect(
      commandSchema.safeParse({ ...chat, pageHtml: "<body>private</body>" })
        .success,
    ).toBe(false);
  });
});
