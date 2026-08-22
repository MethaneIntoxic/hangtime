import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const failures = [];

if (packageJson.dependencies?.["maplibre-gl"] !== "6.4.1") {
  failures.push("maplibre-gl must remain exactly pinned to 6.4.1");
}

const config = readFileSync(join(root, "next.config.ts"), "utf8");
if (!config.includes("connect-src 'self' https://tiles.openfreemap.org")) {
  failures.push("production CSP must allow only the approved OpenFreeMap tile host");
}
if (!config.includes("worker-src 'self' blob:")) {
  failures.push("production CSP is missing the MapLibre worker directive");
}

const mapSource = readFileSync(
  join(root, "src/components/recommendations/open-singapore-map.tsx"),
  "utf8",
);
if (!mapSource.includes("OpenFreeMap · © OpenStreetMap contributors")) {
  failures.push("visible OpenFreeMap/OpenStreetMap attribution is required");
}
if (!mapSource.includes("participantCount") || /\bparticipants\b/.test(mapSource) || mapSource.includes("PlanParticipant")) {
  failures.push("the public map must accept only participantCount, never participant objects or location-capable types");
}

const databaseInitialisation = readFileSync(join(root, "src/lib/db/init.ts"), "utf8");
if (!databaseInitialisation.includes("WHERE maps_url LIKE 'https://maps.google.com/%'") ||
    !databaseInitialisation.includes("https://www.openstreetmap.org/?mlat=")) {
  failures.push("the idempotent legacy Google-link migration must rewrite to OpenStreetMap");
}

const forbidden = [
  /maps\.google\.com/i,
  /GOOGLE_MAPS_/,
  /GOOGLE_PLACES_/,
  /nominatim\.openstreetmap\.org/i,
];
const scanRoots = ["src", "tests", "public"];

function scan(path) {
  for (const entry of readdirSync(path)) {
    const fullPath = join(path, entry);
    if (statSync(fullPath).isDirectory()) {
      scan(fullPath);
      continue;
    }
    if (!/\.(?:ts|tsx|js|mjs|html|json|webmanifest)$/.test(entry)) continue;
    const contents = readFileSync(fullPath, "utf8");
    const relativePath = relative(root, fullPath).replaceAll("\\", "/");
    for (const pattern of forbidden) {
      if (relativePath === "src/lib/db/init.ts" && pattern.source.includes("maps\\.google")) continue;
      if (pattern.test(contents)) failures.push(`${relative(root, fullPath)} contains forbidden map dependency ${pattern}`);
    }
  }
}

for (const directory of scanRoots) scan(join(root, directory));

if (failures.length > 0) {
  console.error(failures.map((failure) => `MAP_CHECK_FAIL: ${failure}`).join("\n"));
  process.exit(1);
}

console.log("MAP_CHECK_PASS");
