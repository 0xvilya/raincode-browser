import http from "node:http";
import { once } from "node:events";
import {
  activeTab,
  command,
  expect,
  open,
  pageContentsId,
  state,
  test,
} from "./fixtures";

let origin = "";
let server: http.Server;
test.beforeAll(async () => {
  server = http.createServer((request, response) => {
    if (request.url === "/slow") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.write("<!doctype html><title>Slow loading fixture</title>");
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(
      `<!doctype html><title>Omnibox ${request.url}</title><h1>Real browser fixture</h1><input aria-label="Website text">`,
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No fixture listener");
  origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("omnibox retains rapid Latin/Cyrillic input, selection, composition and Escape", async ({
  rainBrowser: { app, shell },
}) => {
  await open(shell, `${origin}/initial`);
  const input = shell.getByRole("combobox");
  await input.click();
  await input.press("Control+a");
  await input.pressSequentially("fastInput-123456789", { delay: 1 });
  await shell.keyboard.insertText(" Кириллица пример.рф");
  await expect(input).toHaveValue("fastInput-123456789 Кириллица пример.рф");
  expect(
    await input.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        filter: style.filter,
        backdropFilter: style.backdropFilter,
        transform: style.transform,
        fontWeight: style.fontWeight,
        letterSpacing: style.letterSpacing,
      };
    }),
  ).toEqual({
    filter: "none",
    backdropFilter: "none",
    transform: "none",
    fontWeight: "400",
    letterSpacing: "normal",
  });
  // State publication from another feature must not overwrite an in-progress draft.
  await command(shell, {
    type: "settings.update",
    settings: { widgets: false },
  });
  await expect(input).toHaveValue("fastInput-123456789 Кириллица пример.рф");
  await input.press("ArrowLeft");
  await input.press("Shift+ArrowLeft");
  expect(
    await input.evaluate((node: HTMLInputElement) =>
      node.value.slice(node.selectionStart!, node.selectionEnd!),
    ),
  ).toBe("р");
  const before = (await activeTab(shell)).url;
  await input.dispatchEvent("compositionstart");
  await input.fill("日本語");
  await input.press("Enter");
  expect((await activeTab(shell)).url).toBe(before);
  await input.dispatchEvent("compositionend", { data: "日本語" });
  await input.press("Escape");
  await expect(input).toHaveValue(before);
  await expect(input).not.toBeFocused();
  const contentsId = await pageContentsId(app, before);
  const nativeShortcut = async (keyCode: string) =>
    app.evaluate(
      ({ webContents }, { contentsId, keyCode }) => {
        const contents = webContents.fromId(contentsId)!;
        contents.sendInputEvent({
          type: "keyDown",
          keyCode,
          modifiers: ["control"],
        });
        contents.sendInputEvent({
          type: "keyUp",
          keyCode,
          modifiers: ["control"],
        });
      },
      { contentsId, keyCode },
    );
  await nativeShortcut("L");
  await expect(input).toBeFocused();
  expect(
    await input.evaluate(
      (node: HTMLInputElement) => node.selectionEnd! - node.selectionStart!,
    ),
  ).toBe(before.length);
  await nativeShortcut("K");
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("");
  await expect(shell.getByRole("dialog")).toHaveCount(0);
});

test("Enter, AltEnter, local suggestions and effects perform real actions", async ({
  rainBrowser: { shell },
}) => {
  const input = shell.getByRole("combobox");
  await input.fill(`${origin}/typed`);
  await input.press("Enter");
  await expect
    .poll(async () => (await activeTab(shell)).url)
    .toBe(`${origin}/typed`);
  await command(shell, {
    type: "bookmark.toggle",
    url: `${origin}/suggested`,
    title: "Local suggestion",
  });
  await input.fill("Local suggestion");
  await expect(shell.getByRole("option")).toHaveCount(1);
  await input.press("ArrowDown");
  await expect(shell.getByRole("option")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await input.press("Enter");
  await expect
    .poll(async () => (await activeTab(shell)).url)
    .toBe(`${origin}/suggested`);
  await expect.poll(async () => (await activeTab(shell)).loading).toBe(false);
  const count = (await state(shell)).tabs.length;
  await input.fill(`${origin}/new-tab`);
  await expect(input).toHaveValue(`${origin}/new-tab`);
  await input.press("Alt+Enter");
  await expect
    .poll(async () => (await state(shell)).tabs.length)
    .toBe(count + 1);
  await expect
    .poll(async () => (await activeTab(shell)).url)
    .toBe(`${origin}/new-tab`);
  await input.fill("/rain");
  await input.press("Enter");
  await expect.poll(async () => (await state(shell)).settings.rain).toBe("off");
  await expect(shell.getByTestId("rain-canvas")).toHaveAttribute(
    "data-running",
    "false",
  );
});

test("recently closed, history and spaces have independent routes and restore chosen tab", async ({
  rainBrowser: { shell },
}) => {
  await open(shell, `${origin}/restore-me`);
  const closed = await activeTab(shell);
  await command(shell, { type: "tab.create", url: "raincode://newtab" });
  await command(shell, { type: "tab.close", id: closed.id });
  await command(shell, { type: "navigate", url: "raincode://recently-closed" });
  await expect(
    shell.getByRole("heading", { name: "Недавно закрытые", exact: true }),
  ).toBeVisible();
  await expect(
    shell.getByText(`${origin}/restore-me`, { exact: true }),
  ).toBeVisible();
  await shell
    .getByRole("button", { name: "Вернуть закрытую вкладку", exact: true })
    .click();
  await expect
    .poll(async () => (await activeTab(shell)).url)
    .toBe(`${origin}/restore-me`);
  await command(shell, { type: "navigate", url: "raincode://history" });
  await expect(
    shell.getByRole("heading", { name: "История", exact: true }),
  ).toBeVisible();
  await command(shell, { type: "navigate", url: "raincode://workspaces" });
  await expect(
    shell.getByRole("heading", { name: "Пространства", exact: true, level: 1 }),
  ).toBeVisible();
});

test("suggestions wrap from an unselected row and CtrlEnter preserves explicit URLs", async ({
  rainBrowser: { shell },
}) => {
  for (const label of ["first", "second", "third"])
    await command(shell, {
      type: "bookmark.toggle",
      url: `${origin}/${label}`,
      title: `Keyboard fixture ${label}`,
    });
  const input = shell.getByRole("combobox");
  await input.fill("Keyboard fixture");
  const options = shell.getByRole("option");
  await expect(options).toHaveCount(3);
  await input.press("ArrowUp");
  await expect(options.last()).toHaveAttribute("aria-selected", "true");
  await input.press("ArrowDown");
  await expect(options.first()).toHaveAttribute("aria-selected", "true");
  await input.press("Enter");
  await expect
    .poll(async () => (await activeTab(shell)).url)
    .toBe(`${origin}/first`);
  await expect.poll(async () => (await activeTab(shell)).loading).toBe(false);
  await input.fill(`${origin}/ctrl-enter`);
  await expect(input).toHaveValue(`${origin}/ctrl-enter`);
  await input.press("Control+Enter");
  await expect
    .poll(async () => (await activeTab(shell)).url)
    .toBe(`${origin}/ctrl-enter`);
});

test("Tor page reports unavailable components or a stopped daemon without auto connecting", async ({
  rainBrowser: { shell },
}) => {
  await command(shell, { type: "navigate", url: "raincode://tor" });
  await expect(
    shell.getByRole("heading", { name: "RAIN SHIELD", exact: true }),
  ).toBeVisible();
  const tor = (await state(shell)).tor;
  if (tor?.bundled) {
    expect(tor.status).toBe("stopped");
    await expect(
      shell.getByRole("button", { name: "Запустить Tor", exact: true }),
    ).toBeEnabled();
    await expect(
      shell.getByRole("button", { name: "Остановить Tor", exact: true }),
    ).toBeDisabled();
    await expect(
      shell.getByRole("button", { name: "Новая цепочка Tor", exact: true }),
    ).toBeDisabled();
  } else {
    await expect(
      shell.getByText("Проверенный компонент Tor недоступен", { exact: false }),
    ).toBeVisible();
    await expect(
      shell.getByRole("button", { name: "Запустить Tor", exact: true }),
    ).toHaveCount(0);
  }
});

test("Escape in browser chrome stops loading while omnibox Escape only cancels editing", async ({
  rainBrowser: { shell },
}) => {
  await command(shell, { type: "navigate", url: `${origin}/slow` });
  await expect.poll(async () => (await activeTab(shell)).loading).toBe(true);
  const input = shell.getByRole("combobox");
  await input.fill("cancel this edit");
  await input.press("Escape");
  await expect(input).toHaveValue(`${origin}/slow`);
  expect((await activeTab(shell)).loading).toBe(true);
  await shell
    .locator(".navigation")
    .getByRole("button", { name: "Главная", exact: true })
    .focus();
  await shell.keyboard.press("Escape");
  await expect.poll(async () => (await activeTab(shell)).loading).toBe(false);
});
