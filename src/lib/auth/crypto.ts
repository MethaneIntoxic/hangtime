import crypto from "node:crypto";

export function generateId(prefix = "id"): string {
  const rand = crypto.randomBytes(8).toString("hex");
  return `${prefix}_${rand}`;
}

export function generateToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
