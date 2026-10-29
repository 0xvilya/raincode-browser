import { create } from "zustand";
import type {
  BrowserState,
  Command,
  CommandResult,
  RaincodeAPI,
} from "../shared/contracts";

declare global {
  interface Window {
    raincode: RaincodeAPI;
  }
}

interface UIState {
  browser: BrowserState | null;
  toast: string;
  navigationError: string | null;
  setNavigationError: (error: string | null) => void;
  developerTargetId: string;
  aiReviewDraft: { profileId: string; text: string } | null;
  setAiReviewDraft: (draft: { profileId: string; text: string } | null) => void;
  setDeveloperTargetId: (id: string) => void;
  setBrowser: (browser: BrowserState) => void;
  setToast: (toast: string) => void;
}
export const useBrowser = create<UIState>((set) => ({
  browser: null,
  toast: "",
  navigationError: null,
  setNavigationError: (navigationError) => set({ navigationError }),
  developerTargetId: "",
  aiReviewDraft: null,
  setAiReviewDraft: (aiReviewDraft) => set({ aiReviewDraft }),
  setDeveloperTargetId: (id) => set({ developerTargetId: id }),
  setBrowser: (browser) => set({ browser }),
  setToast: (toast) => set({ toast }),
}));
export async function send(command: Command): Promise<CommandResult> {
  try {
    const result = await window.raincode.command(command);
    if (!result.ok) {
      if (
        (command.type === "navigate" || command.type === "tab.create") &&
        result.errorCode
      )
        useBrowser
          .getState()
          .setNavigationError(result.error || result.errorCode);
      else useBrowser.getState().setToast(result.error || "IPC error");
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    useBrowser.getState().setToast(message);
    return { ok: false, error: message };
  }
}
