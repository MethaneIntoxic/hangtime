"use client";

import React, { useState } from "react";
import { UserProfile, Plan, PlanParticipant } from "@/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import {
  Users,
  CheckCircle2,
  Clock,
  MapPin,
  Sparkles,
  Copy,
  Check,
  ShieldCheck,
} from "lucide-react";
import { SINGAPORE_PLANNING_AREAS } from "@/providers/singapore-transit";

export interface PlanLobbyProps {
  plan: Plan;
  currentUser: UserProfile;
  participants: PlanParticipant[];
  isOrganizer: boolean;
  onGenerateRecommendations: () => void;
  isGenerating: boolean;
}

export function PlanLobby({
  plan,
  currentUser,
  participants,
  isOrganizer,
  onGenerateRecommendations,
  isGenerating,
}: PlanLobbyProps) {
  const { toast } = useToast();
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [selectedArea, setSelectedArea] = useState(
    currentUser.coarseArea || "Novena / Balestier (Central)"
  );
  const [isUpdatingOrigin, setIsUpdatingOrigin] = useState(false);

  const currentParticipant = participants.find((p) => p.userId === currentUser.id);
  const allReady = participants.length >= 2 && participants.every((p) => p.isReady);

  const handleCopyInviteLink = async () => {
    try {
      const res = await fetch(`/api/v1/plans/${plan.id}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data?.data?.inviteUrl) {
        await navigator.clipboard.writeText(data.data.inviteUrl);
        setCopiedInvite(true);
        toast("Invite link copied to clipboard!", "success");
        setTimeout(() => setCopiedInvite(false), 3000);
      }
    } catch {
      toast("Could not create invite link", "error");
    }
  };

  const handleUpdateOrigin = async (newAreaLabel: string) => {
    setSelectedArea(newAreaLabel);
    setIsUpdatingOrigin(true);

    try {
      const res = await fetch(`/api/v1/plans/${plan.id}/participation`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coarseOriginLabel: newAreaLabel,
          isReady: true,
        }),
      });
      if (res.ok) {
        toast("Updated your meeting origin & marked ready!", "success");
      }
    } catch {
      toast("Failed to update origin", "error");
    } finally {
      setIsUpdatingOrigin(false);
    }
  };

  const handleToggleReady = async () => {
    const nextState = !currentParticipant?.isReady;
    try {
      const res = await fetch(`/api/v1/plans/${plan.id}/participation`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isReady: nextState,
        }),
      });
      if (res.ok) {
        toast(nextState ? "You're marked as ready!" : "Marked not ready", "info");
      }
    } catch {
      toast("Failed to update readiness", "error");
    }
  };

  return (
    <div className="space-y-6">
      {/* Plan Header Summary Card */}
      <Card variant="accent" className="border-terra-200">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-terra-200/60 pb-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🍽️</span>
            <div>
              <h2 className="font-display text-lg font-bold text-ink-950 capitalize">
                {plan.mealType} Hangout
              </h2>
              <p className="text-xs text-ink-600 font-medium">
                {plan.date} · {plan.windowStart} – {plan.windowEnd}
              </p>
            </div>
          </div>
          <Badge variant="terra" size="md">
            Lobby & Readiness
          </Badge>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-ink-700">
          <div className="bg-cream-50/70 p-2.5 rounded-xl border border-terra-100">
            <span className="text-[10px] uppercase font-bold text-ink-400 block">Group Budget</span>
            <span className="font-semibold text-ink-900">S${Math.round(plan.groupBudgetCents / 100)} Total</span>
          </div>
          <div className="bg-cream-50/70 p-2.5 rounded-xl border border-terra-100">
            <span className="text-[10px] uppercase font-bold text-ink-400 block">Fairness Mode</span>
            <span className="font-semibold text-ink-900">
              {plan.fairnessMode === "equal_journeys" ? "Equal Journeys" : "Fastest Group Trip"}
            </span>
          </div>
          <div className="bg-cream-50/70 p-2.5 rounded-xl border border-terra-100 col-span-2 sm:col-span-1">
            <span className="text-[10px] uppercase font-bold text-ink-400 block">Alcohol</span>
            <span className="font-semibold text-ink-900 capitalize">{plan.alcoholMode}</span>
          </div>
        </div>
      </Card>

      {/* Participants Lobby */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-terra-600" />
            <h3 className="font-display text-sm font-bold text-ink-900">
              People ({participants.length}/3)
            </h3>
          </div>
          {participants.length < 3 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyInviteLink}
              className="text-xs"
            >
              {copiedInvite ? <Check className="h-3.5 w-3.5 text-sage-600" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedInvite ? "Copied Link!" : "Invite 3rd Person"}</span>
            </Button>
          )}
        </div>

        <div className="grid gap-3">
          {participants.map((part) => {
            const isMe = part.userId === currentUser.id;
            const profile = part.profile;
            return (
              <Card
                key={part.id}
                variant={isMe ? "default" : "default"}
                className={`p-4 border ${isMe ? "border-terra-300 bg-cream-50" : "border-cream-200"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-cream-300 bg-amber-100 text-[11px] font-extrabold text-ink-900"
                    >
                      {(profile?.displayName || "Diner")
                        .split(" ")
                        .map((part) => part[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="font-semibold text-ink-950 text-sm">
                          {profile?.displayName || "Diner"}
                        </p>
                        {part.role === "organizer" && (
                          <Badge variant="plum" size="sm">
                            Organizer
                          </Badge>
                        )}
                        {isMe && (
                          <Badge variant="terra" size="sm">
                            You
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-ink-500 mt-0.5">
                        <MapPin className="h-3 w-3 text-ink-400 shrink-0" />
                        <span>Origin: {part.coarseOriginLabel || "Not specified"}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    {part.isReady ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-sage-600 bg-sage-50 border border-sage-200 px-2.5 py-1 rounded-full">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Ready
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-900 bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-full">
                        <Clock className="h-3.5 w-3.5" /> Waiting
                      </span>
                    )}
                  </div>
                </div>

                {/* Dietary Tags if any */}
                {part.dietaryRules && part.dietaryRules.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-cream-200/80 flex flex-wrap gap-1">
                    <span className="text-[10px] text-ink-400 font-medium mr-1 self-center">Dietary:</span>
                    {part.dietaryRules.map((d) => (
                      <Badge key={d.id} variant="amber" size="sm">
                        {d.ruleCode.replace("_", " ")} ({d.severity})
                      </Badge>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {/* Origin & Readiness Controls for Current User */}
      <Card variant="default" className="p-4 space-y-3 border-cream-300 bg-cream-100/50">
        <h4 className="font-display text-xs font-bold uppercase tracking-wider text-ink-600">
          Your Planning Origin & Status
        </h4>
        <div className="space-y-2">
          <label className="text-xs font-medium text-ink-700 block">
            Where are you traveling from for this hangout?
          </label>
          <select
            value={selectedArea}
            onChange={(e) => handleUpdateOrigin(e.target.value)}
            disabled={isUpdatingOrigin}
            className="w-full rounded-xl border border-cream-300 bg-cream-50 px-3 py-2 text-xs font-medium text-ink-900 focus:border-terra-500 focus:outline-none"
          >
            {SINGAPORE_PLANNING_AREAS.map((a) => (
              <option key={a.label} value={a.label}>
                {a.label}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-ink-400 flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-sage-600" />
            Exact postal code/coordinates are used only for calculations and never shown to companions.
          </p>
        </div>

        <div className="pt-2 flex items-center justify-between">
          <Button
            variant={currentParticipant?.isReady ? "outline" : "sage"}
            size="sm"
            onClick={handleToggleReady}
            className="text-xs"
          >
            {currentParticipant?.isReady ? "Mark as Not Ready" : "✓ I'm Ready to Find Places"}
          </Button>
        </div>
      </Card>

      {/* Trigger Recommendations Button */}
      <div className="pt-2">
        {isOrganizer ? (
          <div className="space-y-2">
            <Button
              variant="primary"
              size="lg"
              onClick={onGenerateRecommendations}
              isLoading={isGenerating}
              className="w-full text-base font-bold shadow-lift"
            >
              <Sparkles className="h-5 w-5" />
              <span>Find Singapore Dining Shortlist</span>
            </Button>
            {!allReady && (
              <p className="text-center text-xs text-amber-900 font-medium">
                💡 Note: You can generate recommendations now or wait for all companions to mark ready.
              </p>
            )}
          </div>
        ) : (
          <div className="text-center p-4 bg-cream-100 rounded-2xl border border-cream-200">
            <Clock className="h-5 w-5 text-terra-500 mx-auto mb-1" />
            <p className="text-xs font-semibold text-ink-800">
              Waiting for Organizer to generate recommendations
            </p>
            <p className="text-[11px] text-ink-500 mt-0.5">
              Make sure your origin and dietary rules above are accurate!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
