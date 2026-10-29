import { contextBridge } from "electron";
// Runs in every Tor frame, including about:blank child frames. No bridge API is
// exposed to websites. Chromium transport policy is enforced separately.
contextBridge.executeInMainWorld({
  func: () => {
    for (const name of [
      "RTCPeerConnection",
      "webkitRTCPeerConnection",
      "mozRTCPeerConnection",
      "RTCDataChannel",
      "WebTransport",
    ]) {
      try {
        Object.defineProperty(globalThis, name, {
          value: undefined,
          writable: false,
          configurable: false,
        });
      } catch {
        /* Already immutable. */
      }
    }
  },
});
