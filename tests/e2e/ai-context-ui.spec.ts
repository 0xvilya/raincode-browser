import http from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { command, expect, open, test } from "./fixtures";

test("AI sidebar previews the page, requires review, sends exactly the preview, and revokes page access", async ({
  rainBrowser: { app, shell },
}) => {
  const sent: { messages: { content: string }[] }[] = [];
  const server = http.createServer(async (request, response) => {
    if (request.url === "/api/chat") {
      let body = "";
      for await (const chunk of request) body += chunk.toString();
      sent.push(JSON.parse(body));
      response.setHeader("Content-Type", "application/x-ndjson");
      response.end('{"message":{"content":"Summary of public fixture"}}\n');
      return;
    }
    response.setHeader("Content-Type", "text/html;charset=utf-8");
    response.end(
      '<!doctype html><title>Public context fixture</title><main><h1>Public fixture content</h1><p>This content may be summarized.</p><form><input type="password" value="excluded-password-value"></form><script>const privateScript="excluded-script-value";</script></main>',
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({
        response: 2,
        checkboxChecked: false,
      });
    });
    const id = randomUUID();
    await command(shell, {
      type: "ai.provider.set",
      config: {
        id,
        profileId: "default",
        kind: "ollama",
        endpoint: origin,
        model: "owned-fixture",
        vision: false,
      },
    });
    await open(shell, `${origin}/article?session=excluded-query-value`);
    await shell.getByRole("button", { name: "RainCode ИИ" }).click();
    const panel = shell.getByRole("complementary", { name: "RainCode ИИ" });
    await panel
      .getByLabel("Выбрать настроенную модель", { exact: true })
      .selectOption(id);
    await command(shell, { type: "ai.context.revoke" });
    await panel
      .locator("summary")
      .filter({ hasText: "Контекст страницы" })
      .click();
    await panel
      .getByRole("button", { name: "Прочитать страницу для предпросмотра" })
      .click();
    const preview = panel.getByRole("textbox", {
      name: `Контекст страницы: ${origin}`,
      exact: true,
    });
    await expect(preview).toBeVisible();
    const payload = await preview.inputValue();
    expect(payload).toContain("Public fixture content");
    for (const secret of [
      "excluded-password-value",
      "excluded-script-value",
      "excluded-query-value",
    ])
      expect(payload).not.toContain(secret);
    expect(sent).toHaveLength(0);
    await panel.screenshot({ path: "artifacts/ai-context-preview.png" });
    await panel
      .getByRole("textbox", { name: "Сообщение", exact: true })
      .fill("Объясни страницу");
    await panel.getByRole("button", { name: "Отправить", exact: true }).click();
    await expect(panel.getByRole("status")).toHaveText(
      "Проверьте и подтвердите предпросмотр страницы перед отправкой.",
    );
    expect(sent).toHaveLength(0);
    await panel
      .getByLabel(
        "Я проверил фрагменты страниц и разрешаю включить их в этот запрос.",
      )
      .check();
    await panel.getByRole("button", { name: "Отправить", exact: true }).click();
    await expect(panel.getByText("Summary of public fixture")).toBeVisible();
    expect(sent).toHaveLength(1);
    expect(sent[0].messages.at(-1)?.content).toContain(payload);
    const audit = (await command(shell, { type: "security.audit" })).data as {
      aiAccess: { grants: number; pending: number };
    };
    expect(audit.aiAccess).toEqual({ grants: 1, pending: 0 });
    await panel
      .getByRole("button", { name: "Приватность", exact: true })
      .click();
    await panel
      .getByRole("button", {
        name: "Открыть конфиденциальность ИИ в разделе щита",
      })
      .click();
    await shell
      .locator('[data-privacy-section="ai"]')
      .getByRole("button", {
        name: "Остановить ИИ и отозвать контекст",
        exact: true,
      })
      .click();
    const cleared = (await command(shell, { type: "security.audit" })).data as {
      aiAccess: { grants: number; pending: number };
    };
    expect(cleared.aiAccess).toEqual({ grants: 0, pending: 0 });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
