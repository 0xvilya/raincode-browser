import { contextBridge, ipcRenderer } from "electron";
import type { BrowserState, Command, RaincodeAPI } from "../shared/contracts";
import type { AiChatEvent } from "../shared/ai-types";
const api: RaincodeAPI = {
  onAI: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, event: AiChatEvent) =>
      callback(event);
    ipcRenderer.on("raincode:ai", listener);
    return () => ipcRenderer.removeListener("raincode:ai", listener);
  },
  getState: () => ipcRenderer.invoke("raincode:state:get"),
  command: (command: Command) =>
    ipcRenderer.invoke("raincode:command", command),
  onState: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: BrowserState) =>
      callback(state);
    ipcRenderer.on("raincode:state", listener);
    return () => ipcRenderer.removeListener("raincode:state", listener);
  },
  onShortcut: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, action: string) =>
      callback(action);
    ipcRenderer.on("raincode:shortcut", listener);
    return () => ipcRenderer.removeListener("raincode:shortcut", listener);
  },
};
contextBridge.exposeInMainWorld("raincode", Object.freeze(api));
