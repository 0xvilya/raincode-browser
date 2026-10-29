import http from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { command, expect, state, test } from "./fixtures";

test("AI panel makes no automatic request and chats through explicit local Ollama action", async ({
  rainBrowser: { shell },
}) => {
  const requests: string[] = [];
  let redirectNext = false;
  let holdClosed = false;
  const server = http.createServer(async (request, response) => {
    requests.push(`${request.method} ${request.url}`);
    if (request.url === "/api/tags") {
      if (redirectNext) {
        response.writeHead(302, { Location: "/redirect-target" }).end();
        return;
      }
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ models: [{ name: "fixture-model:1" }] }));
      return;
    }
    if (request.url === "/api/chat") {
      let body = "";
      for await (const chunk of request) body += chunk.toString();
      const input = JSON.parse(body) as {
        model: string;
        messages: { content: string }[];
      };
      expect(input.model).toBe("fixture-model:1");
      if (input.messages.at(-1)?.content === "Hold") {
        response.setHeader("Content-Type", "application/x-ndjson");
        response.write('{"message":{"content":"Waiting for stop"}}\n');
        const timer = setTimeout(
          () => response.end('{"message":{"content":" too late"}}\n'),
          5000,
        );
        response.once("close", () => {
          clearTimeout(timer);
          holdClosed = true;
        });
        return;
      }
      expect(input.messages.at(-1)?.content).toBe("Hello fixture");
      response.setHeader("Content-Type", "application/x-ndjson");
      response.write('{"message":{"content":"Hello"}}\n');
      response.end('{"message":{"content":" from RainCode"}}\n');
      return;
    }
    response.writeHead(404).end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const port = (server.address() as AddressInfo).port;
    await shell.getByRole("button", { name: "RainCode ИИ" }).click();
    const panel = shell.getByRole("complementary", { name: "RainCode ИИ" });
    await expect(panel).toBeVisible();
    expect(requests).toEqual([]);

    await panel.getByRole("button", { name: "Подключение" }).click();
    await panel.getByLabel("Адрес API").fill(`http://127.0.0.1:${port}`);
    await panel.getByLabel("Идентификатор модели").fill("fixture-model:1");
    await panel.getByRole("button", { name: "Сохранить подключение" }).click();
    await expect(panel.getByText(/Соединение не проверено/)).toBeVisible();
    expect(requests).toEqual([]);

    await panel.getByRole("button", { name: "Подключение" }).click();
    await panel
      .getByRole("button", { name: "Найти установленные модели Ollama" })
      .click();
    await expect(
      panel.getByRole("option", { name: "fixture-model:1", exact: true }),
    ).toBeAttached();
    expect(requests).toEqual(["GET /api/tags"]);
    await panel.getByRole("button", { name: "Проверить подключение" }).click();
    await expect(
      panel.getByText("Проверка подключения выбранной модели пройдена."),
    ).toBeVisible();

    await panel.getByRole("button", { name: "Чат" }).click();
    await panel
      .getByRole("textbox", { name: "Сообщение" })
      .fill("Hello fixture");
    await panel.getByRole("button", { name: "Отправить" }).click();
    await expect(panel.getByText("Hello from RainCode")).toBeVisible();
    await expect(panel.getByText("Модель настроена")).toBeVisible();
    expect(requests).toEqual([
      "GET /api/tags",
      "GET /api/tags",
      "POST /api/chat",
    ]);
    await shell.screenshot({ path: "artifacts/ai-panel.png" });
    await expect(
      panel.getByRole("button", {
        name: /Анализировать страницу|Посмотреть экран|Live/i,
      }),
    ).toHaveCount(0);

    const cloudId = randomUUID();
    const configured = await shell.evaluate(
      (config) => window.raincode.command({ type: "ai.provider.set", config }),
      {
        id: cloudId,
        profileId: "default",
        kind: "openai-compatible" as const,
        endpoint: "https://api.example.invalid/v1",
        model: "manual-model",
        vision: false,
      },
    );
    expect(configured.ok).toBe(true);
    const denied = await shell.evaluate(
      (id) =>
        window.raincode.command({
          type: "ai.chat.start",
          id,
          requestId: crypto.randomUUID(),
          messages: [{ role: "user", content: "must not send" }],
          cloudConsent: false,
        }),
      cloudId,
    );
    expect(denied.ok).toBe(false);
    expect(requests).toEqual([
      "GET /api/tags",
      "GET /api/tags",
      "POST /api/chat",
    ]);
    redirectNext = true;
    const redirected = await shell.evaluate(async () => {
      const providers = await window.raincode.command({
        type: "ai.providers.list",
      });
      const config = (providers.data as { id: string; kind: string }[]).find(
        (item) => item.kind === "ollama",
      )!;
      return window.raincode.command({ type: "ai.models.list", id: config.id });
    });
    expect(redirected.ok).toBe(false);
    expect(requests).not.toContain("GET /redirect-target");
    await panel.getByRole("textbox", { name: "Сообщение" }).fill("Hold");
    await panel.getByRole("button", { name: "Отправить" }).click();
    await expect(panel.getByText("Waiting for stop")).toBeVisible();
    await panel.getByRole("button", { name: "Остановить" }).click();
    await expect.poll(() => holdClosed).toBe(true);
    await expect(panel.getByText(/too late/)).toHaveCount(0);

    await command(shell, { type: "navigate", url: "raincode://privacy#ai" });
    const privacy = shell.locator('[data-privacy-section="ai"]');
    await expect(privacy).toBeVisible();
    await privacy
      .getByRole("switch", {
        name: "Разрешить облачных ИИ-провайдеров",
        exact: true,
      })
      .uncheck();
    const blockedCloud = await shell.evaluate(
      (id) =>
        window.raincode.command({
          type: "ai.chat.start",
          id,
          requestId: crypto.randomUUID(),
          messages: [{ role: "user", content: "blocked despite consent" }],
          cloudConsent: true,
        }),
      cloudId,
    );
    expect(blockedCloud).toMatchObject({
      ok: false,
      error: "AI_CLOUD_DISABLED",
    });
    // A live local stream is also stopped immediately by the master control.
    holdClosed = false;
    await panel.getByRole("textbox", { name: "Сообщение" }).fill("Hold");
    await panel.getByRole("button", { name: "Отправить" }).click();
    await expect
      .poll(() => requests.filter((value) => value === "POST /api/chat").length)
      .toBe(3);
    await privacy
      .getByRole("switch", { name: "Разрешить интеграции ИИ", exact: true })
      .uncheck();
    await expect.poll(() => holdClosed).toBe(true);
    const beforeDisabled = requests.length;
    const disabled = await shell.evaluate(async () => {
      const providers = await window.raincode.command({
        type: "ai.providers.list",
      });
      const id = (providers.data as { id: string; kind: string }[]).find(
        (value) => value.kind === "ollama",
      )!.id;
      return Promise.all([
        window.raincode.command({ type: "ai.models.list", id }),
        window.raincode.command({ type: "ai.provider.test", id }),
        window.raincode.command({
          type: "ai.chat.start",
          id,
          requestId: crypto.randomUUID(),
          messages: [{ role: "user", content: "blocked" }],
          cloudConsent: false,
        }),
      ]);
    });
    for (const result of disabled)
      expect(result).toMatchObject({ ok: false, error: "AI_DISABLED" });
    expect(requests).toHaveLength(beforeDisabled);
    expect((await state(shell)).settings.aiEnabled).toBe(false);
    expect((await state(shell)).settings.aiCloudEnabled).toBe(false);

    await panel.getByRole("button", { name: "Новый чат" }).click();
    await expect(panel.getByText("Hello from RainCode")).toHaveCount(0);
    await panel.getByRole("button", { name: "Подключение" }).click();
    await panel
      .getByRole("button", { name: "Удалить подключение и ключ" })
      .click();
    await expect(panel.getByText("Подключение и ключ удалены.")).toBeVisible();
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
