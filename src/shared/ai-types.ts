import { z } from "zod";

/** These permissions are independent of permissions granted to a website. */
export const aiCapabilities = [
  "pageContext",
  "screenshot",
  "consoleAnalysis",
  "networkAnalysis",
  "selectedCode",
  "liveScreen",
  "cloudUpload",
] as const;
export type AiCapability = (typeof aiCapabilities)[number];

export const aiScopeSchema = z
  .object({
    profileId: z.string().min(1).max(100),
    tabId: z.string().min(1).max(100),
    documentId: z.string().min(1).max(100),
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
  })
  .strict();
export type AiScope = z.infer<typeof aiScopeSchema>;

export const aiProviderConfigSchema = z
  .object({
    id: z.string().uuid(),
    profileId: z.string().min(1).max(100),
    kind: z.enum(["openai-compatible", "ollama", "local-openai"]),
    endpoint: z.string().url().max(2048),
    model: z.string().trim().min(1).max(150),
    vision: z.boolean(),
    maxContext: z.number().int().min(1024).max(1_000_000).optional(),
  })
  .strict();
export type AiProviderConfig = z.infer<typeof aiProviderConfigSchema>;
export function isLocalAiProvider(
  config: Pick<AiProviderConfig, "kind"> | undefined,
): boolean {
  return config?.kind === "ollama" || config?.kind === "local-openai";
}

export interface AiChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiChatEvent {
  requestId: string;
  type: "delta" | "done" | "error";
  text?: string;
  error?: string;
}
export interface AiContextPreview {
  ticket: string;
  tabId: string;
  origin: string;
  title: string;
  preview: string;
  expiresAt: number;
}
