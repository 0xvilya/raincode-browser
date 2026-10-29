import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { activeTab, command, expect, test } from "./fixtures";
test("password vault encrypts credentials, isolates profiles and confirms emergency erase", async ({
  rainBrowser: { app, shell, userData },
}) => {
  await command(shell, { type: "settings.update", settings: { locale: "en" } });
  await command(shell, { type: "tab.create", url: "raincode://privacy#sites" });
  const original = await activeTab(shell);
  await command(shell, {
    type: "vault.save",
    origin: "https://example.test/private",
    login: "private-login-fixture",
    password: "private-password-fixture",
  });
  const files = await readdir(path.join(userData, "password-vault"));
  expect(files.length).toBe(1);
  const encrypted = await readFile(
    path.join(userData, "password-vault", files[0]),
  );
  expect(encrypted.includes(Buffer.from("private-password-fixture"))).toBe(
    false,
  );
  expect(encrypted.includes(Buffer.from("private-login-fixture"))).toBe(false);
  const list = (await command(shell, { type: "vault.list" })).data as {
    id: string;
    origin: string;
    login: string;
  }[];
  expect(list[0].origin).toBe("https://example.test");
  expect(JSON.stringify(list)).not.toContain("private-password-fixture");
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = (async () => ({
      response: 0,
      checkboxChecked: false,
    })) as typeof dialog.showMessageBox;
  });
  expect((await command(shell, { type: "vault.erase" })).data).toEqual({
    cleared: false,
  });
  expect(
    ((await command(shell, { type: "vault.list" })).data as unknown[]).length,
  ).toBe(1);
  const other = await command(shell, {
    type: "profile.create",
    name: "Other vault",
    mode: "direct",
  });
  await command(shell, {
    type: "tab.create",
    profileId: other.data as string,
    url: "raincode://privacy#sites",
  });
  expect((await command(shell, { type: "vault.list" })).data).toEqual([]);
  await command(shell, { type: "tab.activate", id: original.id });
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = (async () => ({
      response: 1,
      checkboxChecked: false,
    })) as typeof dialog.showMessageBox;
  });
  expect(
    (await command(shell, { type: "vault.reveal", id: list[0].id })).data,
  ).toBe("private-password-fixture");
  expect((await command(shell, { type: "vault.erase" })).data).toEqual({
    cleared: true,
  });
  expect((await command(shell, { type: "vault.list" })).data).toEqual([]);
  await command(shell, {
    type: "vault.save",
    origin: "https://example.test",
    login: "again",
    password: "again",
  });
  expect((await command(shell, { type: "browser.erase" })).data).toEqual({
    cleared: true,
  });
  expect((await command(shell, { type: "vault.list" })).data).toEqual([]);
});
