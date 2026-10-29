# Local advertising protection

The rule list in `src/main/content-policy.ts` is written for RainCode and covered by the repository's MIT license. It bundles a small, inspectable set of advertising service hostnames plus precise CSS selectors for advertisement slots and DuckDuckGo's browser/promotion cards. There is no downloaded filter subscription, analytics, topic list, ranking modification or automatic background update.

Host matching uses the parsed canonical network hostname and a full label boundary. A URL mentioning an ad host in its path, query or username does not match. Onion sites and ordinary search results are not blocked by category. CSS only hides explicitly marked advertisement slots and, on known DuckDuckGo search origins, provider promotion elements. Rules can become outdated and cannot promise removal of all first-party, video or newly introduced ads. The app's protection toggle must allow users to turn them off.

The current DuckDuckGo promotion identifiers were inspected in the provider's own public search assets (`/dist/wpm.main.*.js`, `/dist/g.*.js`, `/dist/d.*.js` and `/dist/r.*.css`) on 25 October 2026. Dynamic CSS continues to match those identifiers when cards are inserted later; it does not inspect or rewrite result text.

The [official DuckDuckGo URL parameter documentation](https://duckduckgo.com/duckduckgo-help-pages/settings/params) documents advertisement preferences for individual users and asks app/extension integrations not to remove advertising or branding via those parameters. RainCode therefore does not silently add `k1`, branding parameters or undocumented promo flags to search URLs. Users retain their chosen search templates. Local advertising protection is a separate user-requested browser capability.

The exact DuckDuckGo onion host is sourced from [Tor Browser's own search provider source](https://archive.torproject.org/websites/lists.torproject.org/pipermail/tor-commits/2022-November/239130.html). Including it as a cosmetic origin does not assert current service availability or allow any onion name to bypass Tor routing checks.
