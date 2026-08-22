"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  Coffee,
  MapPin,
  Plus,
  ShieldCheck,
  Sparkles,
  TrainFront,
  Users,
  Utensils,
  Vote,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/nav";
import { formatCentsToSGD, formatDateLabel } from "@/lib/utils";
import type { Plan, UserProfile } from "@/types";

type Companion = {
  id: string;
  companionId: string;
  displayName: string;
  isFavourite: boolean;
};

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function mealIcon(mealType: Plan["mealType"]) {
  if (mealType === "coffee") return Coffee;
  return Utensils;
}

function statusFor(plan: Plan) {
  if (plan.state === "voting") return { label: "Ready to vote", tone: "ready" };
  if (plan.state === "confirmed") return { label: "Confirmed", tone: "confirmed" };
  if (plan.state === "recommending") return { label: "Finding places", tone: "waiting" };
  return { label: "Waiting on people", tone: "waiting" };
}

export default function HomePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    Promise.all([
      fetch("/api/v1/me").then((response) => response.json()),
      fetch("/api/v1/plans").then((response) => response.json()),
      fetch("/api/v1/companions").then((response) => response.json()),
    ])
      .then(([meData, plansData, companionData]) => {
        if (!active) return;
        setProfile(meData?.data?.profile ?? null);
        setPlans(plansData?.data?.plans ?? []);
        setCompanions(companionData?.data?.companions ?? []);
      })
      .catch(() => {
        if (active) setPlans([]);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const activePlans = useMemo(
    () => plans.filter((plan) => !["completed", "cancelled"].includes(plan.state)),
    [plans],
  );
  const favouriteCompanion =
    companions.find((companion) => companion.isFavourite) ?? companions[0];
  const firstName = profile?.displayName?.split(" ")[0] ?? "there";

  return (
    <div className="min-h-dvh bg-cream-50 pb-24 md:pb-0">
      <Header />

      <main>
        <section className="editorial-hero border-b border-ink-900/15">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 py-10 sm:px-8 md:grid-cols-[0.78fr_1.22fr] md:items-center md:gap-14 md:py-14 lg:px-12 lg:py-16">
            <div className="relative z-10 animate-fade-up">
              <p className="section-kicker">Plans that leave the chat</p>
              <h1 className="mt-5 max-w-[9.5ch] font-display text-[clamp(3.25rem,5.8vw,6.25rem)] font-medium leading-[0.88] tracking-[-0.055em] text-ink-950">
                From “when?” to actually meeting.
              </h1>
              <p className="mt-6 max-w-md text-base leading-7 text-ink-700 sm:text-lg">
                Hi {firstName}. Pick a window; Hangtime balances the journey, budget, and dietary needs—then gives everyone a real choice.
              </p>
              <Link
                href="/plans/new"
                className="mt-7 inline-flex min-h-12 items-center gap-3 border border-terra-700 bg-terra-600 px-5 py-3 text-sm font-bold text-white shadow-[4px_4px_0_#6d291b] transition hover:-translate-y-0.5 hover:bg-terra-700 focus-visible:outline-terra-500"
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-white text-terra-700">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </span>
                Plan our next hangout
              </Link>
              <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-500" aria-label="Hangtime highlights">
                <span>Singapore first</span>
                <span aria-hidden="true" className="text-terra-500">/</span>
                <span>2–3 people</span>
                <span aria-hidden="true" className="text-terra-500">/</span>
                <span>Public transport fair</span>
              </div>
            </div>

            <div className="relative animate-fade-up [animation-delay:100ms]">
              <div className="absolute -inset-3 -rotate-1 border border-sage-700/30 bg-sage-700/90" aria-hidden="true" />
              <article className="meal-ticket relative overflow-hidden border border-ink-900/20 bg-[#fffaf1] shadow-[0_18px_45px_rgb(34_27_20_/_0.18)]">
                <div className="flex items-center justify-between border-b border-ink-900/15 bg-cream-100/75 px-5 py-3 text-[9px] font-bold uppercase tracking-[0.22em] text-ink-600 sm:px-8">
                  <span className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-terra-600" aria-hidden="true" /> Hangtime plan pass</span>
                  <span>HT / 002</span>
                </div>

                <div className="px-5 py-6 sm:px-8 sm:py-7 lg:px-10">
                <div className="flex items-start justify-between gap-6 border-b border-dashed border-ink-900/25 pb-5">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-terra-700">
                      Your next hangout
                    </p>
                    <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink-950 sm:text-4xl">
                      {favouriteCompanion ? `${firstName} × ${favouriteCompanion.displayName}` : `${firstName} × your favourite person`}
                    </h2>
                    <p className="mt-2 text-sm text-ink-600">One shared plan. No twenty-message spiral.</p>
                  </div>
                  <div className="hidden rotate-3 border border-sage-700/35 bg-sage-50 px-3 py-2 text-center text-[8px] font-bold uppercase leading-4 tracking-[0.16em] text-sage-700 sm:block">
                    Private<br />by design
                  </div>
                </div>

                <div className="grid gap-5 py-6 sm:grid-cols-[auto_1fr] sm:items-center">
                  <div className="flex -space-x-3" aria-label="You and your companion">
                    <span className="grid h-14 w-14 place-items-center rounded-full border-4 border-[#fffaf1] bg-ink-900 text-xs font-bold text-white shadow-soft">
                      {profile ? initials(profile.displayName) : "YOU"}
                    </span>
                    <span className="grid h-14 w-14 place-items-center rounded-full border-4 border-[#fffaf1] bg-amber-500 text-xs font-bold text-ink-950 shadow-soft">
                      {favouriteCompanion ? initials(favouriteCompanion.displayName) : "+1"}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 divide-x divide-ink-900/15 border-y border-ink-900/15">
                    <div className="py-3 pr-3">
                      <CalendarDays className="h-4 w-4 text-terra-600" aria-hidden="true" />
                      <b className="mt-2 block text-[8px] uppercase tracking-[0.16em] text-terra-700">01 / When</b>
                      <span className="mt-0.5 block text-[11px] leading-4 text-ink-700">Pick a window</span>
                    </div>
                    <div className="px-3 py-3">
                      <TrainFront className="h-4 w-4 text-sage-700" aria-hidden="true" />
                      <b className="mt-2 block text-[8px] uppercase tracking-[0.16em] text-terra-700">02 / Where</b>
                      <span className="mt-0.5 block text-[11px] leading-4 text-ink-700">Find the fair middle</span>
                    </div>
                    <div className="py-3 pl-3">
                      <Vote className="h-4 w-4 text-plum-700" aria-hidden="true" />
                      <b className="mt-2 block text-[8px] uppercase tracking-[0.16em] text-terra-700">03 / Decide</b>
                      <span className="mt-0.5 block text-[11px] leading-4 text-ink-700">Vote, then book</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3 border-t border-ink-900/15 pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="flex items-center gap-2 text-sm text-ink-600"><MapPin className="h-4 w-4 text-terra-600" aria-hidden="true" />Built around everyone&apos;s journey.</p>
                  <Link
                    href={favouriteCompanion ? `/plans/new?companionId=${favouriteCompanion.companionId}` : "/plans/new"}
                    className="inline-flex min-h-11 items-center justify-center gap-2 bg-terra-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-terra-700"
                  >
                    {favouriteCompanion ? `Start with ${favouriteCompanion.displayName.split(" ")[0]}` : "Start a hangout"} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-10 sm:px-8 lg:px-12">
          <div className="flex items-end justify-between gap-4 border-b border-ink-900/25 pb-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-terra-700">Your table</p>
              <h2 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink-950">Active plans</h2>
            </div>
            <Link href="/plans/new" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-terra-700 hover:text-terra-900">
              New plan <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          {isLoading ? (
            <div role="status" className="grid gap-px bg-ink-900/10" aria-label="Loading your plans" aria-busy="true">
              {[0, 1].map((item) => <div key={item} className="h-28 animate-pulse-soft bg-cream-100" />)}
            </div>
          ) : activePlans.length === 0 ? (
            <div className="border-b border-ink-900/15 py-12 text-center">
              <Utensils className="mx-auto h-8 w-8 text-terra-600" aria-hidden="true" />
              <h3 className="mt-3 font-display text-2xl font-semibold">No plans on the table yet</h3>
              <p className="mt-1 text-sm text-ink-600">Invite someone and turn “anything is fine” into an actual plan.</p>
            </div>
          ) : (
            <div className="divide-y divide-ink-900/15 border-b border-ink-900/15">
              {activePlans.map((plan) => {
                const Icon = mealIcon(plan.mealType);
                const status = statusFor(plan);
                return (
                  <Link
                    key={plan.id}
                    href={`/plans/${plan.id}`}
                    className="group grid min-h-28 grid-cols-[auto_1fr_auto] items-center gap-4 py-5 transition hover:bg-cream-100/60 sm:grid-cols-[minmax(180px,1.3fr)_minmax(170px,1fr)_minmax(120px,.75fr)_minmax(110px,.7fr)_auto] sm:px-3"
                  >
                    <div className="flex items-center gap-4">
                      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-terra-300 bg-terra-50 text-terra-700">
                        <Icon className="h-6 w-6" aria-hidden="true" />
                      </span>
                      <div>
                        <span className="font-display text-xl font-semibold capitalize text-ink-950">{plan.mealType}</span>
                        <span className={`mt-1 flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${status.tone === "ready" ? "bg-sage-100 text-sage-700" : status.tone === "confirmed" ? "bg-terra-100 text-terra-800" : "bg-amber-100 text-amber-900"}`}>
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />{status.label}
                        </span>
                      </div>
                    </div>
                    <div className="col-start-2 flex items-center gap-2 text-sm text-ink-700 sm:col-auto">
                      <CalendarDays className="h-4 w-4 text-ink-500" aria-hidden="true" />
                      {formatDateLabel(plan.date)}
                    </div>
                    <div className="hidden items-center gap-2 text-sm text-ink-700 sm:flex">
                      <Clock3 className="h-4 w-4 text-ink-500" aria-hidden="true" />
                      {plan.windowStart}–{plan.windowEnd}
                    </div>
                    <div className="hidden text-sm text-ink-700 sm:block">
                      <span className="block text-[9px] font-bold uppercase tracking-wider text-ink-500">Group budget</span>
                      {formatCentsToSGD(plan.groupBudgetCents)}
                    </div>
                    <div className="row-span-2 flex items-center gap-3 sm:row-span-1">
                      <span className="hidden items-center gap-1 text-xs text-ink-600 lg:flex"><Users className="h-4 w-4" />{plan.participants?.length ?? 1}</span>
                      <ArrowRight className="h-5 w-5 text-terra-700 transition group-hover:translate-x-1" aria-hidden="true" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          <aside className="mt-8 grid gap-4 border border-sage-700/25 bg-sage-50/60 p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:px-7">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-sage-700 text-white"><ShieldCheck className="h-5 w-5" aria-hidden="true" /></span>
            <div>
              <h3 className="font-display text-lg font-semibold text-ink-950">Your exact address stays private.</h3>
              <p className="mt-0.5 text-sm text-ink-600">Companions see a general area. Precise coordinates are used only to estimate fair public-transport journeys.</p>
            </div>
            <Link href="/privacy" className="inline-flex min-h-11 items-center text-sm font-bold text-sage-700 hover:underline">How privacy works</Link>
          </aside>
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
