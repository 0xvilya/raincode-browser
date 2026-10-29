import { ipcRenderer } from "electron";
if (process.isMainFrame) {
  let busy = false;
  const valid = (input: HTMLInputElement) =>
    input.type === "password" &&
    input.getAttribute("autocomplete") !== "new-password" &&
    !input.disabled &&
    input.getClientRects().length > 0;
  const login = (form: HTMLFormElement) =>
    Array.from(form.querySelectorAll<HTMLInputElement>("input")).find(
      (i) => i.autocomplete === "username",
    ) ||
    Array.from(form.querySelectorAll<HTMLInputElement>("input")).find((i) =>
      ["text", "email"].includes(i.type),
    );
  function safe(form: HTMLFormElement) {
    try {
      return new URL(form.action || location.href).origin === location.origin;
    } catch {
      return false;
    }
  }
  document.addEventListener(
    "submit",
    (event) => {
      if (
        !event.isTrusted ||
        !navigator.userActivation.isActive ||
        busy ||
        !(event.target instanceof HTMLFormElement) ||
        !safe(event.target)
      )
        return;
      const form = event.target;
      const fields = Array.from(
        form.querySelectorAll<HTMLInputElement>('input[type="password"]'),
      );
      if (fields.length !== 1 || !fields[0].value || !valid(fields[0])) return;
      const user = login(form);
      if (
        !user?.value ||
        user.value.length > 512 ||
        fields[0].value.length > 2048
      )
        return;
      busy = true;
      void ipcRenderer
        .invoke("raincode:password", {
          action: "save",
          origin: location.origin,
          login: user.value,
          password: fields[0].value,
        })
        .catch(() => {})
        .finally(() => {
          busy = false;
        });
    },
    true,
  );
  document.addEventListener(
    "focusin",
    async (event) => {
      if (
        !event.isTrusted ||
        !navigator.userActivation.isActive ||
        busy ||
        !(event.target instanceof HTMLInputElement) ||
        !valid(event.target) ||
        event.target.value
      )
        return;
      const field = event.target,
        form = field.form;
      if (!form || !safe(form)) return;
      const url = location.href;
      busy = true;
      try {
        const result = await ipcRenderer.invoke("raincode:password", {
          action: "fill",
          origin: location.origin,
        });
        if (
          !result ||
          location.href !== url ||
          !field.isConnected ||
          !safe(form)
        )
          return;
        const user = login(form);
        if (!user) return;
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )!.set!;
        setter.call(user, result.login);
        setter.call(field, result.password);
        for (const input of [user, field]) {
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      } catch {
      } finally {
        busy = false;
      }
    },
    true,
  );
}
