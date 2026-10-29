import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  AiProviderManager,
  type AiTransport,
} from "../../src/main/ai/provider";

const encode = (text: string) => new TextEncoder().encode(text);
const stream = async function* (text: string) {
  yield encode(text);
};
const local = () => ({
  id: randomUUID(),
  profileId: "default",
  kind: "ollama" as const,
  endpoint: "http://127.0.0.1:11434",
  model: "user-installed-model",
  vision: false,
});
const cloud = () => ({
  id: randomUUID(),
  profileId: "default",
  kind: "openai-compatible" as const,
  endpoint: "https://api.example.test/v1",
  model: "user-selected-model",
  vision: false,
});

describe("AI provider foundation", () => {
  it("reports a stream-level failure without exposing provider body secrets", async () => {
    const manager = new AiProviderManager(
      {
        set: async () => {},
        get: async () => undefined,
        delete: async () => {},
      },
      async (request) => ({
        status: 200,
        url: request.url,
        body: stream('{"error":"secret diagnostic token"}\n'),
      }),
    );
    const config = local();
    await manager.configure(config);
    await expect(
      manager
        .chat(
          config.id,
          [{ role: "user", content: "hi" }],
          new AbortController().signal,
        )
        .next(),
    ).rejects.toThrow("AI_PROVIDER_ERROR");
  });
  it("streams compatible SSE and returns a bounded authorization error without reading secret error bodies", async () => {
    const config = cloud();
    let status = 200;
    let errorBodyRead = false;
    const manager = new AiProviderManager(
      { set: async () => {}, get: async () => "key", delete: async () => {} },
      async (request) => ({
        status,
        url: request.url,
        body: (async function* () {
          if (status === 401) {
            errorBodyRead = true;
            yield encode("private provider token");
          } else
            yield encode(
              'data:{"choices":[{"delta":{"content":"Привет"}}]}\n\ndata: [DONE]\n',
            );
        })(),
      }),
    );
    await manager.configure(config);
    const result = [];
    for await (const delta of manager.chat(
      config.id,
      [{ role: "user", content: "hi" }],
      new AbortController().signal,
    ))
      result.push(delta);
    expect(result.join("")).toBe("Привет");
    status = 401;
    await expect(
      manager
        .chat(
          config.id,
          [{ role: "user", content: "hi" }],
          new AbortController().signal,
        )
        .next(),
    ).rejects.toThrow("AI_PROVIDER_HTTP_401");
    expect(errorBodyRead).toBe(false);
    const controller = new AbortController();
    controller.abort();
    await expect(
      manager
        .chat(config.id, [{ role: "user", content: "hi" }], controller.signal)
        .next(),
    ).rejects.toThrow("AI_REQUEST_ABORTED");
  });
  it("uses an injected transport only on explicit discovery and never exposes the key", async () => {
    const secrets = {
      set: vi.fn(async () => {}),
      get: vi.fn(async () => "private-key"),
      delete: vi.fn(async () => {}),
    };
    const transport: AiTransport = vi.fn(async (request) => ({
      status: 200,
      url: request.url,
      body: stream(JSON.stringify({ models: [{ name: "installed:1" }] })),
    }));
    const manager = new AiProviderManager(secrets, transport);
    const c = cloud();
    await manager.configure(c, "private-key");
    expect(JSON.stringify(manager.list())).not.toContain("private-key");
    expect(transport).not.toHaveBeenCalled();
    const l = local();
    await manager.configure(l);
    expect(
      await manager.listOllama(l.id, new AbortController().signal),
    ).toEqual(["installed:1"]);
    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "http://127.0.0.1:11434/api/tags",
        profileId: "default",
      }),
    );
  });

  it("rejects direct non-loopback Ollama, insecure cloud, and URL credentials", async () => {
    const manager = new AiProviderManager(
      {
        set: async () => {},
        get: async () => undefined,
        delete: async () => {},
      },
      async () => {
        throw new Error("No network");
      },
    );
    await expect(
      manager.configure({ ...local(), endpoint: "http://192.168.1.1:11434" }),
    ).rejects.toThrow("AI_OLLAMA_LOOPBACK_REQUIRED");
    await expect(
      manager.configure({ ...cloud(), endpoint: "http://example.com/v1" }),
    ).rejects.toThrow("AI_HTTPS_REQUIRED");
    await expect(
      manager.configure({ ...cloud(), endpoint: "https://u:p@example.com/v1" }),
    ).rejects.toThrow("AI_ENDPOINT_INVALID");
  });

  it("streams bounded Ollama text and rejects simultaneous generation", async () => {
    let release!: () => void;
    const pause = new Promise<void>((resolve) => {
      release = resolve;
    });
    const transport: AiTransport = async (request) => ({
      status: 200,
      url: request.url,
      body: (async function* () {
        await pause;
        yield encode(
          '{"message":{"content":"hello"}}\n{"message":{"content":" world"}}\n',
        );
      })(),
    });
    const manager = new AiProviderManager(
      {
        set: async () => {},
        get: async () => undefined,
        delete: async () => {},
      },
      transport,
    );
    const c = local();
    await manager.configure(c);
    const first = manager.chat(
      c.id,
      [{ role: "user", content: "Hi" }],
      new AbortController().signal,
    );
    const awaiting = first.next();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const second = manager.chat(
      c.id,
      [{ role: "user", content: "Hi" }],
      new AbortController().signal,
    );
    await expect(second.next()).rejects.toThrow("AI_BUSY");
    release();
    expect((await awaiting).value).toBe("hello");
    expect((await first.next()).value).toBe(" world");
    expect((await first.next()).done).toBe(true);
  });

  it("requires key, refuses redirects, and does not surface provider error bodies", async () => {
    const c = cloud();
    const noKey = new AiProviderManager(
      {
        set: async () => {},
        get: async () => undefined,
        delete: async () => {},
      },
      async () => {
        throw new Error("Should not call");
      },
    );
    await noKey.configure(c);
    await expect(
      noKey
        .chat(
          c.id,
          [{ role: "user", content: "hi" }],
          new AbortController().signal,
        )
        .next(),
    ).rejects.toThrow("AI_KEY_MISSING");
    const redirected = new AiProviderManager(
      { set: async () => {}, get: async () => "key", delete: async () => {} },
      async () => ({
        status: 200,
        url: "https://elsewhere.test/",
        body: stream("token"),
      }),
    );
    await redirected.configure(c);
    await expect(
      redirected
        .chat(
          c.id,
          [{ role: "user", content: "hi" }],
          new AbortController().signal,
        )
        .next(),
    ).rejects.toThrow("AI_REDIRECT_DENIED");
  });
});
