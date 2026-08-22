"use client";

import React, { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/nav";
import { PlanLobby } from "@/components/plans/plan-lobby";
import { StagedProgress } from "@/components/recommendations/staged-progress";
import { BallotView } from "@/components/voting/ballot-view";
import { ConfirmedView } from "@/components/confirmation/confirmed-view";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { ArrowLeft, RefreshCw, AlertCircle } from "lucide-react";
import { Plan, UserProfile, PlanParticipant, RecommendationCandidate, PlanDecision } from "@/types";

export default function PlanRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: planId } = use(params);
  const { toast } = useToast();

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [participants, setParticipants] = useState<PlanParticipant[]>([]);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [candidates, setCandidates] = useState<RecommendationCandidate[]>([]);
  const [maxSelections, setMaxSelections] = useState(1);
  const [userBallotSelections, setUserBallotSelections] = useState<string[]>([]);
  const [tally, setTally] = useState<{
    candidateVotes: Record<string, number>;
    totalBallots: number;
    leaders: string[];
    isTie: boolean;
  } | null>(null);
  const [activeDecision, setActiveDecision] = useState<PlanDecision | undefined>(undefined);

  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  const loadPlanData = useCallback(async () => {
    try {
      const [meRes, planRes] = await Promise.all([
        fetch("/api/v1/me").then((r) => r.json()),
        fetch(`/api/v1/plans/${planId}`).then((r) => r.json()),
      ]);

      if (meRes?.data?.profile) setCurrentUser(meRes.data.profile);

      if (planRes?.data?.plan) {
        setPlan(planRes.data.plan);
        setParticipants(planRes.data.participants || []);
        setIsOrganizer(Boolean(planRes.data.isOrganizer));
        setCandidates(planRes.data.currentRun?.candidates || []);
        setMaxSelections(planRes.data.maxSelections || 1);
        setUserBallotSelections(planRes.data.userBallot?.selections || []);
        setTally(planRes.data.tally);
        setActiveDecision(planRes.data.activeDecision);
      } else {
        toast("Plan not found", "error");
      }
    } catch {
      toast("Failed to load plan", "error");
    } finally {
      setIsLoading(false);
    }
  }, [planId, toast]);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch("/api/v1/me").then((response) => response.json()),
      fetch(`/api/v1/plans/${planId}`).then((response) => response.json()),
    ])
      .then(([meResponse, planResponse]) => {
        if (cancelled) return;

        if (meResponse?.data?.profile) {
          setCurrentUser(meResponse.data.profile);
        }

        if (planResponse?.data?.plan) {
          setPlan(planResponse.data.plan);
          setParticipants(planResponse.data.participants || []);
          setIsOrganizer(Boolean(planResponse.data.isOrganizer));
          setCandidates(planResponse.data.currentRun?.candidates || []);
          setMaxSelections(planResponse.data.maxSelections || 1);
          setUserBallotSelections(planResponse.data.userBallot?.selections || []);
          setTally(planResponse.data.tally);
          setActiveDecision(planResponse.data.activeDecision);
        } else {
          toast("Plan not found", "error");
        }
      })
      .catch(() => {
        if (!cancelled) toast("Failed to load plan", "error");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [planId, toast]);

  const handleGenerateRecommendations = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch(`/api/v1/plans/${planId}/recommendations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (res.ok) {
        toast("Curated fair dining shortlist!", "success");
        setTimeout(() => {
          setIsGenerating(false);
          loadPlanData();
        }, 1200);
      } else {
        setIsGenerating(false);
        toast(data.error?.message || "Failed to generate recommendations", "error");
      }
    } catch {
      setIsGenerating(false);
      toast("Error running recommendation engine", "error");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-cream-50">
        <Header />
        <div role="status" aria-live="polite" aria-label="Loading meal plan" className="py-24 text-center space-y-2">
          <div aria-hidden="true" className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-terra-500 border-t-transparent" />
          <p className="text-xs text-ink-500 font-medium">Loading meal plan…</p>
        </div>
      </div>
    );
  }

  if (!plan || !currentUser) {
    return (
      <div className="min-h-dvh bg-cream-50">
        <Header />
        <div className="py-24 text-center px-4 space-y-4">
          <AlertCircle className="h-10 w-10 text-terra-500 mx-auto" />
          <h2 className="text-lg font-bold text-ink-950">Plan Not Found</h2>
          <Link href="/">
            <Button variant="primary" size="md">
              Back to Home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const journeyStep = plan.state === "confirmed" ? 4 : plan.state === "voting" ? 3 : plan.state === "recommending" ? 2 : 1;
  const journeyLabels = ["Invite", "Ready", "Shortlist", "Vote", "Confirm"];

  return (
    <div className="min-h-dvh bg-cream-50 pb-28">
      <Header />

      <main className={`mx-auto px-4 py-4 sm:px-6 space-y-4 ${plan.state === "voting" ? "max-w-7xl" : "max-w-3xl"}`}>
        {/* Navigation & Status Header */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-ink-600 transition-colors hover:text-ink-950"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Home</span>
          </Link>

          <button
            type="button"
            onClick={loadPlanData}
            className="flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs text-ink-500 transition-colors hover:text-ink-800 cursor-pointer"
            title="Refresh plan status"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </button>
        </div>

        <nav tabIndex={0} className="brand-rule overflow-x-auto bg-ink-950 px-4 py-3 text-cream-50" aria-label="Plan progress">
          <ol className="grid min-w-[560px] grid-cols-5 gap-2">
            {journeyLabels.map((label, index) => {
              const complete = index < journeyStep;
              const current = index === journeyStep;
              return (
                <li key={label} aria-current={current ? "step" : undefined} className="relative flex items-center gap-2">
                  <span aria-hidden="true" className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-[10px] font-extrabold ${complete ? "border-sage-500 bg-sage-600 text-white" : current ? "border-terra-400 bg-terra-500 text-white" : "border-white/35 text-cream-300"}`}>{complete ? "✓" : index + 1}</span>
                  <span className={`text-[10px] font-extrabold uppercase tracking-[0.14em] ${current ? "text-terra-300" : "text-cream-200"}`}>
                    <span className="sr-only">{complete ? "Completed: " : current ? "Current: " : "Upcoming: "}</span>
                    {label}
                  </span>
                </li>
              );
            })}
          </ol>
        </nav>

        {/* Dynamic State Dispatcher */}
        {isGenerating ? (
          <StagedProgress />
        ) : plan.state === "confirmed" && activeDecision ? (
          <ConfirmedView
            plan={plan}
            decision={activeDecision}
            participants={participants}
            currentUser={currentUser}
            onRefreshPlan={loadPlanData}
          />
        ) : plan.state === "voting" && candidates.length > 0 ? (
          <BallotView
            plan={plan}
            candidates={candidates}
            participants={participants}
            currentUser={currentUser}
            isOrganizer={isOrganizer}
            maxSelections={maxSelections}
            initialSelections={userBallotSelections}
            tally={tally}
            onRefreshPlan={loadPlanData}
          />
        ) : (
          <PlanLobby
            plan={plan}
            currentUser={currentUser}
            participants={participants}
            isOrganizer={isOrganizer}
            onGenerateRecommendations={handleGenerateRecommendations}
            isGenerating={isGenerating}
            onReadinessSaved={loadPlanData}
          />
        )}
      </main>

      <BottomNav />
    </div>
  );
}
