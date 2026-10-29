import { z } from "zod";

export const privacyLevelSchema = z.enum(["standard", "strict", "maximum"]);
export type PrivacyLevel = z.infer<typeof privacyLevelSchema>;

// An origin is deliberately exact. Without a public-suffix database, guessing
// eTLD+1 would make cookie exceptions apply to unrelated sites.
export const webOriginSchema = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        (url.protocol === "http:" || url.protocol === "https:") &&
        url.origin === value &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  });

const choice = z.enum(["allow", "block"]);
export const privacyOverrideSchema = z
  .object({
    origin: webOriginSchema,
    level: privacyLevelSchema.optional(),
    trackers: choice.optional(),
    crossOriginCookies: choice.optional(),
    javascript: choice.optional(),
  })
  .strict();

export const privacyConfigSchema = z
  .object({
    level: privacyLevelSchema,
    blockWebGL: z.boolean().optional(),
    trackers: choice.optional(),
    crossOriginCookies: choice.optional(),
    javascript: choice.optional(),
    siteOverrides: z.array(privacyOverrideSchema).max(200),
  })
  .strict();

export type PrivacyConfig = z.infer<typeof privacyConfigSchema>;
export type ResolvedPrivacyPolicy = {
  origin: string;
  level: PrivacyLevel;
  trackers: "allow" | "block";
  crossOriginCookies: "allow" | "block";
  javascript: "allow" | "block";
  /** Exact-origin exceptions avoid implying eTLD+1 classification. */
  cookieBoundary: "origin";
};

export const defaultPrivacyConfig: PrivacyConfig = {
  level: "standard",
  siteOverrides: [],
};

export function resolvePrivacyPolicy(
  config: PrivacyConfig,
  origin: string,
): ResolvedPrivacyPolicy {
  const parsed = config;
  const site = parsed.siteOverrides.find((entry) => entry.origin === origin);
  const level = site?.level ?? parsed.level;
  // Standard keeps the existing explicit bundled tracker host rules. Strict
  // adds cross-origin cookie blocking; Maximum additionally disables JS.
  return {
    origin,
    level,
    trackers: site?.trackers ?? parsed.trackers ?? "block",
    crossOriginCookies:
      site?.crossOriginCookies ??
      parsed.crossOriginCookies ??
      (level === "standard" ? "allow" : "block"),
    javascript:
      site?.javascript ??
      parsed.javascript ??
      (level === "maximum" ? "block" : "allow"),
    cookieBoundary: "origin",
  };
}
