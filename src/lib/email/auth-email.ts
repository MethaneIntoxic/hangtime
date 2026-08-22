import fs from "node:fs";
import path from "node:path";

export interface AuthEmailResult {
  providerMessageId: string | null;
}

export async function sendMagicLinkEmail(input: {
  email: string;
  magicLinkUrl: string;
  expiresAt: string;
}): Promise<AuthEmailResult> {
  const driver = process.env.AUTH_EMAIL_DRIVER || "resend";
  if (driver === "test") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("The test email driver is forbidden in production.");
    }
    const outboxPath = process.env.AUTH_TEST_EMAIL_OUTBOX_PATH;
    if (!outboxPath) throw new Error("AUTH_TEST_EMAIL_OUTBOX_PATH is required.");
    fs.mkdirSync(path.dirname(outboxPath), { recursive: true });
    fs.appendFileSync(
      outboxPath,
      `${JSON.stringify({ ...input, createdAt: new Date().toISOString() })}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    return { providerMessageId: null };
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.AUTH_EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    throw new Error("Production email delivery is not configured.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.email],
      subject: "Your Hangtime sign-in link",
      text: `Sign in to Hangtime: ${input.magicLinkUrl}\n\nThis link expires at ${input.expiresAt} and can be used once.`,
      html: `<p>Use the button below to sign in to Hangtime.</p><p><a href="${input.magicLinkUrl}">Sign in to Hangtime</a></p><p>This one-time link expires in 15 minutes.</p>`,
    }),
  });
  if (!response.ok) {
    throw new Error(`Email provider rejected the request (${response.status}).`);
  }
  const payload = (await response.json()) as { id?: string };
  return { providerMessageId: payload.id ?? null };
}
