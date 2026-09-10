import Link from "next/link";
import { Header } from "@/components/layout/header";

export default function JoinRecoveryPage() {
  return (
    <div className="min-h-dvh bg-cream-50">
      <Header />
      <main className="mx-auto max-w-xl px-5 py-10 sm:px-8 sm:py-14">
        <section className="border border-ink-900/20 bg-[#fffaf1] p-6 text-center shadow-lift sm:p-8" role="status">
          <p className="section-kicker">Invitation link</p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink-950">Reopen your invitation</h1>
          <p className="mt-4 text-sm leading-6 text-ink-700">
            For your security, the invitation address was cleared before sign-in could continue. Reopen the original invitation link to try again. We do not store the link here.
          </p>
          <Link href="/" className="mt-6 inline-flex min-h-12 items-center justify-center border border-terra-800 bg-terra-600 px-5 py-3 font-bold text-white shadow-[4px_4px_0_#6d291b] hover:bg-terra-700">
            Return home
          </Link>
        </section>
      </main>
    </div>
  );
}
