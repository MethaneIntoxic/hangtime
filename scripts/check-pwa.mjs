import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const manifest = JSON.parse(readFileSync(resolve(root, "public/manifest.webmanifest"), "utf8"));
const serviceWorker = readFileSync(resolve(root, "public/sw.js"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function pngDimensions(file) {
  const bytes = readFileSync(resolve(root, file));
  assert(bytes.subarray(1, 4).toString("ascii") === "PNG", `${file} is not a PNG`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

assert(manifest.display === "standalone", "manifest must use standalone display");
assert(manifest.start_url === "/" && manifest.scope === "/", "manifest scope/start_url mismatch");

for (const size of [192, 512]) {
  const icon = manifest.icons.find((item) => item.sizes === `${size}x${size}` && item.purpose.includes("maskable"));
  assert(icon, `missing ${size}px maskable icon`);
  const dimensions = pngDimensions(`public${icon.src}`);
  assert(dimensions.width === size && dimensions.height === size, `${icon.src} has incorrect dimensions`);
}

for (const required of ["/offline.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"]) {
  assert(serviceWorker.includes(`\"${required}\"`), `service worker allowlist omits ${required}`);
}
for (const restricted of ["/api", "/plans", "/join"]) {
  assert(serviceWorker.includes(`\"${restricted}\"`), `service worker network-only list omits ${restricted}`);
}
assert(serviceWorker.includes("request.mode === \"navigate\""), "navigations must stay network-first");

console.log("PWA_STATIC_CHECK_PASS");
