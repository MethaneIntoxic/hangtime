"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Mail, MapPin } from "lucide-react";
import { safeReturnTo } from "@/app/join/join-flow";

function SignInContent() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");
  const next = safeReturnTo(searchParams.get("next"));

  useEffect(() => {
    const requestedNext = searchParams.get("next");
    if (requestedNext === next) return;
    const cleanUrl = next === "/" ? "/sign-in" : `/sign-in?next=${encodeURIComponent(next)}`;
    window.history.replaceState(null, "", cleanUrl);
  }, [next, searchParams]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("sending");
    setMessage("");
    try {
      const response = await fetch("/api/v1/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        referrerPolicy: "no-referrer",
        body: JSON.stringify({ email, returnTo: next }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setStatus("error");
        setMessage(payload?.error?.message || "The sign-in email could not be sent.");
        return;
      }
      setStatus("sent");
      setMessage(next === "/join/resume"
        ? "Check your email on any device. We’ll return you to this invitation."
        : "Check your inbox. The one-time link expires in 15 minutes.");
    } catch {
      setStatus("error");
      setMessage("We couldn’t request a sign-in link. Check your connection and try again.");
    }
  };

  const changeEmail = () => {
    setStatus("idle");
    setMessage("");
  };

  return (
    <main className="grid min-h-dvh min-w-0 place-items-center bg-cream-50 px-5 py-12">
      <section className="min-w-0 w-full max-w-md border border-ink-900/20 bg-[#fffaf1] p-7 shadow-pop sm:p-10">
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
            disabled={status === "sending"}
            className="mt-4 min-h-12 w-full border border-terra-800 bg-terra-600 px-5 py-3 font-bold text-white shadow-[4px_4px_0_#6d291b] transition hover:bg-terra-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "sending" ? "Sending…" : status === "sent" ? "Send again" : "Email me a sign-in link"}
          </button>
        </form>

        {status === "sent" && (
          <button type="button" onClick={changeEmail} className="mt-3 min-h-11 w-full border border-ink-900/25 px-5 py-3 text-sm font-bold text-ink-700 hover:bg-cream-100">
            Change email address
          </button>
        )}

        {message && (
          <p
            className={`mt-5 border px-4 py-3 text-sm ${status === "error" ? "border-red-700/30 bg-red-50 text-red-800" : "border-sage-700/30 bg-sage-50 text-sage-800"}`}
            role={status === "error" ? "alert" : "status"}
          >
            {message}
          </p>
        )}
        <p className="mt-7 text-xs leading-5 text-ink-500">
          For your security, each link works once. Hangtime never puts your precise location or invitation token in sign-in emails.
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
