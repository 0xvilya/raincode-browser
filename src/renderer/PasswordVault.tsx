import { useEffect, useState } from "react";
import type { BrowserState } from "../shared/contracts";
import { send } from "./store";
export function PasswordVault({ browser }: { browser: BrowserState }) {
  const profile = browser.tabs.find(
    (t) => t.id === browser.activeTabId,
  )?.profileId;
  const [entries, setEntries] = useState<
    { id: string; origin: string; login: string }[]
  >([]);
  const [search, setSearch] = useState("");
  const [origin, setOrigin] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [revealed, setRevealed] = useState("");
  const [notice, setNotice] = useState("");
  const ru = browser.settings.locale === "ru";
  useEffect(() => {
    setEntries([]);
    setOrigin("");
    setLogin("");
    setPassword("");
    setRevealed("");
    setNotice("");
  }, [profile]);
  useEffect(() => {
    if (!revealed) return;
    const timer = setTimeout(() => setRevealed(""), 15000);
    return () => clearTimeout(timer);
  }, [revealed]);
  async function run(
    type: "vault.list" | "vault.save" | "vault.erase" | "browser.erase",
  ) {
    setRevealed("");
    setNotice("");
    const result = await send(
      type === "vault.save" ? { type, origin, login, password } : { type },
    );
    if (!result.ok) {
      setNotice(
        ru
          ? "Операция не выполнена: проверьте адрес и доступность защищённого хранилища (лимит записи 1 МиБ)"
          : "Operation failed: check the URL and protected storage availability (1 MiB vault limit)",
      );
      return;
    }
    if (type === "vault.list") setEntries(result.data as typeof entries);
    else {
      setEntries([]);
      setPassword("");
      setNotice(
        ru
          ? "Операция завершена или отменена в диалоге"
          : "Operation completed or cancelled in dialog",
      );
    }
  }
  return (
    <section
      id="rain-password-vault"
      tabIndex={-1}
      className="section"
      aria-label="Password vault"
    >
      <h3>{ru ? "Локальный менеджер паролей" : "Local password manager"}</h3>
      <p className="hint">
        {ru
          ? "Логины и пароли шифруются системным хранилищем Windows и остаются на компьютере. Отдельное хранилище каждого профиля. Сохранение после отправки формы и заполнение при фокусе на пароле — с подтверждением. Только HTTPS и локальные сайты, обычный профиль. Защита не распространяется на вредоносные программы под вашей учётной записью. Очистка не гарантирует физическое стирание с SSD."
          : "Logins and passwords are encrypted by OS storage and stay on this computer, separately for each profile. Save after form submission and fill on password focus require confirmation. HTTPS and loopback sites, direct profiles only. This does not protect against malware running as your OS user or guarantee physical SSD erasure."}
      </p>
      <label className="field">
        URL
        <input
          aria-label="Vault URL"
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
        />
      </label>
      <label className="field">
        {ru ? "Логин" : "Login"}
        <input
          aria-label="Vault login"
          autoComplete="off"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
        />
      </label>
      <label className="field">
        {ru ? "Пароль" : "Password"}
        <input
          aria-label="Vault password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <div className="button-row">
        <button
          className="button"
          disabled={!origin || !password}
          onClick={() => void run("vault.save")}
        >
          {ru ? "Сохранить пароль" : "Save password"}
        </button>
        <button className="button" onClick={() => void run("vault.list")}>
          {ru ? "Открыть хранилище" : "Open vault"}
        </button>
        <button
          className="button"
          onClick={() => {
            setEntries([]);
            setRevealed("");
            setPassword("");
          }}
        >
          {ru ? "Скрыть пароли" : "Hide passwords"}
        </button>
      </div>
      <label className="field">
        {ru ? "Поиск по сайту или логину" : "Search site or login"}
        <input value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>
      {entries
        .filter((e) =>
          (e.origin + " " + e.login)
            .toLowerCase()
            .includes(search.toLowerCase()),
        )
        .map((entry) => (
          <div className="list-row" key={entry.id}>
            <span>
              {entry.origin} · {entry.login}
            </span>
            <button
              className="button"
              onClick={async () => {
                const result = await send({
                  type: "vault.reveal",
                  id: entry.id,
                });
                if (result.ok && typeof result.data === "string")
                  setRevealed(result.data);
              }}
            >
              {ru ? "Показать на 15 секунд" : "Reveal for 15 seconds"}
            </button>
            <button
              className="button"
              onClick={() => {
                setOrigin(entry.origin);
                setLogin(entry.login);
                setPassword("");
              }}
            >
              {ru ? "Изменить" : "Edit"}
            </button>
            <button
              className="button"
              onClick={async () => {
                await send({ type: "vault.delete", id: entry.id });
                await run("vault.list");
              }}
            >
              {ru ? "Удалить запись" : "Delete entry"}
            </button>
          </div>
        ))}
      {revealed && <output aria-label="Revealed password">{revealed}</output>}
      <p role="status">{notice}</p>
      <div className="button-row">
        <button className="button" onClick={() => void run("vault.erase")}>
          {ru
            ? "Экстренно удалить все пароли"
            : "Emergency delete all passwords"}
        </button>
        <button className="button" onClick={() => void run("browser.erase")}>
          {ru
            ? "Очистить данные всех профилей"
            : "Clear browsing data in all profiles"}
        </button>
      </div>
    </section>
  );
}
