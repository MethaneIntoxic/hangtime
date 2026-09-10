import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  cookieValues: new Map<string, string>(),
  deleted: [] as string[],
  issuedContinuationId: null as string | null,
  issuedDisposition: "none" as "none" | "bound" | "email_mismatch" | "unavailable",
  sent: [] as Array<{ magicLinkUrl: string }>,
  deliveryFails: false,
  currentUser: null as unknown,
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => state.cookieValues.has(name) ? { value: state.cookieValues.get(name) } : undefined,
    set: (name: string, value: string) => state.cookieValues.set(name, value),
    delete: (name: string) => { state.deleted.push(name); state.cookieValues.delete(name); },
  })),
}));

vi.mock("@/lib/db", () => ({ client: {} }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn(async () => state.currentUser) }));
vi.mock("@/lib/auth/request-security", () => ({
  consumeRateLimit: vi.fn(async () => true),
  getTrustedClientAddress: vi.fn(() => "test-client"),
  isAllowedRequestOrigin: vi.fn(() => true),
  normalizeEmail: (email: string) => email.trim().toLowerCase(),
  safeInternalReturnTo: (value: unknown) => typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/",
}));
vi.mock("@/lib/auth/magic-link", () => ({
  deleteExpiredAuthRecords: vi.fn(async () => undefined),
  issueMagicLink: vi.fn(async () => ({ id: "link-1", email: "guest@example.com", token: "raw-magic-token", expiresAt: "2026-08-25T00:00:00.000Z", continuationId: state.issuedContinuationId, continuationDisposition: state.issuedDisposition })),
  updateMagicLinkDelivery: vi.fn(async () => undefined),
  consumeMagicLink: vi.fn(),
}));
vi.mock("@/lib/email/auth-email", () => ({
  sendMagicLinkEmail: vi.fn(async (input: { magicLinkUrl: string }) => {
    state.sent.push(input);
    if (state.deliveryFails) throw new Error("delivery failed");
    return { providerMessageId: null };
  }),
}));
vi.mock("@/lib/auth/invite-continuation", () => ({
  createInviteContinuation: vi.fn(async () => null),
  inviteContinuationCookieName: () => "hangtime_invite_continuation",
  inviteContinuationCookieOptions: () => ({ path: "/", httpOnly: true, sameSite: "lax", secure: false, maxAge: 600 }),
}));
vi.mock("@/lib/auth/crypto", () => ({
  hashToken: (value: string) => `hash:${value}`,
  generateId: (prefix: string) => `${prefix}-test`,
}));
vi.mock("@/lib/auth/invites", () => ({ validatePlanInvite: vi.fn(() => ({ valid: false })) }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

import { POST as continuationPOST } from "@/app/api/v1/invites/continuation/route";
import { POST as magicLinkPOST } from "@/app/api/v1/auth/magic-link/route";
import { GET as rawPreviewGET } from "@/app/api/v1/invites/[token]/route";

function jsonRequest(url: string, body: unknown, contentType = "application/json") {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": contentType, origin: "http://localhost:3000" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.cookieValues.clear();
  state.deleted.length = 0;
  state.sent.length = 0;
  state.issuedContinuationId = null;
  state.issuedDisposition = "none";
  state.deliveryFails = false;
  state.currentUser = null;
  process.env.AUTH_SECRET = "test-secret-at-least-thirty-two-characters";
  process.env.APP_URL = "http://localhost:3000";
});

describe("API invitation/auth route hardening", () => {
  it("rejects non-JSON magic-link requests with no-store and does not issue", async () => {
    const response = await magicLinkPOST(jsonRequest("http://localhost:3000/api/v1/auth/magic-link", { email: "guest@example.com" }, "text/plain"));
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("clears a stale continuation cookie after a generic invalid-token handoff", async () => {
    state.cookieValues.set("hangtime_invite_continuation", "old-handle");
    const response = await continuationPOST(jsonRequest("http://localhost:3000/api/v1/invites/continuation", { inviteToken: "invalid-token-that-is-long-enough-123456789" }));
    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(state.deleted).toContain("hangtime_invite_continuation");
  });

  it("clears invalid continuation before ordinary email delivery and never puts raw invite data in the URL", async () => {
    state.cookieValues.set("hangtime_invite_continuation", "stale-handle");
    state.issuedDisposition = "unavailable";
    const response = await magicLinkPOST(jsonRequest("http://localhost:3000/api/v1/auth/magic-link", {
      email: "guest@example.com", returnTo: "/join/attacker",
    }));
    expect(response.status).toBe(202);
    expect(state.deleted).toContain("hangtime_invite_continuation");
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0].magicLinkUrl).not.toContain("stale-handle");
    expect(state.sent[0].magicLinkUrl).not.toContain("raw-invite");
    expect(state.sent[0].magicLinkUrl).not.toContain("/join/attacker");
  });

  it.each([
    ["direct", "/join/direct-canary-token"],
    ["nested", "/sign-in?next=/join/nested-canary-token"],
    ["encoded", "/%6ao%69n/%64irect/encoded-canary-token"],
    ["normalized alias", "/foo/../join/resume"],
    ["fragment", "/join/resume#fragment-canary-token"],
    ["resume query", "/join/resume?next=/join/query-canary-token"],
  ])("coerces %s unbound return paths to home in the captured email URL", async (_label, returnTo) => {
    const response = await magicLinkPOST(jsonRequest("http://localhost:3000/api/v1/auth/magic-link", {
      email: "guest@example.com",
      returnTo,
    }));

    expect(response.status).toBe(202);
    const verificationUrl = new URL(state.sent[0].magicLinkUrl);
    expect(verificationUrl.searchParams.get("next")).toBeNull();
    expect(state.sent[0].magicLinkUrl).not.toMatch(/canary-token/);
  });

  it("preserves the exact token-free resume destination for an unbound request", async () => {
    const response = await magicLinkPOST(jsonRequest("http://localhost:3000/api/v1/auth/magic-link", {
      email: "guest@example.com",
      returnTo: "/join/resume",
    }));

    expect(response.status).toBe(202);
    const verificationUrl = new URL(state.sent[0].magicLinkUrl);
    expect(verificationUrl.searchParams.get("next")).toBe("/join/resume");
  });

  it("preserves wrong-email continuation, then binds it for the intended email", async () => {
    state.cookieValues.set("hangtime_invite_continuation", "handoff-handle");
    state.issuedDisposition = "email_mismatch";
    const mismatch = await magicLinkPOST(jsonRequest("http://localhost:3000/api/v1/auth/magic-link", { email: "wrong@example.com" }));
    expect(mismatch.status).toBe(202);
    expect(state.deleted).not.toContain("hangtime_invite_continuation");

    state.issuedContinuationId = "continuation-1";
    state.issuedDisposition = "bound";
    const intended = await magicLinkPOST(jsonRequest("http://localhost:3000/api/v1/auth/magic-link", { email: "guest@example.com" }));
    expect(intended.status).toBe(202);
    expect(new URL(state.sent.at(-1)!.magicLinkUrl).searchParams.get("next")).toBe("/join/resume");
    expect(state.deleted).toContain("hangtime_invite_continuation");
  });

  it("preserves a valid continuation when delivery fails", async () => {
    state.cookieValues.set("hangtime_invite_continuation", "valid-handle");
    state.issuedContinuationId = "continuation-1";
    state.issuedDisposition = "bound";
    state.deliveryFails = true;
    const response = await magicLinkPOST(jsonRequest("http://localhost:3000/api/v1/auth/magic-link", { email: "guest@example.com" }));
    expect(response.status).toBe(503);
    expect(state.deleted).not.toContain("hangtime_invite_continuation");
  });

  it("does not reveal anonymous raw-token preview state and marks it no-store", async () => {
    const response = await rawPreviewGET(new Request("http://localhost:3000/join/raw-token"), { params: Promise.resolve({ token: "raw-invite-token" }) });
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
