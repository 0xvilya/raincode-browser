import { createHash } from "node:crypto";
import {
  aiProviderConfigSchema,
  type AiChatMessage,
  type AiProviderConfig,
} from "../../shared/ai-types";
import type { SecretStore } from "../secret-store";

export interface AiTransportRequest {
  profileId: string;
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
  signal: AbortSignal;
  maxResponseBytes: number;
}
export interface AiTransportResponse {
  status: number;
  /** The transport MUST refuse redirects; a changed URL is also rejected here. */
  url: string;
  body: AsyncIterable<Uint8Array>;
}
/**
 * Inject a profile-bound Electron session transport. No Node fetch fallback is
 * provided: routing must be checked by the caller before any request.
 */
export type AiTransport = (
  request: AiTransportRequest,
) => Promise<AiTransportResponse>;

const RESPONSE_LIMIT = 1024 * 1024;
const OUTPUT_LIMIT = 64 * 1024;
const INPUT_LIMIT = 64 * 1024;
const MODEL_LIST_LIMIT = 500;
const REQUEST_TIMEOUT_MS = 120_000;

function endpoint(config: AiProviderConfig): URL {
  const url = new URL(config.endpoint);
  if (url.username || url.password || url.search || url.hash)
    throw new Error("AI_ENDPOINT_INVALID");
  if (config.kind === "ollama") {
    if (
      url.protocol !== "http:" ||
      !["127.0.0.1", "[::1]"].includes(url.hostname) ||
      !["", "/"].includes(url.pathname)
    )
      throw new Error("AI_OLLAMA_LOOPBACK_REQUIRED");
  } else if (config.kind === "local-openai") {
    if (
      url.protocol !== "http:" ||
      !["127.0.0.1", "[::1]"].includes(url.hostname)
    )
      throw new Error("AI_OLLAMA_LOOPBACK_REQUIRED");
  } else if (url.protocol !== "https:") {
    throw new Error("AI_HTTPS_REQUIRED");
  }
  return url;
}

function endpointPath(base: URL, path: string): string {
  const url = new URL(base.href);
  url.pathname = `${url.pathname.replace(/\/$/, "")}${path}`;
  return url.href;
}

function secretId(id: string): string {
  return `ai_${createHash("sha256").update(id).digest("hex").slice(0, 40)}`;
}

