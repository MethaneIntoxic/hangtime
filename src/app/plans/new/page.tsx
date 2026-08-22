"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/nav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  UtensilsCrossed,
  Salad,
  Croissant,
  Coffee,
  Users,
  DollarSign,
  Scale,
  Zap,
  Wine,
  ArrowRight,
  Check,
} from "lucide-react";

const MEAL_TYPES = [
  { id: "dinner", label: "Dinner", icon: UtensilsCrossed, desc: "Evenings & suppers" },
  { id: "lunch", label: "Lunch", icon: Salad, desc: "Midday catchups" },
  { id: "brunch", label: "Brunch", icon: Croissant, desc: "Weekend mornings" },
  { id: "coffee", label: "Coffee / Cafe", icon: Coffee, desc: "Pastries & brew" },
  { id: "drinks", label: "Drinks & Tapas", icon: Wine, desc: "Cocktails & bites" },
];

function NewPlanForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedCompanionId = searchParams.get("companionId");
  const { toast } = useToast();

  const [companions, setCompanions] = useState<{ id: string; companionId: string; displayName: string; coarseArea?: string }[]>([]);
  const [selectedCompanionIds, setSelectedCompanionIds] = useState<string[]>([]);
  const [mealType, setMealType] = useState<string>("dinner");
  const [date, setDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().split("T")[0];
  });
  const [windowStart, setWindowStart] = useState<string>("19:00");
  const [windowEnd, setWindowEnd] = useState<string>("21:30");
  const [groupBudgetSGD, setGroupBudgetSGD] = useState<number>(140);
  const [alcoholMode, setAlcoholMode] = useState<"included" | "excluded">("excluded");
  const [fairnessMode, setFairnessMode] = useState<"equal_journeys" | "lowest_total_time">("equal_journeys");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let ignore = false;
    fetch("/api/v1/companions")
      .then((r) => r.json())
      .then((data) => {
        if (!ignore && data?.data?.companions) {
          setCompanions(data.data.companions);
          if (preselectedCompanionId) {
            setSelectedCompanionIds([preselectedCompanionId]);
          }
        }
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [preselectedCompanionId]);

  const toggleCompanion = (cId: string) => {
    if (selectedCompanionIds.includes(cId)) {
      setSelectedCompanionIds(selectedCompanionIds.filter((id) => id !== cId));
    } else {
      if (selectedCompanionIds.length >= 2) {
        toast("Maximum 3 people total in MVP (you + 2 companions)", "info");
        return;
      }
      setSelectedCompanionIds([...selectedCompanionIds, cId]);
    }
  };

  const totalDiners = 1 + selectedCompanionIds.length;
  const perPersonSGD = Math.round(groupBudgetSGD / totalDiners);
  const selectedMeal = MEAL_TYPES.find((item) => item.id === mealType) ?? MEAL_TYPES[0];
  const selectedNames = companions
    .filter((companion) => selectedCompanionIds.includes(companion.companionId))
    .map((companion) => companion.displayName.split(" ")[0]);

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedCompanionIds.length === 0) {
      toast("Please pick at least one companion to dine with.", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/v1/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mealType,
          date,
          windowStart,
          windowEnd,
          groupBudgetCents: groupBudgetSGD * 100,
          alcoholMode,
          fairnessMode,
          companionIds: selectedCompanionIds,
        }),
      });

      const data = await res.json();
      if (res.ok && data?.data?.planId) {
        toast("Hangout created! Opening lobby…", "success");
        router.push(`/plans/${data.data.planId}`);
      } else {
        toast(data.error?.message || "Failed to create plan", "error");
      }
    } catch {
      toast("Could not create the hangout", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleCreatePlan} className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="brand-rule divide-y divide-ink-900/25 bg-cream-50">
      {/* Step 1: Who's Dining? */}
      <Card variant="default" className="space-y-3 rounded-none border-0 p-5 shadow-none sm:p-7">
        <div className="flex items-center justify-between border-b border-cream-200 pb-2">
          <div className="flex items-center gap-2">
            <Users aria-hidden="true" className="h-4 w-4 text-terra-600" />
            <h2 className="text-sm font-extrabold uppercase tracking-[0.12em] text-ink-900">
              1. Who&apos;s coming? ({totalDiners}/3 people)
            </h2>
          </div>
          <span className="text-[11px] text-ink-500">Pick 1 or 2 companions</span>
        </div>

        <div className="grid gap-2">
          {companions.map((comp) => {
            const isSelected = selectedCompanionIds.includes(comp.companionId);
            return (
              <button
                type="button"
                key={comp.id}
                onClick={() => toggleCompanion(comp.companionId)}
                aria-pressed={isSelected}
                className={`flex min-h-14 w-full cursor-pointer items-center justify-between border p-3 text-left transition-all ${
                  isSelected
                    ? "border-terra-500 bg-terra-50 shadow-[3px_3px_0_#e3472d]"
                    : "border-ink-900/20 bg-cream-50 hover:border-terra-400"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-full border border-cream-300 bg-amber-100 text-[10px] font-extrabold text-ink-900">
                    {comp.displayName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <p className="text-xs font-bold text-ink-950">{comp.displayName}</p>
                    <p className="text-[10px] text-ink-500">
                      {comp.coarseArea || "Singapore"}
                    </p>
                  </div>
                </div>

                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-lg border transition-all ${
                    isSelected
                      ? "bg-terra-500 text-white border-terra-600"
                      : "border-cream-300 bg-cream-50 text-transparent"
                  }`}
                >
                  <Check className="h-4 w-4" />
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Step 2: Meal Type, Date & Time Window */}
      <Card variant="default" className="space-y-5 rounded-none border-0 p-5 shadow-none sm:p-7">
        <div className="flex items-center gap-2 border-b border-cream-200 pb-2">
            <UtensilsCrossed aria-hidden="true" className="h-4 w-4 text-terra-600" />
          <h2 className="text-sm font-extrabold uppercase tracking-[0.12em] text-ink-900">
            2. When & What?
          </h2>
        </div>

        {/* Meal Type Radio Grid */}
          <fieldset className="space-y-1.5">
            <legend id="occasion-label" className="text-xs font-semibold text-ink-700 block">Occasion</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {MEAL_TYPES.map((mt) => {
              const isSelected = mealType === mt.id;
              const OccasionIcon = mt.icon;
              return (
                <div key={mt.id}>
                  <input
                    id={`occasion-${mt.id}`}
                    type="radio"
                    name="mealType"
                    value={mt.id}
                    checked={isSelected}
                    onChange={() => setMealType(mt.id)}
                    className="peer sr-only"
                  />
                  <label
                    htmlFor={`occasion-${mt.id}`}
                    className={`min-h-28 cursor-pointer border p-3 text-left transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-terra-400 ${
                      isSelected
                        ? "border-terra-500 bg-terra-50 shadow-[3px_3px_0_#e3472d]"
                        : "border-ink-900/20 bg-cream-50 hover:border-terra-300"
                  }`}
                >
                  <OccasionIcon className="mb-4 h-5 w-5 text-terra-600" aria-hidden="true" />
                  <p className="text-xs font-extrabold uppercase tracking-wide text-ink-950">{mt.label}</p>
                  <p className="mt-1 text-xs text-ink-500">{mt.desc}</p>
                  </label>
                </div>
              );
            })}
            </div>
          </fieldset>

        {/* Date & Time Window Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="plan-date" className="text-xs font-semibold text-ink-700 block mb-1">
              Date
            </label>
            <input
              id="plan-date"
              name="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="min-h-11 w-full rounded-[2px] border border-ink-900/25 bg-cream-50 px-3 py-2 text-sm font-semibold text-ink-900 focus:border-terra-500"
              required
            />
          </div>

          <div>
            <label htmlFor="window-start" className="text-xs font-semibold text-ink-700 block mb-1">
              Window Start
            </label>
            <select
              id="window-start"
              name="windowStart"
              value={windowStart}
              onChange={(e) => setWindowStart(e.target.value)}
              className="min-h-11 w-full rounded-[2px] border border-ink-900/25 bg-cream-50 px-3 py-2 text-sm font-semibold text-ink-900 focus:border-terra-500"
            >
              {["11:30", "12:00", "12:30", "13:00", "18:00", "18:30", "19:00", "19:30", "20:00"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="window-end" className="text-xs font-semibold text-ink-700 block mb-1">
              Window End
            </label>
            <select
              id="window-end"
              name="windowEnd"
              value={windowEnd}
              onChange={(e) => setWindowEnd(e.target.value)}
              className="min-h-11 w-full rounded-[2px] border border-ink-900/25 bg-cream-50 px-3 py-2 text-sm font-semibold text-ink-900 focus:border-terra-500"
            >
              {["13:30", "14:00", "14:30", "20:30", "21:00", "21:30", "22:00", "22:30"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Step 3: Budget & Travel Fairness */}
      <Card variant="default" className="space-y-5 rounded-none border-0 p-5 shadow-none sm:p-7">
        <div className="flex items-center gap-2 border-b border-cream-200 pb-2">
          <DollarSign className="h-4 w-4 text-terra-600" />
          <h2 className="text-sm font-extrabold uppercase tracking-[0.12em] text-ink-900">
            3. Budget & Fairness
          </h2>
        </div>

        {/* Total Budget Slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="group-budget" className="text-xs font-semibold text-ink-700">
              Total Group Budget (SGD)
            </label>
            <span className="font-display text-base font-bold text-terra-600">
              S${groupBudgetSGD} Total{" "}
              <span className="text-xs font-normal text-ink-500">
                (~S${perPersonSGD}/person)
              </span>
            </span>
          </div>
          <input
            id="group-budget"
            name="groupBudget"
            type="range"
            min="40"
            max="400"
            step="10"
            value={groupBudgetSGD}
            onChange={(e) => setGroupBudgetSGD(Number(e.target.value))}
            className="w-full accent-terra-500 h-2 bg-cream-200 rounded-lg cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-ink-400">
            <span>S$40 (Casual)</span>
            <span>S$140 (Mid-Range)</span>
            <span>S$400 (Splurge)</span>
          </div>
        </div>

        {/* Alcohol Toggle */}
        <div className="flex items-center justify-between border-y border-ink-900/20 bg-cream-100/60 p-3">
          <div className="flex items-center gap-2.5">
            <Wine aria-hidden="true" className="h-4 w-4 text-plum-700" />
            <div>
              <p className="text-xs font-bold text-ink-900">Include Drinks / Alcohol?</p>
              <p className="text-[10px] text-ink-500">
                Adds estimated craft beer / cocktail surcharge per person
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAlcoholMode(alcoholMode === "included" ? "excluded" : "included")}
            aria-pressed={alcoholMode === "included"}
            aria-label="Include drinks and alcohol"
            className={`min-h-11 border px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-all ${
              alcoholMode === "included"
                ? "bg-plum-700 text-white shadow-soft"
                : "bg-cream-200 text-ink-700 hover:bg-cream-300"
            }`}
          >
            {alcoholMode === "included" ? "✓ Included" : "Excluded"}
          </button>
        </div>

        {/* Travel Fairness Mode Selector */}
        <fieldset className="space-y-1.5">
          <legend id="fairness-label" className="text-xs font-semibold text-ink-700 block">
            Travel Fairness Priority
          </legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <input
                id="fairness-equal-journeys"
                type="radio"
                name="fairnessMode"
                value="equal_journeys"
                checked={fairnessMode === "equal_journeys"}
                onChange={() => setFairnessMode("equal_journeys")}
                className="peer sr-only"
              />
              <label
                htmlFor="fairness-equal-journeys"
                className={`min-h-28 cursor-pointer border p-4 text-left transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-terra-400 ${
                fairnessMode === "equal_journeys"
                  ? "border-terra-500 bg-terra-50 shadow-[3px_3px_0_#e3472d]"
                  : "border-ink-900/20 bg-cream-50 hover:border-terra-300"
              }`}
            >
              <Scale aria-hidden="true" className="h-4 w-4 text-terra-600 mb-1" />
              <p className="text-xs font-bold text-ink-950">Fairest Journeys</p>
              <p className="text-[10px] text-ink-500 mt-0.5">
                Equalizes MRT/bus travel time so no one takes a disproportionately long trip.
              </p>
              </label>
            </div>

            <div>
              <input
                id="fairness-lowest-total-time"
                type="radio"
                name="fairnessMode"
                value="lowest_total_time"
                checked={fairnessMode === "lowest_total_time"}
                onChange={() => setFairnessMode("lowest_total_time")}
                className="peer sr-only"
              />
              <label
                htmlFor="fairness-lowest-total-time"
                className={`min-h-28 cursor-pointer border p-4 text-left transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-terra-400 ${
                fairnessMode === "lowest_total_time"
                  ? "border-terra-500 bg-terra-50 shadow-[3px_3px_0_#e3472d]"
                  : "border-ink-900/20 bg-cream-50 hover:border-terra-300"
              }`}
            >
              <Zap aria-hidden="true" className="h-4 w-4 text-amber-900 mb-1" />
              <p className="text-xs font-bold text-ink-950">Fastest Group Trip</p>
              <p className="text-[10px] text-ink-500 mt-0.5">
                Minimizes total combined transit time across all participants.
              </p>
              </label>
            </div>
          </div>
        </fieldset>
      </Card>

      {/* Submit Button */}
      <div className="border-t border-ink-900/25 bg-terra-500 p-3">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          isLoading={isSubmitting}
          className="w-full border border-white/50 bg-ink-950 text-base font-bold text-white shadow-none hover:bg-ink-900"
        >
          <ArrowRight className="h-5 w-5" />
          <span>Create Plan & Go to Lobby</span>
        </Button>
      </div>
      </div>

      <aside className="paper-panel lg:sticky lg:top-24" aria-label="Live plan docket">
        <div className="flex items-center justify-between border-b border-ink-900/30 bg-ink-950 px-5 py-4 text-cream-50">
          <span className="text-xs font-extrabold uppercase tracking-[0.18em]">Plan docket</span>
          <span className="route-code text-sage-500">HT–SG / 23</span>
        </div>
        <div className="space-y-6 p-5">
          <section>
            <p className="route-code">01 / Company</p>
            <p className="mt-2 font-display text-2xl font-semibold text-ink-950">{totalDiners} people</p>
            <p className="mt-1 text-sm text-ink-600">{selectedNames.length ? `You + ${selectedNames.join(" + ")}` : "Choose at least one companion"}</p>
          </section>
          <section className="border-t border-dashed border-ink-900/30 pt-5">
            <p className="route-code">02 / Occasion</p>
            <p className="mt-2 text-sm font-extrabold uppercase tracking-wide text-terra-700">{selectedMeal.label}</p>
            <p className="mt-1 text-sm text-ink-600">{date || "Choose a date"} · {windowStart}–{windowEnd}</p>
          </section>
          <section className="border-t border-dashed border-ink-900/30 pt-5">
            <p className="route-code">03 / Fit</p>
            <p className="mt-2 font-display text-3xl font-semibold text-ink-950">S${groupBudgetSGD}</p>
            <p className="text-sm text-ink-600">About S${perPersonSGD} each · {alcoholMode}</p>
            <p className="mt-3 text-xs leading-5 text-ink-600">{fairnessMode === "equal_journeys" ? "Balance every diner’s public-transport journey." : "Minimise the group’s combined travel time."}</p>
          </section>
          <div className="border-l-4 border-sage-600 bg-sage-50 p-4 text-xs leading-5 text-ink-700">
            Exact home points stay hidden. Friends see only your general planning area.
          </div>
        </div>
      </aside>
    </form>
  );
}

export default function NewPlanPage() {
  return (
    <div className="min-h-dvh bg-cream-50 pb-28">
      <Header />

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-8 lg:px-12 lg:py-12">
        <div className="grid gap-4 border-b border-ink-900/30 pb-7 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
          <p className="route-code">New shared pass / Step 01</p>
          <h1 className="mt-2 font-display text-5xl font-medium tracking-[-0.04em] text-ink-950 sm:text-7xl">
            Plan a Hangout
          </h1>
          <p className="mt-3 max-w-xl text-base leading-7 text-ink-600">
            Set the company, occasion, and window. Hangtime finds the fair middle.
          </p>
          </div>
          <p className="hidden max-w-48 text-right text-xs font-bold uppercase leading-5 tracking-[0.12em] text-ink-500 sm:block">Singapore · 2–3 people<br />Public transport first</p>
        </div>

        <Suspense fallback={<div className="py-12 text-center text-xs text-ink-500">Loading plan form…</div>}>
          <NewPlanForm />
        </Suspense>
      </main>

      <BottomNav />
    </div>
  );
}
