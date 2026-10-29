import type { Bookmark, Visit } from "../shared/contracts";

export interface Suggestion {
  url: string;
  title: string;
}

// Suggestions are deliberately local. Typing never creates a network request.
export function localSuggestions(
  text: string,
  history: Visit[],
  bookmarks: Bookmark[],
): Suggestion[] {
  const query = text.trim().toLocaleLowerCase();
  if (!query || query.includes(".onion") || query.startsWith("/")) return [];
  const seen = new Set<string>();
  return [...bookmarks, ...history]
    .filter((item) => {
      if (
        seen.has(item.url) ||
        !`${item.title} ${item.url}`.toLocaleLowerCase().includes(query)
      )
        return false;
      seen.add(item.url);
      return true;
    })
    .slice(0, 6);
}

export function completedDomain(text: string): string {
  const value = text.trim();
  return /^[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?$/u.test(value)
    ? `https://www.${value}.com/`
    : value;
}

export function displayedAddress(url: string): string {
  // Keep Chromium's serialized Punycode for external URLs to avoid disguising
  // lookalike hosts. Unicode input is accepted and validated in the main process.
  return url === "raincode://newtab" ? "" : url;
}

export function effectCommand(value: string) {
  return /^\/(rain|bokeh|glass|glow|cinematic)$/i
    .exec(value.trim())?.[1]
    .toLowerCase() as
    "rain" | "bokeh" | "glass" | "glow" | "cinematic" | undefined;
}
