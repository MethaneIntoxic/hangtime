import { describe, expect, it } from "vitest";
import {
  createDemoSessionToken,
  isDevelopmentDemoMode,
  verifyDemoSessionToken,
} from "@/lib/auth/demo-session";
import {
  decidePlanAccess,
  stripPrivateLocationFields,
} from "@/lib/auth/plan-access";
import { validatePlanInvite } from "@/lib/auth/invites";

describe("signed demo sessions", () => {
  const secret = "test-secret-with-enough-entropy";
  const nowMs = Date.UTC(2026, 7, 17, 12, 0, 0);

  it("accepts an untampered, unexpired token", () => {
    const token = createDemoSessionToken("user_maya", secret, {
      nowMs,
      ttlSeconds: 60,
    });
    expect(verifyDemoSessionToken(token, secret, nowMs + 30_000)).toBe(
      "user_maya"
    );
  });

  it("rejects tampering, wrong secrets, and expiration", () => {
    const token = createDemoSessionToken("user_maya", secret, {
      nowMs,
      ttlSeconds: 60,
    });
    const [payload, signature] = token.split(".");
    expect(
      verifyDemoSessionToken(`${payload}x.${signature}`, secret, nowMs)
    ).toBeNull();
    expect(verifyDemoSessionToken(token, "wrong-secret", nowMs)).toBeNull();
    expect(verifyDemoSessionToken(token, secret, nowMs + 60_000)).toBeNull();
  });

  it("requires the explicit demo-mode flag", () => {
    expect(
      isDevelopmentDemoMode({
        HANGTIME_DEMO_MODE: "true",
        NODE_ENV: "development",
      })
    ).toBe(true);
    expect(
      isDevelopmentDemoMode({
        HANGTIME_DEMO_MODE: "true",
        NODE_ENV: "production",
      })
    ).toBe(false);
    expect(isDevelopmentDemoMode({ HANGTIME_DEMO_MODE: "false" })).toBe(
      false
    );
    expect(isDevelopmentDemoMode({ DINNER_TIME_DEMO_MODE: "true" })).toBe(true);
    expect(isDevelopmentDemoMode({})).toBe(false);
  });
});

describe("plan authorization", () => {
  const plan = {
    organizerId: "organizer",
    participantUserIds: ["organizer", "member"],
  };

  it("allows members while rejecting outsiders", () => {
    expect(
      decidePlanAccess({ ...plan, userId: "member" }, "member")
    ).toBe(true);
    expect(
      decidePlanAccess({ ...plan, userId: "outsider" }, "member")
    ).toBe(false);
  });

  it("reserves organizer operations for the organizer", () => {
    expect(
      decidePlanAccess({ ...plan, userId: "organizer" }, "organizer")
    ).toBe(true);
    expect(
      decidePlanAccess({ ...plan, userId: "member" }, "organizer")
    ).toBe(false);
  });

  it("removes exact location fields from participant payloads", () => {
    const safe = stripPrivateLocationFields({
      id: "participant",
      coarseOriginLabel: "Novena",
      postalCode: "307683",
      lat: 1.3204,
      lng: 103.8436,
    });
    expect(safe).toEqual({
      id: "participant",
      coarseOriginLabel: "Novena",
    });
  });
});

describe("plan invitations", () => {
  const nowMs = Date.UTC(2026, 7, 17, 12, 0, 0);
  const baseInvite = {
    planId: "plan_1",
    email: "guest@example.com",
    expiresAt: new Date(nowMs + 60_000).toISOString(),
    acceptedAt: null,
  };

  it("accepts a valid, intended-email-bound invite", () => {
    expect(
      validatePlanInvite(baseInvite, {
        planId: "plan_1",
        userEmail: "GUEST@example.com",
        nowMs,
      })
    ).toEqual({ valid: true });
  });

  it("rejects expired, consumed, cross-plan, and wrong-email invites", () => {
    expect(
      validatePlanInvite(
        { ...baseInvite, expiresAt: new Date(nowMs).toISOString() },
        { planId: "plan_1", userEmail: "guest@example.com", nowMs }
      )
    ).toMatchObject({ valid: false, code: "INVITE_EXPIRED" });
    expect(
      validatePlanInvite(
        { ...baseInvite, acceptedAt: new Date(nowMs - 1).toISOString() },
        { planId: "plan_1", userEmail: "guest@example.com", nowMs }
      )
    ).toMatchObject({ valid: false, code: "INVITE_ALREADY_USED" });
    expect(
      validatePlanInvite(baseInvite, {
        planId: "plan_2",
        userEmail: "guest@example.com",
        nowMs,
      })
    ).toMatchObject({ valid: false, code: "INVALID_INVITE" });
    expect(
      validatePlanInvite(baseInvite, {
        planId: "plan_1",
        userEmail: "outsider@example.com",
        nowMs,
      })
    ).toMatchObject({ valid: false, code: "INVITE_EMAIL_MISMATCH" });
  });
});
