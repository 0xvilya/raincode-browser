import { z } from "zod";
import { permissionPolicySchema } from "./security-center";
import { privacyConfigSchema, defaultPrivacyConfig } from "./privacy-policy";
import { aiProviderConfigSchema, type AiChatEvent } from "./ai-types";

export const internalPages = [
  "newtab",
  "settings",
  "privacy",
  "security",
  "network",
  "tor",
  "downloads",
  "history",
  "recently-closed",
  "bookmarks",
  "extensions",
  "workspaces",
  "system",
  "licenses",
  "about",
  "devpanel",
] as const;
export type Mode = "direct" | "proxy" | "private" | "tor";
export const privacySections = [
  "general",
  "monitor",
  "protection",
  "sites",
  "security",
  "tor",
  "network",
  "dns",
  "ai",
] as const;
export type PrivacySection = (typeof privacySections)[number];
export const settingsSchema = z.object({
  locale: z.enum(["ru", "en"]),
  searchTemplate: z.string().max(2048),
  torSearchTemplate: z
    .string()
    .max(2048)
    .default("https://html.duckduckgo.com/html/?q={query}"),
  adBlock: z.boolean().default(true),
  aiEnabled: z.boolean().default(true),
  aiCloudEnabled: z.boolean().default(true),
  privacy: privacyConfigSchema.default(defaultPrivacyConfig),
  trackerExceptions: z
    .array(
      z
        .string()
        .max(253)
        .regex(
          /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i,
        )
        .transform((host) => host.toLowerCase()),
    )
    .max(100)
    .default([]),
  historyEnabled: z.boolean(),
  networkKillSwitch: z.boolean().default(false),
  httpsOnly: z.boolean().default(true),
  motionPreference: z.enum(["system", "full", "reduced"]).default("system"),
  restoreSession: z.boolean(),
  clearOnExit: z.boolean(),
  rain: z.enum(["off", "low", "medium", "high", "cinematic"]),
  fps: z.number().int().min(15).max(60),
  parallax: z.boolean(),
  blur: z.boolean(),
  powerSave: z.boolean(),
  performanceMode: z.enum(["eco", "balanced", "ultra"]).default("balanced"),
  graphicsEnabled: z.boolean().default(true),
  autoSleepMinutes: z
    .union([
      z.literal(0),
      z.literal(5),
      z.literal(15),
      z.literal(30),
      z.literal(60),
    ])
    .default(0),
  highContrast: z.boolean(),
  transparency: z.boolean(),
  widgets: z.boolean(),
  verticalTabs: z.boolean(),
  verticalTabsCollapsed: z.boolean().default(false),
  theme: z.enum(["london", "midnight", "fog", "amber", "graphite", "contrast"]),
  customColors: z.boolean().default(false),
  sceneArtwork: z.enum(["realistic", "vector"]).default("realistic"),
  shellColor: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .default("#244b68"),
  accentColor: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .default("#a2d3cc"),
  scene: z
    .enum([
      "london",
      "tokyo",
      "newyork",
      "paris",
      "cyber",
      "space",
      "forest",
      "mountain",
      "ocean",
      "sakura",
      "minimal-dark",
      "minimal-light",
    ])
    .default("london"),
  fontSize: z.number().int().min(12).max(20),
  brightness: z.number().min(0.2).max(1),
  dnsMode: z.enum(["system", "secure"]),
  dohTemplate: z.string().max(1024),
  bokeh: z.boolean().default(true),
  glow: z.boolean().default(true),
  cinematic: z.boolean().default(true),
  devToolsMode: z
    .enum(["detach", "right", "bottom", "undocked"])
    .default("detach"),
});
export type Settings = z.infer<typeof settingsSchema>;
// Defaults migrate stored settings, but must NEVER be inserted into an IPC
// patch: changing the theme must not silently disable the network kill switch.
type PatchShape<T extends z.ZodRawShape> = {
  [K in keyof T]: z.ZodOptional<
    T[K] extends z.ZodDefault<infer Inner> ? Inner : T[K]
  >;
};
const settingsPatchSchema = z
  .object(
    Object.fromEntries(
      Object.entries(settingsSchema.shape).map(([key, schema]) => [
        key,
        (schema instanceof z.ZodDefault
          ? schema.removeDefault()
          : schema
        ).optional(),
      ]),
    ) as PatchShape<typeof settingsSchema.shape>,
  )
  .strict();
