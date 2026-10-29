import { describe, expect, it } from "vitest";
import {
  stripClientHintNegotiation,
  stripHighEntropyClientHints,
} from "../../src/main/privacy-policy";

describe("network Client Hints minimization", () => {
  it("removes high-entropy UA hints case-insensitively, keeping low-entropy values intact", () => {
    const input = {
      "Sec-CH-UA": '"Chromium";v="156"',
      "Sec-CH-UA-Mobile": "?0",
      "Sec-CH-UA-Platform": '"Windows"',
      "sEc-Ch-Ua-PlAtFoRm-VeRsIoN": '"19.0.0"',
      "Sec-CH-UA-Full-Version-List": '"Chromium";v="156.0.8123.1"',
      "Sec-CH-UA-Arch": '"x86"',
      "Sec-CH-UA-Bitness": '"64"',
      "Sec-CH-UA-Model": '"specific-model"',
      "Sec-CH-UA-Form-Factors": '"Desktop"',
    };
    expect(stripHighEntropyClientHints(input)).toEqual({
      "Sec-CH-UA": input["Sec-CH-UA"],
      "Sec-CH-UA-Mobile": "?0",
      "Sec-CH-UA-Platform": '"Windows"',
    });
    expect(Object.keys(input)).toHaveLength(9);
  });
  it("removes legacy hardware, viewport and connection hints while preserving transport and authentication headers", () => {
    const input = {
      "Device-Memory": "16",
      DPR: "1.25",
      Width: "1920",
      "Viewport-Width": "1536",
      Downlink: "20",
      RTT: "42",
      ECT: "4g",
      "Sec-CH-Device-Memory": "16",
      "Sec-CH-DPR": "1.25",
      "Sec-CH-Viewport-Height": "864",
      Authorization: "Bearer user-provided",
      Cookie: "site-cookie",
      "User-Agent": "unchanged",
      Accept: "image/avif",
      "Save-Data": "on",
      "Sec-CH-Prefers-Color-Scheme": "dark",
    };
    expect(stripHighEntropyClientHints(input)).toEqual({
      Authorization: "Bearer user-provided",
      Cookie: "site-cookie",
      "User-Agent": "unchanged",
      Accept: "image/avif",
      "Save-Data": "on",
      "Sec-CH-Prefers-Color-Scheme": "dark",
    });
  });
  it("strips opt-ins/retries but preserves CSP, HSTS and cookie policies including array values", () => {
    const input = {
      "aCcEpT-cH": ["Sec-CH-UA-Arch"],
      "Critical-CH": ["Sec-CH-UA-Arch"],
      "Accept-CH-Lifetime": ["86400"],
      "Content-Security-Policy": ["default-src 'self'"],
      "Strict-Transport-Security": ["max-age=31536000"],
      "Permissions-Policy": ["camera=()"],
      "Set-Cookie": ["session=value; Secure; HttpOnly"],
    };
    expect(stripClientHintNegotiation(input)).toEqual({
      "Content-Security-Policy": ["default-src 'self'"],
      "Strict-Transport-Security": ["max-age=31536000"],
      "Permissions-Policy": ["camera=()"],
      "Set-Cookie": ["session=value; Secure; HttpOnly"],
    });
    expect(input["aCcEpT-cH"]).toEqual(["Sec-CH-UA-Arch"]);
  });
  it("handles empty maps without introducing headers or fingerprint values", () => {
    expect(stripHighEntropyClientHints({})).toEqual({});
    expect(stripClientHintNegotiation({})).toEqual({});
  });
});
