import { WebContentsView, type Session } from "electron";

/** A session-scoped target is needed even when every page has been closed:
 * service workers can retain sockets after their last client disappears. */
export async function stopSessionWorkers(session: Session): Promise<void> {
  const controller = new WebContentsView({
    webPreferences: {
      session,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
    },
  });
  const contents = controller.webContents;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      (async () => {
        await contents.loadURL(
          'data:text/html;charset=utf-8,<meta http-equiv="Content-Security-Policy" content="default-src \'none\'">',
        );
        contents.debugger.attach("1.3");
        await contents.debugger.sendCommand("ServiceWorker.enable");
        await contents.debugger.sendCommand("ServiceWorker.stopAllWorkers");
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("NETWORK_STOP_FAILED")),
          4000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (!contents.isDestroyed()) {
      if (contents.debugger.isAttached()) contents.debugger.detach();
      contents.close({ waitForBeforeUnload: false });
    }
  }
}
