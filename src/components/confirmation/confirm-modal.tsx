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
        <fieldset className="space-y-2">
          <legend id="confirm-venue-label" className="text-xs font-bold text-ink-900 block uppercase tracking-wider">
            1. Select Venue
          </legend>
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {candidates.map((c) => {
              const isSelected = selectedCandidateId === c.id;
              const isItemLeader = tally?.leaders?.includes(c.id);
              const votes = tally?.candidateVotes?.[c.id] || 0;
              const venueId = `confirm-venue-${c.id}`;

              return (
                <div key={c.id}>
                  <input
                    id={venueId}
                    type="radio"
                    name="confirmVenue"
                    value={c.id}
                    checked={isSelected}
                    onChange={() => setSelectedCandidateId(c.id)}
                    aria-label={`${c.name}, rank ${c.rank}${isItemLeader ? `, group leader with ${votes} ${votes === 1 ? "vote" : "votes"}` : ""}`}
                    className="peer sr-only"
                  />
                  <label
                    htmlFor={venueId}
                    className={`block w-full cursor-pointer rounded-2xl border p-3 text-left transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-terra-400 ${
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
                        <Check aria-hidden="true" className="h-3.5 w-3.5" />
                      </div>
                    )}
                  </div>
                  </label>
                </div>
              );
            })}
          </div>
        </fieldset>

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
            <label htmlFor="confirm-override-reason" className="sr-only">Reason for choosing a non-leading venue</label>
              <textarea
              id="confirm-override-reason"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="e.g., Dumpling Darlings is fully booked at 7pm, so picking Tipo Pasta Bar instead."
              rows={2}
                className="w-full rounded-xl border border-amber-300 bg-cream-50 p-2.5 text-xs text-ink-900 focus:border-terra-500 placeholder:text-ink-400"
            />
            <div className="flex justify-between text-[10px] text-amber-900" aria-live="polite">
              <span>{overrideReason.trim().length}/10 min chars</span>
              <span>240 max</span>
            </div>
          </div>
        )}

        {/* Exact Start Time Selection (15-min intervals) */}
        <fieldset className="space-y-1.5 pt-1">
          <legend id="confirm-time-label" className="text-xs font-bold text-ink-900 flex items-center gap-1.5 uppercase tracking-wider">
            <Clock aria-hidden="true" className="h-3.5 w-3.5 text-terra-600" />
            2. Exact Arrival Time
          </legend>
          <div className="grid grid-cols-4 gap-2">
            {timeSlots.map((time) => (
              <div key={time}>
                <input
                  id={`confirm-time-${time.replace(":", "-")}`}
                  type="radio"
                  name="exactStartTime"
                  value={time}
                  checked={exactStartTime === time}
                  onChange={() => setExactStartTime(time)}
                  className="peer sr-only"
                />
                <label
                  htmlFor={`confirm-time-${time.replace(":", "-")}`}
                  className={`flex min-h-11 cursor-pointer items-center justify-center rounded-xl border py-2 text-xs font-semibold transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-terra-400 ${
                  exactStartTime === time
                    ? "bg-terra-500 text-white border-terra-600 shadow-soft"
                    : "bg-cream-100 text-ink-800 border-cream-300 hover:bg-cream-200"
                  }`}
                >
                  {time}
                </label>
              </div>
            ))}
          </div>
        </fieldset>

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