async function* lines(
  body: AsyncIterable<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<string> {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let pending = "";
  let bytes = 0;
  for await (const chunk of body) {
    if (signal.aborted) throw new Error("AI_REQUEST_ABORTED");
    if (!(chunk instanceof Uint8Array)) throw new Error("AI_RESPONSE_INVALID");
    bytes += chunk.length;
    if (bytes > RESPONSE_LIMIT) throw new Error("AI_RESPONSE_TOO_LARGE");
    pending += decoder.decode(chunk, { stream: true });
    if (pending.length > RESPONSE_LIMIT)
      throw new Error("AI_RESPONSE_TOO_LARGE");
    let index: number;
    while ((index = pending.indexOf("\n")) >= 0) {
      yield pending.slice(0, index).replace(/\r$/, "");
      pending = pending.slice(index + 1);
    }
  }
  pending += decoder.decode();
  if (pending) yield pending;
}

async function boundedJSON(
  body: AsyncIterable<Uint8Array>,
  signal: AbortSignal,
): Promise<unknown> {
  const parts: string[] = [];
  for await (const line of lines(body, signal)) parts.push(line);
  return JSON.parse(parts.join("\n")) as unknown;
}

function assertMessages(messages: AiChatMessage[]): void {
  if (!Array.isArray(messages) || !messages.length || messages.length > 16)
    throw new Error("AI_MESSAGES_INVALID");
  let bytes = 0;
  for (const message of messages) {
    if (
      !message ||
      !["user", "assistant"].includes(message.role) ||
      typeof message.content !== "string" ||
      !message.content.trim()
    )
      throw new Error("AI_MESSAGES_INVALID");
    bytes += Buffer.byteLength(message.content, "utf8");
    if (bytes > INPUT_LIMIT) throw new Error("AI_INPUT_TOO_LARGE");
  }
}

export class AiProviderManager {
  private configs = new Map<string, AiProviderConfig>();
  private active = false;
  constructor(
    private readonly secrets: Pick<SecretStore, "set" | "get" | "delete">,
    private readonly transport: AiTransport,
  ) {}

  /** Never returns or persists a plaintext key in browser settings/state. */
  async configure(
    raw: AiProviderConfig,
    key?: string,
  ): Promise<AiProviderConfig> {
    const config = aiProviderConfigSchema.parse(raw);
    endpoint(config);
    if (key !== undefined) {
      if (config.kind === "ollama" || !key || Buffer.byteLength(key) > 16_384)
        throw new Error("AI_KEY_INVALID");
      await this.secrets.set(secretId(config.id), key);
    }
    this.configs.set(config.id, { ...config });
    return { ...config };
  }

  list(): AiProviderConfig[] {
    return [...this.configs.values()].map((config) => ({ ...config }));
  }

  async remove(id: string): Promise<void> {
    this.configs.delete(id);
    await this.secrets.delete(secretId(id));
  }

  /** Trigger only from explicit user action; never poll Ollama on panel mount. */
  async listOllama(id: string, signal: AbortSignal): Promise<string[]> {
    const config = this.configs.get(id);
    if (!config || config.kind !== "ollama")
      throw new Error("AI_PROVIDER_INVALID");
    const url = endpointPath(endpoint(config), "/api/tags");
    const response = await this.request({
      profileId: config.profileId,
      url,
      method: "GET",
      headers: { Accept: "application/json" },
      signal,
      maxResponseBytes: RESPONSE_LIMIT,
    });
    const parsed = await boundedJSON(response.body, signal);
    if (!parsed || typeof parsed !== "object" || !("models" in parsed))
      throw new Error("AI_MODEL_LIST_INVALID");
    const models = (parsed as { models: unknown }).models;
    if (!Array.isArray(models) || models.length > MODEL_LIST_LIMIT)
      throw new Error("AI_MODEL_LIST_INVALID");
    return models
      .map((item) =>
        item && typeof item === "object" && "name" in item
          ? (item as { name: unknown }).name
          : undefined,
      )
      .filter(
        (name): name is string =>
          typeof name === "string" && name.length <= 150,
      );
  }

  async listLocalModels(id: string, signal: AbortSignal): Promise<string[]> {
    const config = this.configs.get(id);
    if (config?.kind === "ollama") return this.listOllama(id, signal);
    if (!config || config.kind !== "local-openai")
      throw new Error("AI_PROVIDER_INVALID");
    const key = await this.secrets.get(secretId(id));
    const response = await this.request({
      profileId: config.profileId,
      url: endpointPath(endpoint(config), "/models"),
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      signal,
      maxResponseBytes: RESPONSE_LIMIT,
    });
    const parsed = await boundedJSON(response.body, signal);
    const models =
      parsed && typeof parsed === "object" && "data" in parsed
        ? parsed.data
        : undefined;
    if (!Array.isArray(models) || models.length > MODEL_LIST_LIMIT)
      throw new Error("AI_MODEL_LIST_INVALID");
    return [
      ...new Set(
        models
          .map((item) =>
            item && typeof item === "object" && "id" in item
              ? item.id
              : undefined,
          )
          .filter(
            (id): id is string =>
              typeof id === "string" && id.length > 0 && id.length <= 150,
          ),
      ),
    ];
  }

  /** Yields only text deltas. The caller owns abort and a visible Stop control. */
  async *chat(
    id: string,
    messages: AiChatMessage[],
    signal: AbortSignal,
  ): AsyncGenerator<string> {
    if (this.active) throw new Error("AI_BUSY");
    assertMessages(messages);
    const config = this.configs.get(id);
    if (!config) throw new Error("AI_PROVIDER_INVALID");
    this.active = true;
    try {
      const base = endpoint(config);
      const url = endpointPath(
        base,
        config.kind === "ollama" ? "/api/chat" : "/chat/completions",
      );
      const key =
        config.kind === "ollama"
          ? undefined
          : await this.secrets.get(secretId(id));
      if (config.kind === "openai-compatible" && !key)
        throw new Error("AI_KEY_MISSING");
      const requestSignal = AbortSignal.any([
        signal,
        AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ]);
      const response = await this.request({
        profileId: config.profileId,
        url,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept:
            config.kind === "ollama"
              ? "application/x-ndjson"
              : "text/event-stream",
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
        },
        body: JSON.stringify({ model: config.model, messages, stream: true }),
        signal: requestSignal,
        maxResponseBytes: RESPONSE_LIMIT,
      });
      let characters = 0;
      for await (const line of lines(response.body, requestSignal)) {
        if (!line.trim()) continue;
        const data =
          config.kind === "ollama"
            ? line
            : line.startsWith("data:")
              ? line.slice(5).trimStart()
              : "";
        if (!data) continue;
        if (data === "[DONE]") break;
        let item: unknown;
        try {
          item = JSON.parse(data) as unknown;
        } catch {
          throw new Error("AI_RESPONSE_INVALID");
        }
        if (!item || typeof item !== "object")
          throw new Error("AI_RESPONSE_INVALID");
        if ("error" in item) throw new Error("AI_PROVIDER_ERROR");
        const delta =
          config.kind === "ollama"
            ? (item as { message?: { content?: unknown } })?.message?.content
            : (item as { choices?: { delta?: { content?: unknown } }[] })
                ?.choices?.[0]?.delta?.content;
        if (delta === undefined || delta === null) {
          if ("done" in item && item.done === true) break;
          continue;
        }
        if (typeof delta !== "string") throw new Error("AI_RESPONSE_INVALID");
        characters += delta.length;
        if (characters > OUTPUT_LIMIT) throw new Error("AI_OUTPUT_TOO_LARGE");
        yield delta;
        if ("done" in item && item.done === true) break;
      }
      if (!characters && !signal.aborted) throw new Error("AI_EMPTY_RESPONSE");
    } finally {
      this.active = false;
    }
  }

  private async request(
    request: AiTransportRequest,
  ): Promise<AiTransportResponse> {
    if (request.signal.aborted) throw new Error("AI_REQUEST_ABORTED");
    let response: AiTransportResponse;
    try {
      response = await this.transport(request);
    } catch {
      throw new Error(
        request.signal.aborted ? "AI_REQUEST_ABORTED" : "AI_TRANSPORT_FAILED",
      );
    }
    if (response.url !== request.url) throw new Error("AI_REDIRECT_DENIED");
    if (response.status < 200 || response.status >= 300)
      throw new Error(`AI_PROVIDER_HTTP_${response.status}`);
    return response;
  }
}