export const defaultSettings: Settings = {
  locale: "ru",
  searchTemplate: "https://duckduckgo.com/?q={query}",
  torSearchTemplate: "https://html.duckduckgo.com/html/?q={query}",
  adBlock: true,
  aiEnabled: true,
  aiCloudEnabled: true,
  privacy: defaultPrivacyConfig,
  trackerExceptions: [],
  historyEnabled: true,
  networkKillSwitch: false,
  httpsOnly: true,
  motionPreference: "system",
  restoreSession: true,
  clearOnExit: false,
  rain: "medium",
  fps: 30,
  parallax: true,
  blur: true,
  powerSave: false,
  performanceMode: "balanced",
  graphicsEnabled: true,
  autoSleepMinutes: 0,
  highContrast: false,
  transparency: true,
  widgets: true,
  verticalTabs: false,
  verticalTabsCollapsed: false,
  theme: "london",
  customColors: false,
  sceneArtwork: "realistic",
  shellColor: "#244b68",
  accentColor: "#a2d3cc",
  scene: "london",
  fontSize: 14,
  brightness: 0.7,
  dnsMode: "system",
  dohTemplate: "",
  bokeh: true,
  glow: true,
  cinematic: true,
  devToolsMode: "detach",
};
export interface Tab {
  id: string;
  title: string;
  url: string;
  profileId: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  pinned: boolean;
  muted: boolean;
  zoom: number;
  error?: string;
  notice?: "not-found" | "empty-search";
  favicon?: string;
  group?: string;
  suspended?: boolean;
  keepAwake?: boolean;
  closedAt?: number;
  navigation?: { entries: { url: string; title: string }[]; index: number };
  timeline?: {
    entries: { url: string; title: string; nativeIndex?: number }[];
    index: number;
  };
}
export interface Profile {
  id: string;
  name: string;
  mode: Mode;
  hasCredentials?: boolean;
  /** Persisted fail-closed latch for an interrupted proxy reconfiguration. */
  proxyBlocked?: boolean;
  proxy?: {
    scheme: "socks5" | "http" | "https";
    host: string;
    port: number;
    bypassLocal: boolean;
  };
}
export interface Visit {
  id: string;
  url: string;
  title: string;
  visitedAt: number;
  profileId: string;
}
export interface Bookmark {
  id: string;
  url: string;
  title: string;
  createdAt: number;
}
export interface Download {
  id: string;
  name: string;
  url: string;
  received: number;
  total: number;
  status: string;
  path: string;
}
export interface Workspace {
  id: string;
  name: string;
  urls: string[];
  profileId: string;
  notes: string;
  snippets: string;
  theme: Settings["theme"];
  projectPath?: string;
}
export interface Permission {
  origin: string;
  permission: string;
  profileId: string;
  allowed: boolean;
  updatedAt?: number;
}
export interface BrowserState {
  privacyMonitorTabId?: string;
  devState?: Record<
    string,
    { offline: boolean; slow: boolean; mobile: boolean; noCache: boolean }
  >;
  secretsAvailable?: boolean;
  windowFocused?: boolean;
  tabs: Tab[];
  activeTabId: string;
  splitTabId?: string;
  splitPrimaryId?: string;
  splitOrientation?: "horizontal" | "vertical";
  splitRatio?: number;
  settings: Settings;
  profiles: Profile[];
  history: Visit[];
  bookmarks: Bookmark[];
  downloads: Download[];
  recentlyClosed: Tab[];
  workspaces: Workspace[];
  permissions: Permission[];
  notes: string;
  snippets: string;
  projectPath?: string;
  appVersion: string;
  chromiumVersion: string;
  platform: string;
  tor?: TorState;
}
export interface TorState {
  status: "stopped" | "starting" | "bootstrapping" | "ready" | "error";
  progress: number;
  message: string;
  bundled: boolean;
  version: string;
  socksPort?: number;
  error?: string;
  phase?: string;
  reason?: string;
  problems?: number;
  recommendation?: string;
}
const id = z.string().min(1).max(100);
const url = z.string().min(1).max(8192);
function proxyHostURL(host: string): URL {
  const address =
    host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return new URL(`http://${address}:1`);
}
export const proxySchema = z
  .object({
    scheme: z.enum(["socks5", "http", "https"]),
    host: z
      .string()
      .min(1)
      .max(253)
      .regex(/^[a-zA-Z0-9.:[\]-]+$/)
      .refine((host) => {
        try {
          const parsed = proxyHostURL(host);
          return (
            parsed.port === "1" &&
            (parsed.hostname.startsWith("[") ||
              parsed.hostname === host.toLowerCase())
          );
        } catch {
          return false;
        }
      })
      .transform((host) => proxyHostURL(host).hostname),
    port: z.number().int().min(1).max(65535),
    bypassLocal: z.boolean(),
  })
  .strict();
