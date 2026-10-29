import { randomUUID } from "node:crypto";
import { expect, test, vi } from "vitest";
import {
  AiProviderManager,
  type AiTransport,
} from "../../src/main/ai/provider";

const config = () => ({
  id: randomUUID(),
  profileId: "default",
  kind: "local-openai" as const,
  endpoint: "http://127.0.0.1:1234/v1",
  model: "owned-fixture",
  vision: false,
});
const body = async function* (value: string) {
  yield new TextEncoder().encode(value);
};
const secrets = {
  set: async () => {},
  get: async () => undefined,
  delete: async () => {},
};
test("local compatible discovery and streaming need no key and make no automatic requests", async () => {
  const transport = vi.fn<AiTransport>(async (request) => ({
    status: 200,
    url: request.url,
    body: body(
      request.method === "GET"
        ? '{"data":[{"id":"owned-fixture"}]}'
        : 'data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]\n',
    ),
  }));
  const manager = new AiProviderManager(secrets, transport);
  const provider = config();
  await manager.configure(provider);
  expect(transport).not.toHaveBeenCalled();
  expect(
    await manager.listLocalModels(provider.id, new AbortController().signal),
  ).toEqual(["owned-fixture"]);
  const result: string[] = [];
  for await (const delta of manager.chat(
    provider.id,
    [{ role: "user", content: "test" }],
    new AbortController().signal,
  ))
    result.push(delta);
  expect(result).toEqual(["OK"]);
  expect(transport.mock.calls.map(([request]) => request.url)).toEqual([
    provider.endpoint + "/models",
    provider.endpoint + "/chat/completions",
  ]);
  expect(
    transport.mock.calls.every(([request]) => !request.headers.Authorization),
  ).toBe(true);
});
test.each([
  "http://example.test/v1",
  "http://localhost:1234/v1",
  "http://192.168.1.1/v1",
  "https://127.0.0.1/v1",
  "http://user:secret@127.0.0.1/v1",
  "http://127.0.0.1/v1?token=secret",
])("local compatible refuses unsafe endpoint %s", async (endpoint) => {
  const manager = new AiProviderManager(secrets, vi.fn());
  await expect(manager.configure({ ...config(), endpoint })).rejects.toThrow();
});
test("local discovery refuses redirects", async () => {
  const manager = new AiProviderManager(secrets, async () => ({
    status: 200,
    url: "https://external.invalid/models",
    body: body('{"data":[]}'),
  }));
  const provider = config();
  await manager.configure(provider);
  await expect(
    manager.listLocalModels(provider.id, new AbortController().signal),
  ).rejects.toThrow("AI_REDIRECT_DENIED");
});
