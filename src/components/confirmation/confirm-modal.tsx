"use client";

import React, { useState } from "react";
import { Plan, RecommendationCandidate } from "@/types";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { Check, Clock, AlertTriangle, Sparkles, MapPin } from "lucide-react";

export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: Plan;
  candidates: RecommendationCandidate[];
  tally: {
    candidateVotes: Record<string, number>;
    leaders: string[];
    isTie: boolean;
  } | null;
  onConfirmed: () => void;
}

export function ConfirmModal({
  isOpen,
  onClose,
  plan,
  candidates,
  tally,
  onConfirmed,
}: ConfirmModalProps) {
  const { toast } = useToast();
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>(
    tally?.leaders?.[0] || candidates[0]?.id || ""
  );
  const [exactStartTime, setExactStartTime] = useState<string>(plan.windowStart || "19:30");
  const [overrideReason, setOverrideReason] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Generate 15-min interval time options within plan window
  const generateTimeSlots = (start: string, end: string) => {
    const slots = [];
    const [startH, startM] = start.split(":").map(Number);
    const [endH, endM] = end.split(":").map(Number);

    let currMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    while (currMinutes <= endMinutes) {
      const h = Math.floor(currMinutes / 60);
      const m = currMinutes % 60;
      slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      currMinutes += 15;
    }
    return slots.length > 0 ? slots : [start];
  };

  const timeSlots = generateTimeSlots(plan.windowStart, plan.windowEnd);

  const isLeader = tally?.leaders?.includes(selectedCandidateId);
  const isOverride = !isLeader;
  const reasonValid = !isOverride || (overrideReason.trim().length >= 10 && overrideReason.trim().length <= 240);

  const handleConfirm = async () => {
    if (isOverride && !reasonValid) {
      toast("Please provide an explanation (10–240 chars) for choosing a non-leader.", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/v1/plans/${plan.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: selectedCandidateId,
          exactStartTime,
          overrideReason: isOverride ? overrideReason.trim() : null,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast("Plan confirmed and locked in!", "success");
        onConfirmed();
      } else {
        toast(data.error?.message || "Failed to confirm plan", "error");
      }
    } catch {
      toast("Error confirming plan", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Confirm Final Dining Choice"
      description="Select the confirmed venue and exact arrival time for everyone."
      maxWidth="md"
    >
      <div className="space-y-4 pt-1">
        {/* Venue Selection */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-ink-900 block uppercase tracking-wider">
            1. Select Venue
          </label>
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {candidates.map((c) => {
              const isSelected = selectedCandidateId === c.id;
              const isItemLeader = tally?.leaders?.includes(c.id);
              const votes = tally?.candidateVotes?.[c.id] || 0;

              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedCandidateId(c.id)}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? "bg-terra-50 border-terra-500 ring-2 ring-terra-300"
                      : "bg-cream-100/70 border-cream-200 hover:border-terra-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-ink-950">
                          #{c.rank} {c.name}
                        </span>
                        {isItemLeader && (
                          <Badge variant="terra" size="sm">
                            👑 Leader ({votes}v)
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-ink-500 flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {c.coarseArea} · {c.cuisine}
                      </p>
                    </div>
                    {isSelected && (
                      <div className="h-5 w-5 rounded-full bg-terra-500 text-white flex items-center justify-center shrink-0">
                        <Check className="h-3.5 w-3.5" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Override Reason Box if choosing a non-leader */}
        {isOverride && (
          <div className="rounded-2xl bg-amber-100/70 p-3.5 border border-amber-300 space-y-2 animate-fade-in">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-950">
              <AlertTriangle className="h-4 w-4 text-amber-900 shrink-0" />
              <span>Choose a different option (Override)</span>
            </div>
            <p className="text-[11px] text-amber-950 leading-relaxed">
              You are picking an option other than the group vote leader. Please provide a brief, transparent reason visible to your companions.
            </p>
            <textarea
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="e.g., Dumpling Darlings is fully booked at 7pm, so picking Tipo Pasta Bar instead."
              rows={2}
              className="w-full rounded-xl border border-amber-300 bg-cream-50 p-2.5 text-xs text-ink-900 focus:border-terra-500 focus:outline-none placeholder:text-ink-400"
            />
            <div className="flex justify-between text-[10px] text-amber-900">
              <span>{overrideReason.trim().length}/10 min chars</span>
              <span>240 max</span>
            </div>
          </div>
        )}

        {/* Exact Start Time Selection (15-min intervals) */}
        <div className="space-y-1.5 pt-1">
          <label className="text-xs font-bold text-ink-900 flex items-center gap-1.5 uppercase tracking-wider">
            <Clock className="h-3.5 w-3.5 text-terra-600" />
            2. Exact Arrival Time
          </label>
          <div className="grid grid-cols-4 gap-2">
            {timeSlots.map((time) => (
              <button
                key={time}
                type="button"
                onClick={() => setExactStartTime(time)}
                className={`py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  exactStartTime === time
                    ? "bg-terra-500 text-white border-terra-600 shadow-soft"
                    : "bg-cream-100 text-ink-800 border-cream-300 hover:bg-cream-200"
                }`}
              >
                {time}
              </button>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-3 border-t border-cream-200">
          <Button variant="outline" size="md" onClick={onClose} className="flex-1 text-xs">
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleConfirm}
            isLoading={isSubmitting}
            disabled={isOverride && !reasonValid}
            className="flex-1 text-xs font-bold"
          >
            <Sparkles className="h-4 w-4" />
            <span>Confirm & Notify Diners</span>
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
