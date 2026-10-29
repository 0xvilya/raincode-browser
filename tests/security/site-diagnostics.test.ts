import { describe, expect, it, vi } from "vitest";
import {
  inspectSite,
  isPublicDiagnosticIP,
  type DiagnosticsSession,
} from "../../src/main/site-diagnostics";
import { fixtureOnion } from "../tor/fixture-onion";

function fixture(addresses = ["1.1.1.1"]) {
  const resolveHost = vi.fn(async () => ({
    endpoints: addresses.map((address) => ({ address })),
  }));
  const fetch = vi.fn(
    async (url: string, _options?: RequestInit) =>
      new Response(
        JSON.stringify({
          status: "ok",
          data: url.includes("network-info")
            ? { asns: [13335, "13335", -1, "invalid"], prefix: "1.1.1.0/24" }
            : { holder: "CLOUDFLARENET\u0000\u202e" },
        }),
      ),
  );
  const session: DiagnosticsSession = { resolveHost, fetch };
  return { session, resolveHost, fetch };
}

describe("explicit site diagnostics", () => {
  it.each(["tor", "proxy"] as const)(
    "never uses the local resolver or provider in %s",
    async (mode) => {
      const { session, resolveHost, fetch } = fixture();
      expect(
        await inspectSite({
          url: "https://example.test/",
          mode,
          session,
          registration: true,
        }),
      ).toMatchObject({ status: "protected", addresses: [] });
      expect(resolveHost).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each(["direct", "private", "tor", "proxy"] as const)(
    "does not attempt to reveal an onion IP in %s",
    async (mode) => {
      const { session, resolveHost, fetch } = fixture();
      expect(
        await inspectSite({
          url: `http://${fixtureOnion(12)}/`,
          mode,
          session,
          registration: true,
        }),
      ).toMatchObject({ status: "onion", addresses: [] });
      expect(resolveHost).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("returns explicit DNS addresses only, without provider traffic or page path", async () => {
    const { session, resolveHost, fetch } = fixture([
      "1.1.1.1",
      "1.1.1.1",
      "2606:4700:4700::1111",
      "invalid",
    ]);
    expect(
      await inspectSite({
        url: "https://example.test/private?token=synthetic-secret",
        mode: "direct",
        session,
        registration: false,
      }),
    ).toEqual({
      hostname: "example.test",
      status: "resolved",
      addresses: ["1.1.1.1", "2606:4700:4700::1111"],
    });
    expect(resolveHost).toHaveBeenCalledWith("example.test");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("queries fixed HTTPS endpoints with public IP/ASN only after explicit provider action", async () => {
    const { session, fetch } = fixture();
    const result = await inspectSite({
      url: "https://sensitive.example.test/path?token=secret",
      mode: "private",
      session,
      registration: true,
    });
    expect(result.network).toEqual({
      ip: "1.1.1.1",
      asns: [13335],
      prefix: "1.1.1.0/24",
      holder: "CLOUDFLARENET",
      provider: "RIPEstat",
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "https://stat.ripe.net/data/network-info/data.json?resource=1.1.1.1",
      "https://stat.ripe.net/data/as-overview/data.json?resource=AS13335",
    ]);
    for (const [url, options] of fetch.mock.calls) {
      expect(url).not.toContain("sensitive");
      expect(options).toMatchObject({
        method: "GET",
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      expect(Object.keys(options!.headers!)).toEqual(["Accept"]);
    }
  });

  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "192.168.1.1",
    "::1",
    "::ffff:8.8.8.8",
    "2001:db8::1",
    "198.51.100.2",
  ])("never shares nonpublic %s with the provider", async (ip) => {
    const { session, resolveHost, fetch } = fixture([ip]);
    const result = await inspectSite({
      url: "http://local.example.test/",
      mode: "direct",
      session,
      registration: true,
    });
    expect(result.addresses).toEqual([ip]);
    expect(result.registrationStatus).toBe("private-address");
    expect(resolveHost).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not resolve IP literals and caps excessive DNS answers", async () => {
    const { session, resolveHost } = fixture(
      Array.from({ length: 50 }, (_, i) => `1.1.1.${i + 1}`),
    );
    expect(
      (
        await inspectSite({
          url: "https://1.1.1.1/",
          mode: "direct",
          session,
          registration: false,
        })
      ).addresses,
    ).toEqual(["1.1.1.1"]);
    expect(resolveHost).not.toHaveBeenCalled();
    expect(
      (
        await inspectSite({
          url: "https://example.test/",
          mode: "direct",
          session,
          registration: false,
        })
      ).addresses,
    ).toHaveLength(16);
  });

  it("does not disclose URLs, credentials or raw resolver failures", async () => {
    const { session, resolveHost, fetch } = fixture();
    resolveHost.mockRejectedValue(new Error("sensitive-dns-query"));
    const result = await inspectSite({
      url: "https://example.test/private?token=secret",
      mode: "direct",
      session,
      registration: true,
    });
    expect(result).toEqual({
      hostname: "example.test",
      status: "failed",
      addresses: [],
    });
    expect(JSON.stringify(result)).not.toMatch(/secret|sensitive|private/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    "file:///C:/secret",
    "https://user:password@example.test/",
    "data:text/plain,test",
    "not a URL",
  ])("rejects privileged or credential-bearing input %s", async (url) => {
    const { session, resolveHost, fetch } = fixture();
    await expect(
      inspectSite({ url, mode: "direct", session, registration: true }),
    ).rejects.toThrow("DIAGNOSTICS_INVALID_URL");
    expect(resolveHost).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rechecks kill state before starting provider traffic after DNS", async () => {
    const { session, resolveHost, fetch } = fixture();
    let allowed = true;
    resolveHost.mockImplementation(async () => {
      allowed = false;
      return { endpoints: [{ address: "1.1.1.1" }] };
    });
    await expect(
      inspectSite({
        url: "https://example.test/",
        mode: "direct",
        session,
        registration: true,
        canConnect: () => allowed,
      }),
    ).rejects.toThrow("DIAGNOSTICS_BLOCKED");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([302, 403, 429, 500])(
    "fails without following HTTP %s from the provider",
    async (status) => {
      const { session, fetch } = fixture();
      fetch.mockImplementation(
        async () =>
          new Response("", {
            status,
            headers: { Location: "http://127.0.0.1/private" },
          }),
      );
      const result = await inspectSite({
        url: "https://example.test/",
        mode: "direct",
        session,
        registration: true,
      });
      expect(result.registrationStatus).toBe("unavailable");
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it("bounds streaming JSON even without Content-Length", async () => {
    const { session, fetch } = fixture();
    fetch.mockImplementation(async () => new Response("x".repeat(65_537)));
    expect(
      (
        await inspectSite({
          url: "https://example.test/",
          mode: "direct",
          session,
          registration: true,
        })
      ).registrationStatus,
    ).toBe("unavailable");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retains an ASN when the optional holder query fails", async () => {
    const { session, fetch } = fixture();
    fetch.mockImplementationOnce(
      async () =>
        new Response(
          JSON.stringify({
            status: "ok",
            data: { asns: [13335], prefix: "1.1.1.0/24" },
          }),
        ),
    );
    fetch.mockImplementationOnce(async () => {
      throw new Error("synthetic provider secret");
    });
    const result = await inspectSite({
      url: "https://example.test/",
      mode: "direct",
      session,
      registration: true,
    });
    expect(result.network).toMatchObject({ asns: [13335], holder: undefined });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});

describe("public IP provider eligibility", () => {
  it.each([
    "1.1.1.1",
    "8.8.8.8",
    "93.184.215.14",
    "2606:4700:4700::1111",
    "2001:4860:4860::8888",
  ])("accepts globally routable %s", (ip) =>
    expect(isPublicDiagnosticIP(ip)).toBe(true),
  );
  it.each([
    "0.0.0.0",
    "10.0.0.1",
    "100.64.0.1",
    "127.1.1.1",
    "169.254.1.1",
    "172.16.0.1",
    "192.168.1.1",
    "192.0.0.1",
    "192.0.2.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.1.1.1",
    "255.255.255.255",
    "::1",
    "::",
    "fc00::1",
    "fe80::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:8.8.8.8",
    "2001:db8::1",
    "2001:0db8:0000::1",
    "2001::1234",
    "2002:7f00:1::",
    "3fff::1",
    "1.1.1.1/24",
    "https://1.1.1.1",
    "not-an-ip",
  ])("rejects special/malformed %s", (ip) =>
    expect(isPublicDiagnosticIP(ip)).toBe(false),
  );
});
