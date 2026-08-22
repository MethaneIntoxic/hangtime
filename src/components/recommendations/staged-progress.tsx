"use client";

import React, { useState, useEffect } from "react";
import { Sparkles, CheckCircle2 } from "lucide-react";

export function StagedProgress() {
  const stages = [
    { label: "Analyzing Singapore transit clusters & fairness zones", detail: "Checking MRT lines (EW, NS, NE, DT, TE)" },
    { label: "Evaluating dietary restrictions & allergen safety", detail: "Applying strict halal / vegetarian / allergy rules" },
    { label: "Calculating group spend with 10% svc + 9% GST", detail: "Ensuring estimate aligns with total budget" },
    { label: "Curating balanced, high-satisfaction shortlist", detail: "Balancing diversity across cuisines and micro-areas" },
  ];

  const [currentStage, setCurrentStage] = useState(0);

  useEffect(() => {
    const timer1 = setTimeout(() => setCurrentStage(1), 600);
    const timer2 = setTimeout(() => setCurrentStage(2), 1200);
    const timer3 = setTimeout(() => setCurrentStage(3), 1800);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, []);

  return (
    <div className="py-12 px-4 text-center space-y-6 animate-fade-up">
      <div className="relative inline-flex items-center justify-center">
        <div className="h-16 w-16 rounded-3xl bg-terra-500/10 flex items-center justify-center animate-pulse">
          <Sparkles className="h-8 w-8 text-terra-600 animate-spin-slow" />
        </div>
      </div>

      <div>
        <h3 className="font-display text-lg font-bold text-ink-950">
          Finding Fair Singapore Dining Spots…
        </h3>
        <p className="text-xs text-ink-500 mt-1 max-w-xs mx-auto">
          Searching for venues that balance travel time, cuisine love, and group budget.
        </p>
      </div>

      <div className="max-w-sm mx-auto space-y-3 text-left">
        {stages.map((stage, idx) => {
          const isDone = idx < currentStage;
          const isCurrent = idx === currentStage;

          return (
            <div
              key={stage.label}
              className={`p-3 rounded-2xl border transition-all duration-300 ${
                isCurrent
                  ? "bg-cream-100 border-terra-300 shadow-soft scale-[1.02]"
                  : isDone
                  ? "bg-sage-50/60 border-sage-200 text-ink-600"
                  : "bg-cream-50/40 border-cream-200 opacity-40"
              }`}
            >
              <div className="flex items-start gap-2.5">
                {isDone ? (
                  <CheckCircle2 className="h-4 w-4 text-sage-600 shrink-0 mt-0.5" />
                ) : isCurrent ? (
                  <span className="inline-block h-4 w-4 rounded-full border-2 border-terra-500 border-t-transparent animate-spin shrink-0 mt-0.5" />
                ) : (
                  <div className="h-4 w-4 rounded-full border border-ink-300 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="text-xs font-semibold text-ink-900 leading-tight">
                    {stage.label}
                  </p>
                  <p className="text-[10px] text-ink-500 mt-0.5">
                    {stage.detail}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
