import { beforeEach, describe, expect, it, vi } from "vitest";

const { readFile } = vi.hoisted(() => ({ readFile: vi.fn() }));
vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
  readFile,
}));
import { TorController } from "../../src/main/tor";

beforeEach(() => {
  readFile.mockReset();
});

describe("Tor component verification lifecycle", () => {
  it("does not resurrect an error after Stop while verification was pending", async () => {
    let reject!: (error: Error) => void;
    readFile.mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
    const controller = new TorController({
      bundlePath: "unused",
      dataPath: "unused",
      onChange: vi.fn(),
    });
    controller.state.bundled = true;
    const starting = controller.start();
    await controller.stop();
    reject(new Error("test verification failure"));
    await starting;
    expect(controller.state.status).toBe("stopped");
    expect(controller.state.error).toBeUndefined();
  });

  it("ignores a previous verification failure while a new Start is pending", async () => {
    const rejections: ((error: Error) => void)[] = [];
    readFile.mockImplementation(
      () => new Promise((_resolve, fail) => rejections.push(fail)),
    );
    const controller = new TorController({
      bundlePath: "unused",
      dataPath: "unused",
      onChange: vi.fn(),
    });
    controller.state.bundled = true;
    const first = controller.start();
    await controller.stop();
    const second = controller.start();
    rejections[0](new Error("old verification failure"));
    await first;
    expect(controller.state.status).toBe("starting");
    expect(controller.state.error).toBeUndefined();
    rejections[1](new Error("current verification failure"));
    await expect(second).rejects.toThrow("TOR_INTEGRITY");
    expect(controller.state.error).toBe("TOR_INTEGRITY");
  });
});
