import { z } from "zod";

export const sitePermissionKeys = [
  "media:video",
  "media:audio",
  "geolocation",
  "notifications",
  "clipboard-read",
  "clipboard-sanitized-write",
  "midi",
  "midiSysex",
  "local-fonts",
  "speaker-selection",
  "fullscreen",
  "pointerLock",
  "geolocation-approximate",
  "deprecated-sync-clipboard-read",
] as const;
export type SitePermission = (typeof sitePermissionKeys)[number];
export const permissionPolicySchema = z
  .object({
    type: z.literal("permission.set"),
    profileId: z.string().min(1).max(100),
    origin: z
      .string()
      .max(2048)
      .refine((value) => {
        try {
          const url = new URL(value);
          return (
            ["http:", "https:"].includes(url.protocol) && url.origin === value
          );
        } catch {
          return false;
        }
      }),
    permission: z.enum(sitePermissionKeys),
    decision: z.enum(["ask", "deny", "allow", "once"]),
    tabId: z.string().min(1).max(100).optional(),
  })
  .strict();

export interface SecurityAudit {
  preferenceSource: "creation-options";
  capturedAt: number;
  pages: {
    tabId?: string;
    profileId: string;
    origin: string;
    shell: boolean;
    sandbox: boolean;
    contextIsolation: boolean;
    nodeIntegration: boolean;
    webSecurity: boolean;
    javascript: boolean;
  }[];
  unsafeFlags: {
    sandbox: boolean;
    webSecurity: boolean;
    tls: boolean;
    isolation: boolean;
  };
  profileIsolation: boolean | null;
  protectedStorageAvailable: boolean;
  ipc: "validated-shell-only";
  screenCapture: "denied";
  webFileAccess: "native-picker-only";
  popups: "validated-tabs";
  cookies: "profile-partitioned-engine-default";
  ai:
    | "not-connected-no-context-access"
    | "text-chat-only-no-page-access"
    | "chat-with-consented-page-context";
  aiAccess: { grants: number; pending: number };
  once: {
    profileId: string;
    origin: string;
    permission: SitePermission;
    tabId: string;
  }[];
}
