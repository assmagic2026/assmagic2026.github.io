# ASS MAGIC engagement analytics

This isolated Cloudflare Worker records only two values in Workers Analytics Engine:

- a random page-session UUID (not persisted in the browser and not shared across page loads)
- cumulative seconds while the official page was visible

It does not record IP addresses, cookies, user identifiers, URLs, input, game state, or interaction history. The browser sends a small snapshot only when the page becomes hidden or is left; there is no animation-frame work or polling timer.

The dataset is `ass_magic_engagement`. Repeated snapshots from one page load are deduplicated in the daily report by selecting the maximum duration for that page-session UUID.
