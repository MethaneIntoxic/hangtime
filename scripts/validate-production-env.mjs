const errors = [];
const databaseUrl = process.env.TURSO_DATABASE_URL?.trim() ?? "";
const databaseToken = process.env.TURSO_AUTH_TOKEN?.trim() ?? "";
const appUrl = process.env.APP_URL?.trim() ?? "";
const authSecret = process.env.AUTH_SECRET?.trim() ?? "";
const channel = process.env.RELEASE_CHANNEL?.trim() ?? "preview";
const isSyntheticCi = process.env.CI === "true";

function validateAppOrigin(value) {
  try {
    const url = new URL(value);
    const reservedHost = /(^|\.)(localhost|example|invalid|test)$/i.test(url.hostname) ||
      /^(127\.|0\.0\.0\.0$|\[?::1\]?$)/.test(url.hostname);
    return url.protocol === "https:" &&
      !url.username && !url.password &&
      url.pathname === "/" && !url.search && !url.hash &&
      Boolean(url.hostname) &&
      (isSyntheticCi || !reservedHost);
  } catch {
    return false;
  }
}

function validateSender(value) {
  const match = value.match(/^(?:[^<>\r\n]+\s+<)?([^<>\s@]+@[^<>\s@]+)>?$/);
  if (!match) return false;
  const domain = match[1].split("@")[1]?.toLowerCase() ?? "";
  const reservedDomain = /(^|\.)(example|invalid|test)$/.test(domain);
  return domain.includes(".") && (isSyntheticCi || !reservedDomain);
}

function validateLocationKeyring(value) {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) return false;
  try {
    const decoded = Buffer.from(value, "base64url");
    if (decoded.toString("base64url") !== value) return false;
    const parsed = JSON.parse(decoded.toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
    if (Object.keys(parsed).sort().join(",") !== "active,keys") return false;
    if (typeof parsed.active !== "string" || !/^v[1-9]\d{0,8}$/.test(parsed.active)) return false;
    if (!parsed.keys || typeof parsed.keys !== "object" || Array.isArray(parsed.keys)) return false;
    const entries = Object.entries(parsed.keys);
    if (entries.length < 1 || entries.length > 8 || !(parsed.active in parsed.keys)) return false;
    return entries.every(([version, key]) =>
      /^v[1-9]\d{0,8}$/.test(version) &&
      typeof key === "string" &&
      /^[A-Za-z0-9_-]+$/.test(key) &&
      Buffer.from(key, "base64url").length === 32 &&
      Buffer.from(key, "base64url").toString("base64url") === key,
    );
  } catch {
    return false;
  }
}

if (process.env.NODE_ENV !== "production") errors.push("NODE_ENV must be production");
if (process.env.HANGTIME_DEMO_MODE === "true" || process.env.DINNER_TIME_DEMO_MODE === "true") {
  errors.push("HANGTIME_DEMO_MODE must not be true");
}
try {
  const parsedDatabase = new URL(databaseUrl);
  if (!["libsql:", "https:"].includes(parsedDatabase.protocol) || !parsedDatabase.hostname) {
    errors.push("TURSO_DATABASE_URL must be a remote libsql or HTTPS database URL");
  }
  if (/^(localhost|127\.|0\.0\.0\.0$|\[?::1\]?$)/i.test(parsedDatabase.hostname)) {
    errors.push("TURSO_DATABASE_URL must not target a local database");
  }
} catch {
  errors.push("TURSO_DATABASE_URL must be a valid remote URL");
}
if (databaseToken.length < 20 || /placeholder|change-me/i.test(databaseToken)) {
  errors.push("TURSO_AUTH_TOKEN must be configured");
}
if (!validateAppOrigin(appUrl)) {
  errors.push("APP_URL must be a public absolute HTTPS origin without credentials, path, query, or fragment");
}
if (authSecret.length < 32 || /dev-only|change-me|placeholder/i.test(authSecret)) {
  errors.push("AUTH_SECRET must be a non-placeholder secret of at least 32 characters");
}
if (!["preview", "production"].includes(channel)) errors.push("RELEASE_CHANNEL must be preview or production");
if (process.env.AUTH_EMAIL_DRIVER !== "resend") errors.push("AUTH_EMAIL_DRIVER=resend is required");
const resendKey = process.env.RESEND_API_KEY?.trim() ?? "";
if (resendKey.length < 16 || /placeholder|change-me/i.test(resendKey)) {
  errors.push("RESEND_API_KEY must be configured");
}
if (!validateSender(process.env.AUTH_EMAIL_FROM?.trim() ?? "")) {
  errors.push("AUTH_EMAIL_FROM must be a syntactically valid sender on a non-reserved domain");
}
if (!validateLocationKeyring(process.env.LOCATION_KEYRING_B64?.trim())) {
  errors.push("LOCATION_KEYRING_B64 must contain a valid active AES-256-GCM keyring");
}

if (errors.length > 0) {
  console.error(`Production environment rejected:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

console.log(`PRODUCTION_ENV_CHECK_PASS channel=${channel}`);
