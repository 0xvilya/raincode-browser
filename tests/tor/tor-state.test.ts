import { describe, expect, it, vi } from "vitest";
import { TorController } from "../../src/main/tor";
import {
  bootstrapDetails,
  BootstrapDeadline,
} from "../../src/main/tor-bootstrap";

describe("Tor failure lifecycle", () => {
  it("ignores old daemon events after a new session has started", () => {
    const controller = new TorController({
      bundlePath: "none",
      dataPath: "none",
      onChange: vi.fn(),
    });
    controller.state = {
      ...controller.state,
      status: "bootstrapping",
      progress: 10,
      socksPort: 12345,
    };
    const lifecycle = controller as unknown as {
      generation: number;
      bootstrap(line: string, generation: number): void;
    };
    lifecycle.generation = 2;
    lifecycle.bootstrap(
      "650 STATUS_CLIENT NOTICE BOOTSTRAP PROGRESS=100 TAG=done",
      1,
    );
    expect(controller.state).toMatchObject({
      status: "bootstrapping",
      progress: 10,
    });
  });
  it("allows a slow advancing bootstrap but bounds stalled and total time", () => {
    const deadline = new BootstrapDeadline(0);
    deadline.advance(10, 100_000);
    deadline.advance(50, 200_000);
    expect(deadline.expired(250_000)).toBe(false);
    deadline.advance(50, 350_000); // repeated warnings do not extend the deadline
    expect(deadline.expired(380_000)).toBe(true);
    const total = new BootstrapDeadline(0);
    for (let n = 1; n < 6; n++) total.advance(n, n * 100_000);
    expect(total.expired(599_999)).toBe(false);
    expect(total.expired(600_000)).toBe(true);
  });
  it("retains diagnostic keywords but never relay addresses or warning text", () => {
    expect(
      bootstrapDetails(
        '650 STATUS_CLIENT WARN BOOTSTRAP PROGRESS=10 TAG=conn_done REASON=TIMEOUT COUNT=3 RECOMMENDATION=warn WARNING="private.example" HOSTADDR="1.2.3.4:443"',
      ),
    ).toEqual({
      phase: "conn_done",
      reason: "TIMEOUT",
      problems: 3,
      recommendation: "warn",
    });
    expect(
      bootstrapDetails(
        'TAG="injected" COUNT=999999999999 REASON=private.example',
      ),
    ).toEqual({
      phase: undefined,
      reason: undefined,
      problems: undefined,
      recommendation: undefined,
    });
  });
  it("reports repeated-phase connection problems rather than dropping them", () => {
    const controller = new TorController({
      bundlePath: "none",
      dataPath: "none",
      onChange: vi.fn(),
    });
    controller.state = {
      ...controller.state,
      status: "bootstrapping",
      progress: 10,
    };
    const lifecycle = controller as unknown as {
      bootstrap(line: string): void;
    };
    lifecycle.bootstrap(
      "650 STATUS_CLIENT WARN BOOTSTRAP PROGRESS=10 TAG=conn_done REASON=TIMEOUT COUNT=4 RECOMMENDATION=warn",
    );
    expect(controller.state).toMatchObject({
      phase: "conn_done",
      reason: "TIMEOUT",
      problems: 4,
    });
  });
  it("retains the bootstrap timeout across daemon exit and late progress", () => {
    const changed = vi.fn();
    const controller = new TorController({
      bundlePath: "not-a-bundle",
      dataPath: "not-a-runtime",
      onChange: changed,
    });
    controller.state = {
      ...controller.state,
      status: "bootstrapping",
      progress: 85,
      socksPort: 12345,
    };
    const lifecycle = controller as unknown as {
      fail(error: string): void;
      bootstrap(line: string): void;
    };
    lifecycle.fail("TOR_BOOTSTRAP_TIMEOUT");
    lifecycle.fail("TOR_PROCESS_EXIT");
    lifecycle.bootstrap("650 STATUS_CLIENT NOTICE BOOTSTRAP PROGRESS=100");
    expect(controller.state).toMatchObject({
      status: "error",
      error: "TOR_BOOTSTRAP_TIMEOUT",
      progress: 85,
      socksPort: undefined,
    });
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("does not revive a stopped session from buffered daemon stdout", () => {
    const controller = new TorController({
      bundlePath: "not-a-bundle",
      dataPath: "not-a-runtime",
      onChange: vi.fn(),
    });
    const lifecycle = controller as unknown as {
      bootstrap(line: string): void;
    };
    lifecycle.bootstrap("Bootstrapped 100% (done): Done");
    expect(controller.state.status).toBe("stopped");
    expect(controller.state.socksPort).toBeUndefined();
  });
});
