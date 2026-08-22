"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, MapPin } from "lucide-react";

function VerifyContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "verifying" | "error">("idle");
  const [message, setMessage] = useState("");

  const verify = async () => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const token = fragment.get("token") || "";
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    if (!token) {
      setStatus("error");
      setMessage("This sign-in link is invalid or expired.");
      return;
    }
    setStatus("verifying");
    setMessage("");
    const response = await fetch("/api/v1/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setStatus("error");
      setMessage(payload?.error?.message || "This sign-in link could not be verified.");
      return;
    }
    const next = searchParams.get("next");
    router.replace(next?.startsWith("/") && !next.startsWith("//") ? next : "/");
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-cream-50 px-5 py-12">
      <section className="w-full max-w-md border border-ink-900/20 bg-[#fffaf1] p-7 text-center shadow-pop sm:p-10">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-sage-100 text-sage-700">
          <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
        </span>
        <p className="section-kicker mt-6">One last step</p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink-950">
          Continue to Hangtime
        </h1>
        <p className="mt-3 leading-7 text-ink-600">
          Confirm below to use this one-time link. It will stop working immediately afterward.
        </p>
        <button
          type="button"
          onClick={verify}
          disabled={status === "verifying"}
          className="mt-7 min-h-12 w-full border border-terra-800 bg-terra-600 px-5 py-3 font-bold text-white shadow-[4px_4px_0_#6d291b] hover:bg-terra-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "verifying" ? "Signing you in…" : "Sign in securely"}
        </button>
        {status === "error" && (
          <p className="mt-5 border border-red-700/30 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {message} <Link href="/sign-in" className="font-bold underline">Request a new link</Link>
          </p>
        )}
        <Link href="/sign-in" className="mt-7 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-ink-600 hover:underline">
          <MapPin className="h-4 w-4" aria-hidden="true" /> Back to sign in
        </Link>
      </section>
    </main>
  );
}

export default function VerifyPage() {
  return <Suspense fallback={<main className="grid min-h-dvh place-items-center bg-cream-50">Loading secure link…</main>}><VerifyContent /></Suspense>;
}
