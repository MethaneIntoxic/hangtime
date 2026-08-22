"use client";

import React, { useState } from "react";
import { UserProfile, Plan, PlanParticipant, PlanInviteSummary, PlanSeatSummary } from "@/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { ReadinessChecklist } from "@/components/plans/readiness-checklist";
import {
  Users,
  CheckCircle2,
  Clock,
  MapPin,
  Sparkles,
  Copy,
  RefreshCw,
  XCircle,
} from "lucide-react";

export interface PlanLobbyProps {
  plan: Plan;
  currentUser: UserProfile;
  participants: PlanParticipant[];
  pendingInvites?: PlanInviteSummary[];
  seatSummary?: PlanSeatSummary;
  isOrganizer: boolean;
  onGenerateRecommendations: () => void;
  isGenerating: boolean;
  onReadinessSaved?: () => void;
  onRefreshPlan?: () => void | Promise<void>;
}

export function PlanLobby({
  plan,
  currentUser,
  participants,
  pendingInvites = [],
  seatSummary,
  isOrganizer,
  onGenerateRecommendations,
  isGenerating,
  onReadinessSaved,
  onRefreshPlan,
}: PlanLobbyProps) {
  const { toast } = useToast();
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteNotice, setInviteNotice] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteAction, setInviteAction] = useState<"idle" | "reissuing" | "revoking">("idle");
  const [activeInviteId, setActiveInviteId] = useState<string | null>(null);
  const [revokedInviteIds, setRevokedInviteIds] = useState<string[]>([]);
  const currentParticipant = participants.find((p) => p.userId === currentUser.id);
  const visiblePendingInvites = (pendingInvites.length > 0 ? pendingInvites : plan.pendingInvites ?? []).filter(
    (invite) => !revokedInviteIds.includes(invite.id)
  );
  const visibleSeatSummary = seatSummary ?? plan.seatSummary;
  const joinedCount = visibleSeatSummary?.joined ?? participants.length;
  const pendingCount = visibleSeatSummary?.pending ?? visiblePendingInvites.length;
  const availableCount = visibleSeatSummary?.available ?? Math.max(0, 3 - joinedCount - pendingCount);
  const allJoinedReady = joinedCount >= 2 && participants.filter((p) => p.isReady).length >= joinedCount;

  const inviteStatusLabel = (status: string) => {
    switch (status) {
      case "delivery_failed":
        return "Invite delivery failed";
      case "expired":
        return "Invite expired";
      case "revoked":
        return "Invite revoked";
      case "superseded":
        return "Invite superseded";
      case "seat_taken":
        return "Seat claimed";
      case "closed":
        return "Plan closed";
      default:
        return "Invite pending";
    }
  };

  const expiryLabel = (expiresAt: string) => {
    const date = new Date(expiresAt);
    return Number.isNaN(date.getTime()) ? "expiration not available" : `expires ${date.toLocaleDateString()}`;
  };

  const copyInviteUrl = async (url: string) => {
    setInviteUrl(url);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setInviteNotice("Invite link copied. Share it with your diner.");
      setInviteError("");
      toast("Invite link copied to clipboard.", "success");
    } catch {
      setInviteNotice("Invite link ready for manual copy.");
      setInviteError("Clipboard access is unavailable. The same link is shown below so you can copy it manually.");
      toast("Clipboard access is unavailable; the link is ready below.", "error");
    }
  };

  const handleReissueInvite = async (inviteId: string) => {
    setInviteAction("reissuing");
    setActiveInviteId(inviteId);
    setInviteNotice("");
    setInviteError("");
    try {
      const response = await fetch(`/api/v1/plans/${plan.id}/invites/${encodeURIComponent(inviteId)}/reissue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = await response.json();
      if (!response.ok || !payload?.data?.inviteUrl) {
        throw new Error(payload?.error?.message || "This invite could not be reissued.");
      }
      await copyInviteUrl(payload.data.inviteUrl);
      setInviteNotice("Invite link reissued and ready to share.");
      await onRefreshPlan?.();
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : "This invite could not be reissued.");
      toast("This invite could not be reissued.", "error");
    } finally {
      setInviteAction("idle");
      setActiveInviteId(null);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    setInviteAction("revoking");
    setActiveInviteId(inviteId);
    setInviteNotice("");
    setInviteError("");
    try {
      const response = await fetch(`/api/v1/plans/${plan.id}/invites/${encodeURIComponent(inviteId)}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || "This invite could not be revoked.");
      setRevokedInviteIds((previous) => (previous.includes(inviteId) ? previous : [...previous, inviteId]));
      setInviteNotice("Invite revoked. No seat was added.");
      toast("Invite revoked.", "success");
      await onRefreshPlan?.();
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : "This invite could not be revoked.");
      toast("This invite could not be revoked.", "error");
    } finally {
      setInviteAction("idle");
      setActiveInviteId(null);
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <Users aria-hidden="true" className="mt-0.5 h-4 w-4 text-terra-600" />
            <div>
              <h3 className="font-display text-sm font-bold text-ink-900">People &amp; seats</h3>
              <p className="text-xs text-ink-600" aria-live="polite">
                {joinedCount} joined · {pendingCount} pending · {availableCount} available
              </p>
            </div>
          </div>
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
                        <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" /> Ready
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-900 bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-full">
                        <Clock aria-hidden="true" className="h-3.5 w-3.5" /> Waiting
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

          {visiblePendingInvites.map((invite) => (
            <Card key={invite.id} variant="default" className="border border-amber-300 bg-amber-50/60" aria-label={`Pending invite for ${invite.displayName || "diner"}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-amber-300 bg-amber-100 text-amber-900">
                    <Clock className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink-950 text-sm">{invite.displayName || "Invited diner"}</p>
                    <p className="text-xs text-ink-600">{inviteStatusLabel(invite.status)} · {expiryLabel(invite.expiresAt)}</p>
                  </div>
                </div>
                {isOrganizer && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleReissueInvite(invite.id)}
                      isLoading={inviteAction === "reissuing" && activeInviteId === invite.id}
                      aria-label={`Reissue invite for ${invite.displayName || "diner"}`}
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Reissue
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleRevokeInvite(invite.id)}
                      isLoading={inviteAction === "revoking" && activeInviteId === invite.id}
                      aria-label={`Revoke invite for ${invite.displayName || "diner"}`}
                    >
                      <XCircle className="h-3.5 w-3.5" /> Revoke
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>

        {(inviteNotice || inviteError || inviteUrl) && (
          <div className="space-y-2" aria-live="polite">
            {inviteNotice && <p role="status" className="text-xs font-semibold text-sage-700">{inviteNotice}</p>}
            {inviteError && <p role="alert" className="text-xs font-medium text-berry-700">{inviteError}</p>}
            {inviteUrl && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <label htmlFor="invite-link" className="mb-1 block text-xs font-semibold text-ink-700">Invite link ready</label>
                  <input id="invite-link" aria-label="Invite link" readOnly value={inviteUrl} className="min-h-11 w-full min-w-0 border border-ink-900/20 bg-cream-50 px-3 text-xs text-ink-800" />
                </div>
                <Button variant="outline" size="sm" onClick={() => copyInviteUrl(inviteUrl)}>
                  <Copy className="h-3.5 w-3.5" /> Copy link
                </Button>
              </div>
            )}
          </div>
        )}
        {isOrganizer && availableCount > 0 && (
          <p className="text-xs leading-5 text-ink-600">
            {availableCount === 1 ? "One seat is open." : `${availableCount} seats are open.`} Start a new plan or add a verified companion to reserve another seat.
          </p>
        )}
      </div>

      {/* Deliberate readiness controls for the active participant */}
      <ReadinessChecklist
        plan={plan}
        currentUser={currentUser}
        participant={currentParticipant}
        onSaved={onReadinessSaved}
      />

      {/* Trigger Recommendations Button */}
      <div className="pt-2">
        {isOrganizer ? (
          <div className="space-y-2">
            <Button
              variant="primary"
              size="lg"
              onClick={onGenerateRecommendations}
              disabled={!allJoinedReady}
              isLoading={isGenerating}
              className="w-full text-base font-bold shadow-lift"
            >
              <Sparkles className="h-5 w-5" />
              <span>Find Singapore Dining Shortlist</span>
            </Button>
            {!allJoinedReady && (
              <p className="text-center text-xs text-amber-900 font-medium">
                {joinedCount < 2 ? "Waiting for at least 2 diners to join." : "Waiting for every joined diner to finish check-in."}
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
