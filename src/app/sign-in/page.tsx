"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Mail, MapPin } from "lucide-react";

function SignInContent() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("sending");
    setMessage("");
    const response = await fetch("/api/v1/auth/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, returnTo: searchParams.get("next") || "/" }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setStatus("error");
      setMessage(payload?.error?.message || "The sign-in email could not be sent.");
      return;
    }
    setStatus("sent");
    setMessage("Check your inbox. The one-time link expires in 15 minutes.");
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-cream-50 px-5 py-12">
      <section className="w-full max-w-md border border-ink-900/20 bg-[#fffaf1] p-7 shadow-pop sm:p-10">
        <Link href="/" className="flex w-fit items-center gap-3" aria-label="Hangtime home">
          <span className="relative grid h-10 w-10 place-items-center text-terra-700">
            <MapPin className="h-9 w-9" aria-hidden="true" />
          </span>
          <span className="font-display text-2xl font-semibold uppercase tracking-[0.045em] text-ink-950">
            Hangtime
          </span>
        </Link>
        <p className="section-kicker mt-9">Welcome back</p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink-950">
          Make time for your people.
        </h1>
        <p className="mt-3 leading-7 text-ink-600">
          Enter your email and we&apos;ll send a secure, one-time sign-in link. No password needed.
        </p>

        <form className="mt-7" onSubmit={submit}>
          <label htmlFor="email" className="text-sm font-bold text-ink-900">Email address</label>
          <div className="mt-2 flex min-h-12 items-center gap-3 border border-ink-900/30 bg-white px-4 focus-within:outline focus-within:outline-2 focus-within:outline-terra-500">
            <Mail className="h-5 w-5 text-ink-500" aria-hidden="true" />
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="min-w-0 flex-1 bg-transparent py-3 outline-none"
              placeholder="you@example.com"
            />
          </div>
          <button
            type="submit"
            disabled={status === "sending" || status === "sent"}
            className="mt-4 min-h-12 w-full border border-terra-800 bg-terra-600 px-5 py-3 font-bold text-white shadow-[4px_4px_0_#6d291b] transition hover:bg-terra-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "sending" ? "Sending…" : status === "sent" ? "Email sent" : "Email me a sign-in link"}
          </button>
        </form>

        {message && (
          <p
            className={`mt-5 border px-4 py-3 text-sm ${status === "error" ? "border-red-700/30 bg-red-50 text-red-800" : "border-sage-700/30 bg-sage-50 text-sage-800"}`}
            role={status === "error" ? "alert" : "status"}
          >
            {message}
          </p>
        )}
        <p className="mt-7 text-xs leading-5 text-ink-500">
          For your security, each link works once. Hangtime never puts your precise location in sign-in emails.
        </p>
      </section>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<main className="grid min-h-dvh place-items-center bg-cream-50">Loading sign in…</main>}>
      <SignInContent />
    </Suspense>
  );
}