export const commandSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("tab.create"),
      url: url.optional(),
      profileId: id.optional(),
    })
    .strict(),
  z.object({ type: z.literal("tab.activate"), id }).strict(),
  z.object({ type: z.literal("tab.close"), id }).strict(),
  z.object({ type: z.literal("tab.duplicate"), id }).strict(),
  z.object({ type: z.literal("tab.restore"), id: id.optional() }).strict(),
  z
    .object({
      type: z.literal("tab.update"),
      id,
      pinned: z.boolean().optional(),
      muted: z.boolean().optional(),
      keepAwake: z.boolean().optional(),
      group: z.string().max(32).optional(),
    })
    .strict(),
  z
    .object({ type: z.literal("tab.reorder"), ids: z.array(id).max(100) })
    .strict(),
  z.object({ type: z.literal("tab.suspend"), id }).strict(),
  z.object({ type: z.literal("navigate"), url }).strict(),
  z
    .object({
      type: z.literal("action"),
      action: z.enum([
        "back",
        "forward",
        "reload",
        "hardReload",
        "stop",
        "home",
        "devtools",
        "print",
        "save",
        "source",
        "fullscreen",
        "zoomIn",
        "zoomOut",
        "zoomReset",
        "minimize",
        "maximize",
        "close",
        "project",
        "exportSettings",
        "importSettings",
      ]),
    })
    .strict(),
  z
    .object({
      type: z.literal("layout"),
      bounds: z.object({
        x: z.number().int().min(0).max(16000),
        y: z.number().int().min(0).max(16000),
        width: z.number().int().min(0).max(16000),
        height: z.number().int().min(0).max(16000),
      }),
      overlay: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("bookmark.toggle"),
      url: url.optional(),
      title: z.string().max(1000).optional(),
    })
    .strict(),
  z.object({ type: z.literal("bookmark.remove"), id }).strict(),
  z.object({ type: z.literal("vault.delete"), id: z.string().uuid() }).strict(),
  z.object({ type: z.literal("vault.list") }).strict(),
  z
    .object({
      type: z.literal("vault.save"),
      origin: z.string().url().max(2048),
      login: z.string().max(512),
      password: z.string().min(1).max(2048),
    })
    .strict(),
  z.object({ type: z.literal("vault.reveal"), id: z.string().uuid() }).strict(),
  z.object({ type: z.literal("vault.erase") }).strict(),
  z.object({ type: z.literal("browser.erase") }).strict(),
  z.object({ type: z.literal("history.clear") }).strict(),
  z
    .object({
      type: z.literal("settings.update"),
      settings: settingsPatchSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("profile.create"),
      name: z.string().min(1).max(60),
      mode: z.enum(["direct", "proxy", "private"]),
      proxy: proxySchema.optional(),
    })
    .strict(),
  z.object({ type: z.literal("profile.delete"), id }).strict(),
  z.object({ type: z.literal("proxy.test"), profileId: id }).strict(),
  z
    .object({
      type: z.literal("proxy.update"),
      profileId: id,
      proxy: proxySchema,
    })
    .strict(),
  z.object({ type: z.literal("proxy.disconnect") }).strict(),
  z
    .object({
      type: z.literal("proxy.credentials.set"),
      profileId: id,
      username: z.string().min(1).max(512),
      password: z.string().max(2048),
    })
    .strict(),
  z
    .object({ type: z.literal("proxy.credentials.clear"), profileId: id })
    .strict(),
  z.object({ type: z.literal("site.clear"), origin: url.optional() }).strict(),
  z
    .object({
      type: z.literal("permission.revoke"),
      origin: url,
      permission: z.string().max(100),
      profileId: id,
    })
    .strict(),
  z
    .object({
      type: z.literal("find"),
      text: z.string().max(1000),
      forward: z.boolean().optional(),
    })
    .strict(),
  permissionPolicySchema,
  z.object({ type: z.literal("security.audit") }).strict(),
  z.object({ type: z.literal("security.cookies"), tabId: id }).strict(),
  z
    .object({
      type: z.literal("security.headers"),
      action: z.enum(["start", "read", "stop"]),
      tabId: id.optional(),
    })
    .strict(),
  z.object({ type: z.literal("ai.providers.list") }).strict(),
  z
    .object({
      type: z.literal("ai.provider.set"),
      config: aiProviderConfigSchema,
      key: z.string().min(1).max(16384).optional(),
    })
    .strict(),
  z
    .object({ type: z.literal("ai.provider.remove"), id: z.string().uuid() })
    .strict(),
  z
    .object({ type: z.literal("ai.models.list"), id: z.string().uuid() })
    .strict(),
  z
    .object({
      type: z.literal("ai.chat.start"),
      id: z.string().uuid(),
      requestId: z.string().uuid(),
      messages: z
        .array(
          z
            .object({
              role: z.enum(["user", "assistant"]),
              content: z.string().min(1).max(65536),
            })
            .strict(),
        )
        .min(1)
        .max(16),
      cloudConsent: z.boolean(),
      contextTickets: z.array(z.string().uuid()).max(2).optional(),
      contextConfirmed: z.boolean().optional(),
    })
    .strict(),
  z.object({ type: z.literal("ai.chat.cancel") }).strict(),
  z
    .object({
      type: z.literal("ai.context.collect"),
      id: z.string().uuid(),
      tabId: id,
      kind: z.enum(["page", "css"]).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("ai.context.discard"),
      ticket: z.string().uuid(),
    })
    .strict(),
  z.object({ type: z.literal("ai.context.revoke") }).strict(),
  z
    .object({ type: z.literal("ai.provider.test"), id: z.string().uuid() })
    .strict(),
  z
    .object({
      type: z.literal("pane.assign"),
      pane: z.enum(["first", "second"]),
      tabId: id,
    })
    .strict(),
  z.object({ type: z.literal("split"), id: id.optional() }).strict(),
  z
    .object({
      type: z.literal("split.configure"),
      orientation: z.enum(["horizontal", "vertical"]).optional(),
      ratio: z.number().min(0.25).max(0.75).optional(),
      swap: z.boolean().optional(),
    })
    .strict(),
  z.object({ type: z.literal("pane.navigate"), tabId: id, url }).strict(),
  z
    .object({
      type: z.literal("pane.action"),
      tabId: id,
      action: z.enum([
        "back",
        "forward",
        "reload",
        "stop",
        "devtools",
        "zoomIn",
        "zoomOut",
      ]),
    })
    .strict(),
  z.object({ type: z.literal("dev.info"), tabId: id.optional() }).strict(),
  z
    .object({
      type: z.literal("dev.diagnostics"),
      tabId: id.optional(),
      registration: z.boolean().default(false),
    })
    .strict(),
  z.object({ type: z.literal("dev.command.cancel") }).strict(),
  z
    .object({
      type: z.literal("clipboard.write"),
      text: z.string().max(1048576),
    })
    .strict(),
  z.object({ type: z.literal("page.original") }).strict(),
  z.object({ type: z.literal("privacy.trackers") }).strict(),
  z.object({ type: z.literal("privacy.monitor.start"), tabId: id }).strict(),
  z.object({ type: z.literal("privacy.monitor.stop") }).strict(),
  z.object({ type: z.literal("privacy.monitor.snapshot") }).strict(),
  z.object({ type: z.literal("privacy.trackers.clear") }).strict(),
  z
    .object({
      type: z.literal("dev.tools"),
      mode: z.enum(["detach", "right", "bottom", "undocked"]),
      tabId: id.optional(),
    })
    .strict(),
  z.object({ type: z.literal("dev.tree") }).strict(),
  z
    .object({ type: z.literal("dev.read"), path: z.string().min(1).max(4096) })
    .strict(),
  z
    .object({
      type: z.literal("dev.snippet"),
      code: z.string().min(1).max(100000),
      tabId: id.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("dev.command"),
      command: z.string().min(1).max(4096),
    })
    .strict(),
  z.object({ type: z.literal("dev.har"), tabId: id.optional() }).strict(),
  z.object({ type: z.literal("dev.network"), tabId: id.optional() }).strict(),
  z
    .object({
      type: z.literal("dev.recording"),
      tabId: id.optional(),
      enabled: z.boolean(),
    })
    .strict(),
  z.object({ type: z.literal("tor.start") }).strict(),
  z.object({ type: z.literal("tor.stop") }).strict(),
  z.object({ type: z.literal("tor.circuit") }).strict(),
  z.object({ type: z.literal("tor.identity") }).strict(),
  z.object({ type: z.literal("tor.clear") }).strict(),
  z
    .object({
      type: z.literal("dev.configure"),
      tabId: id.optional(),
      offline: z.boolean().optional(),
      slow: z.boolean().optional(),
      userAgent: z.string().max(500).optional(),
      mobile: z.boolean().optional(),
      noCache: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("dev.css"),
      css: z.string().max(100000),
      tabId: id.optional(),
    })
    .strict(),
  z.object({ type: z.literal("dev.ports") }).strict(),
  z.object({ type: z.literal("dev.tasks") }).strict(),
  z
    .object({
      type: z.literal("notes.save"),
      notes: z.string().max(100000),
      snippets: z.string().max(100000),
    })
    .strict(),
  z
    .object({
      type: z.literal("workspace.save"),
      name: z.string().min(1).max(60),
    })
    .strict(),
  z.object({ type: z.literal("workspace.open"), id }).strict(),
  z.object({ type: z.literal("workspace.delete"), id }).strict(),
  z.object({ type: z.literal("download.reveal"), id }).strict(),
  z.object({ type: z.literal("download.cancel"), id }).strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export interface CommandResult {
  ok: boolean;
  error?: string;
  errorCode?: "ONION_INVALID" | "URL_INVALID" | "SEARCH_INVALID";
  data?: unknown;
}
export interface RaincodeAPI {
  getState(): Promise<BrowserState>;
  command(command: Command): Promise<CommandResult>;
  onState(callback: (state: BrowserState) => void): () => void;
  onShortcut(callback: (action: string) => void): () => void;
  onAI(callback: (event: AiChatEvent) => void): () => void;
}
