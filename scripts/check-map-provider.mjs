const styleUrl = "https://tiles.openfreemap.org/styles/liberty";
const allowedHost = "tiles.openfreemap.org";
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 8_000);

try {
  const startedAt = performance.now();
  const response = await fetch(styleUrl, {
    headers: { "User-Agent": "Hangtime-provider-health/1.0" },
    signal: controller.signal,
  });
  if (!response.ok) throw new Error(`style request returned ${response.status}`);
  const style = await response.json();
  if (style.version !== 8 || typeof style.sources !== "object") throw new Error("invalid MapLibre style document");

  const urls = [style.sprite, style.glyphs];
  for (const source of Object.values(style.sources)) {
    if (typeof source?.url === "string") urls.push(source.url);
    if (Array.isArray(source?.tiles)) urls.push(...source.tiles);
  }
  for (const rawUrl of urls.filter(Boolean)) {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:" || parsed.hostname !== allowedHost) {
      throw new Error(`unapproved provider endpoint: ${parsed.origin}`);
    }
  }

  console.log(`MAP_PROVIDER_PASS latency_ms=${Math.round(performance.now() - startedAt)} endpoints=${urls.length}`);
} finally {
  clearTimeout(timeout);
}

