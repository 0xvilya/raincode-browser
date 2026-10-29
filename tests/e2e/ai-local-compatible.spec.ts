import http from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { command, expect, test } from "./fixtures";

test("local compatible AI works with cloud disabled and refuses foreign profile discovery", async ({
  rainBrowser: { shell },
}) => {
  const requests: string[] = [];
  const server = http.createServer((request, response) => {
    requests.push(request.url || "");
    if (request.url === "/v1/models")
      response
        .setHeader("Content-Type", "application/json")
        .end('{"data":[{"id":"owned-model"}]}');
    else
      response
        .writeHead(200, { "Content-Type": "text/event-stream" })
        .end(
          'data: {"choices":[{"delta":{"content":"Local compatible response"}}]}\n\ndata: [DONE]\n',
        );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("port");
    await command(shell, {
      type: "settings.update",
      settings: { locale: "en", aiCloudEnabled: false },
    });
    await shell
      .getByRole("button", { name: "RainCode AI", exact: true })
      .click();
    const panel = shell.getByRole("complementary", { name: "RainCode AI" });
    await panel
      .getByRole("button", { name: "Connection", exact: true })
      .click();
    await panel
      .getByLabel("Provider", { exact: true })
      .selectOption("local-openai");
    await panel
      .getByLabel("API endpoint", { exact: true })
      .fill(`http://127.0.0.1:${address.port}/v1`);
    await panel
      .getByLabel("Model identifier", { exact: true })
      .fill("owned-model");
    await panel
      .getByRole("button", { name: "Save connection", exact: true })
      .click();
    await expect(panel.getByText(/Configuration saved/)).toBeVisible();
    expect(requests).toEqual([]);
    await panel
      .getByRole("button", { name: "Connection", exact: true })
      .click();
    await panel
      .getByRole("button", { name: "Test connection", exact: true })
      .click();
    await expect(
      panel.getByText("Connection test passed for the selected model."),
    ).toBeVisible();
    await panel.getByRole("button", { name: "Chat", exact: true }).click();
    await panel.locator("#rain-ai-prompt").fill("Hello local");
    await panel.getByRole("button", { name: "Send", exact: true }).click();
    await expect(
      panel.getByText("Local compatible response", { exact: true }),
    ).toBeVisible();
    expect(requests).toEqual(["/v1/models", "/v1/chat/completions"]);
    const foreign = await command(shell, {
      type: "profile.create",
      name: "Foreign AI",
      mode: "direct",
    });
    const config = {
      id: randomUUID(),
      profileId: foreign.data as string,
      kind: "local-openai" as const,
      endpoint: `http://127.0.0.1:${address.port}/v1`,
      model: "owned-model",
      vision: false,
    };
    await command(shell, {
      type: "tab.create",
      profileId: config.profileId,
      url: "raincode://newtab",
    });
    expect((await command(shell, { type: "ai.provider.set", config })).ok).toBe(
      true,
    );
    await command(shell, {
      type: "tab.create",
      profileId: "default",
      url: "raincode://newtab",
    });
    expect(
      (
        await shell.evaluate(
          (id) => window.raincode.command({ type: "ai.models.list", id }),
          config.id,
        )
      ).ok,
    ).toBe(false);
    expect(requests).toHaveLength(2);
    const listed = await command(shell, { type: "ai.providers.list" });
    expect(JSON.stringify(listed.data)).not.toContain(config.id);
    const denied = await shell.evaluate(
      async (config) => [
        await window.raincode.command({
          type: "ai.provider.remove",
          id: config.id,
        }),
        await window.raincode.command({ type: "ai.provider.set", config }),
        await window.raincode.command({
          type: "ai.provider.set",
          config: { ...config, profileId: "default" },
        }),
      ],
      config,
    );
    expect(denied.every((result) => !result.ok)).toBe(true);
    await command(shell, {
      type: "tab.create",
      profileId: config.profileId,
      url: "raincode://newtab",
    });
    expect(
      JSON.stringify(
        (await command(shell, { type: "ai.providers.list" })).data,
      ),
    ).toContain(config.id);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
