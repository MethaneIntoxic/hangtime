"use client";

import React, { useState } from "react";
import { Plan, PlanDecision, PlanParticipant, UserProfile } from "@/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import {
  PartyPopper,
  Calendar,
  Clock,
  MapPin,
  Navigation,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Download,
  Star,
  Users,
  Info,
} from "lucide-react";
import { FeedbackModal } from "@/components/feedback/feedback-modal";

export interface ConfirmedViewProps {
  plan: Plan;
  decision: PlanDecision;
  participants: PlanParticipant[];
  currentUser: UserProfile;
  onRefreshPlan: () => void;
}

export function ConfirmedView({
  plan,
  decision,
  participants,
  currentUser,
  onRefreshPlan,
}: ConfirmedViewProps) {
  const { toast } = useToast();
  const [isUpdatingAck, setIsUpdatingAck] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

  const candidate = decision.candidate;
  const currentParticipant = participants.find((p) => p.userId === currentUser.id);

  const handleAcknowledge = async (state: "acknowledged" | "conflict") => {
    setIsUpdatingAck(true);
    try {
      const res = await fetch(`/api/v1/plans/${plan.id}/acknowledgements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acknowledgedState: state }),
      });
      if (res.ok) {
        toast(state === "acknowledged" ? "Attendance confirmed!" : "Conflict flagged to organizer", "info");
        onRefreshPlan();
      }
    } catch {
      toast("Failed to update status", "error");
    } finally {
      setIsUpdatingAck(false);
    }
  };

  const handleDownloadIcs = () => {
    const download = document.createElement("a");
    download.href = `/api/v1/plans/${plan.id}/ics`;
    download.download = `hangtime-${plan.id}.ics`;
    download.click();
    toast("Calendar invite (.ics) downloaded!", "success");
  };

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Confirmed Hero Header Card */}
      <Card variant="accent" className="p-6 border-terra-300 text-center space-y-3 relative overflow-hidden">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-terra-500 text-white shadow-lift mb-1">
          <PartyPopper className="h-6 w-6" />
        </div>

        <div>
          <Badge variant="terra" size="md" className="font-bold mb-2">
            Plan Confirmed & Locked In
          </Badge>
          <h2 className="font-display text-2xl font-bold text-ink-950">
            {candidate?.name || "Hangtime venue"}
          </h2>
          <p className="text-xs text-ink-600 font-medium mt-0.5">
            {candidate?.cuisine} · {candidate?.coarseArea}
          </p>
        </div>

        {/* Date & Exact Time Badge */}
        <div className="inline-flex items-center gap-4 bg-cream-50/90 px-4 py-2.5 rounded-2xl border border-terra-200 shadow-soft text-xs text-ink-900 font-bold">
          <span className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4 text-terra-600" />
            {plan.date}
          </span>
          <span className="text-terra-300">|</span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-terra-600" />
            Meet at {decision.exactStartTime}
          </span>
        </div>

        {/* Address */}
        <p className="text-xs text-ink-500 flex items-center justify-center gap-1 pt-1">
          <MapPin className="h-3.5 w-3.5 text-ink-400 shrink-0" />
          {candidate?.address}
        </p>

        {/* If Override: Transparent Reason Banner */}
        {decision.decisionKind === "override" && decision.overrideReason && (
          <div className="mt-3 rounded-2xl bg-amber-100/80 p-3 text-left border border-amber-300 text-xs">
            <p className="font-bold text-amber-950 flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5 shrink-0" />
              Organizer Decision Note:
            </p>
            <p className="text-amber-900 mt-0.5 leading-relaxed">
              &ldquo;{decision.overrideReason}&rdquo;
            </p>
          </div>
        )}
      </Card>

      {/* Action Buttons: Add to Calendar, Directions, Booking */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Button
          variant="sage"
          size="md"
          onClick={handleDownloadIcs}
          className="text-xs font-semibold shadow-soft"
        >
          <Download className="h-4 w-4" />
          <span>Add to Calendar (.ics)</span>
        </Button>

        {candidate?.mapsUrl && (
          <a
            href={candidate.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-cream-300 bg-cream-50 px-4 py-2.5 text-xs font-semibold text-ink-800 hover:bg-cream-200 transition-colors shadow-soft"
          >
            <Navigation className="h-4 w-4 text-terra-600" />
            <span>Open in OpenStreetMap</span>
          </a>
        )}

        {candidate?.bookingUrl && (
          <a
            href={candidate.bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-terra-500 text-white px-4 py-2.5 text-xs font-semibold hover:bg-terra-600 transition-colors shadow-soft"
          >
            <ExternalLink className="h-4 w-4" />
            <span>Reservations / Menu</span>
          </a>
        )}
      </div>

      {/* Diners Attendance & Acknowledgement Status */}
      <Card variant="elevated" className="p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-cream-200 pb-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-terra-600" />
            <h3 className="font-display text-sm font-bold text-ink-950">
              Diner Attendance
            </h3>
          </div>
          <span className="text-xs text-ink-500">
            {participants.filter((p) => p.acknowledgedState === "acknowledged").length}/{participants.length} Confirmed
          </span>
        </div>

        <div className="grid gap-2">
          {participants.map((part) => {
            const isMe = part.userId === currentUser.id;
            return (
              <div
                key={part.id}
                className="flex items-center justify-between p-2.5 rounded-xl bg-cream-100/70 border border-cream-200 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="grid h-7 w-7 place-items-center rounded-full border border-cream-300 bg-amber-100 text-[9px] font-extrabold text-ink-900"
                  >
                    {(part.profile?.displayName || "Diner")
                      .split(" ")
                      .map((namePart) => namePart[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                  <div>
                    <span className="font-semibold text-ink-900">
                      {part.profile?.displayName || "Diner"} {isMe ? "(You)" : ""}
                    </span>
                    <span className="text-[10px] text-ink-400 block">
                      From {part.coarseOriginLabel || "Singapore"}
                    </span>
                  </div>
                </div>

                <div>
                  {part.acknowledgedState === "acknowledged" ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-sage-700 bg-sage-50 border border-sage-200 px-2 py-0.5 rounded-full text-[11px]">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Coming
                    </span>
                  ) : part.acknowledgedState === "conflict" ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-berry-700 bg-berry-50 border border-berry-200 px-2 py-0.5 rounded-full text-[11px]">
                      <AlertTriangle className="h-3.5 w-3.5" /> Has Conflict
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-medium text-amber-900 bg-amber-100 px-2 py-0.5 rounded-full text-[11px]">
                      <Clock className="h-3 w-3" /> Awaiting Ack
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* My Acknowledge Controls */}
        <div className="pt-2 border-t border-cream-200 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-ink-700">Your RSVP:</span>
          <div className="flex gap-2">
            <Button
              variant={currentParticipant?.acknowledgedState === "conflict" ? "danger" : "outline"}
              size="sm"
              onClick={() => handleAcknowledge("conflict")}
              disabled={isUpdatingAck}
              className="text-xs"
            >
              Flag Conflict
            </Button>
            <Button
              variant={currentParticipant?.acknowledgedState === "acknowledged" ? "sage" : "primary"}
              size="sm"
              onClick={() => handleAcknowledge("acknowledged")}
              disabled={isUpdatingAck}
              className="text-xs font-semibold"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>✓ I&apos;m Coming!</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* Post-Meal Feedback Banner */}
      <Card variant="default" className="p-4 bg-gradient-to-r from-cream-100 to-amber-100/40 border-amber-200 flex items-center justify-between gap-3">
        <div>
          <p className="font-bold text-ink-950 text-xs">
            After the meal: How was {candidate?.name}?
          </p>
          <p className="text-[11px] text-ink-500">
            2-tap satisfaction survey helps improve future group recommendations.
          </p>
        </div>
        <Button
          variant="amber"
          size="sm"
          onClick={() => setIsFeedbackOpen(true)}
          className="text-xs font-semibold shrink-0"
        >
          <Star className="h-3.5 w-3.5" />
          <span>Rate Meal</span>
        </Button>
      </Card>

      {/* Feedback Modal */}
      <FeedbackModal
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
        plan={plan}
        venueName={candidate?.name || "Venue"}
      />
    </div>
  );
}
