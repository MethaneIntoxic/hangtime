"use client";

import React, { useState } from "react";
import { Plan } from "@/types";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Star, ThumbsUp, ThumbsDown, HeartHandshake } from "lucide-react";

export interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: Plan;
  venueName: string;
}

export function FeedbackModal({
  isOpen,
  onClose,
  plan,
  venueName,
}: FeedbackModalProps) {
  const { toast } = useToast();
  const [satisfaction, setSatisfaction] = useState<number>(5);
  const [reuseIntent, setReuseIntent] = useState<boolean>(true);
  const [notes, setNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/v1/plans/${plan.id}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          satisfactionScore: satisfaction,
          reuseIntent,
          notes: notes.trim() || null,
        }),
      });
      if (res.ok) {
        toast("Thank you for your feedback! ✨", "success");
        onClose();
      } else {
        toast("Failed to submit feedback", "error");
      }
    } catch {
      toast("Error submitting feedback", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="How was Hangtime?"
      description={`Two quick taps about your experience at ${venueName}.`}
      maxWidth="sm"
    >
      <div className="space-y-4 pt-1">
        {/* 1. Star Rating */}
        <fieldset className="space-y-2 text-center bg-cream-100/60 p-3.5 rounded-2xl border border-cream-200">
          <legend className="text-xs font-bold text-ink-900 block uppercase tracking-wider">
            1. Recommendation Satisfaction
          </legend>
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => {
              const starId = `feedback-satisfaction-${star}`;
              return (
                <span key={star}>
                  <input
                    id={starId}
                    type="radio"
                    name="satisfaction"
                    value={star}
                    aria-label={`${star} out of 5 stars`}
                    checked={satisfaction === star}
                    onChange={() => setSatisfaction(star)}
                    className="peer sr-only"
                  />
                  <label
                    htmlFor={starId}
                    className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center p-1 text-2xl transition-transform hover:scale-125 active:scale-95 peer-focus-visible:ring-2 peer-focus-visible:ring-terra-400"
                  >
                    <Star
                      aria-hidden="true"
                      className={`h-7 w-7 ${
                        star <= satisfaction
                          ? "fill-amber-400 text-amber-500"
                          : "text-ink-300"
                      }`}
                    />
                  </label>
                </span>
              );
            })}
          </div>
          <span className="text-[11px] font-semibold text-terra-700 block" aria-live="polite" aria-atomic="true">
            {satisfaction === 5 && "Outstanding recommendation!"}
            {satisfaction === 4 && "Great spot, really enjoyed it"}
            {satisfaction === 3 && "Decent experience"}
            {satisfaction === 2 && "Could have been better"}
            {satisfaction === 1 && "Didn't meet expectations"}
          </span>
        </fieldset>

        {/* 2. Reuse Intent (Yes / No) */}
        <fieldset className="space-y-2 text-center bg-cream-100/60 p-3.5 rounded-2xl border border-cream-200">
          <legend className="text-xs font-bold text-ink-900 block uppercase tracking-wider">
            2. Would you use Hangtime with this group again?
          </legend>
          <div className="grid grid-cols-2 gap-2">
            <span>
              <input
                id="feedback-reuse-yes"
                type="radio"
                name="reuseIntent"
                value="yes"
                checked={reuseIntent}
                onChange={() => setReuseIntent(true)}
                className="peer sr-only"
              />
              <label
                htmlFor="feedback-reuse-yes"
                className={`flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-bold transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-terra-400 ${
                reuseIntent
                  ? "bg-sage-600 text-white border-sage-700 shadow-soft"
                  : "bg-cream-50 text-ink-700 border-cream-300 hover:bg-cream-200"
              }`}
            >
              <ThumbsUp aria-hidden="true" className="h-4 w-4" />
              <span>Definitely Yes</span>
              </label>
            </span>
            <span>
              <input
                id="feedback-reuse-no"
                type="radio"
                name="reuseIntent"
                value="no"
                checked={!reuseIntent}
                onChange={() => setReuseIntent(false)}
                className="peer sr-only"
              />
              <label
                htmlFor="feedback-reuse-no"
                className={`flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-bold transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-terra-400 ${
                !reuseIntent
                  ? "bg-berry-600 text-white border-berry-700 shadow-soft"
                  : "bg-cream-50 text-ink-700 border-cream-300 hover:bg-cream-200"
              }`}
            >
              <ThumbsDown aria-hidden="true" className="h-4 w-4" />
              <span>Not Sure / No</span>
              </label>
            </span>
          </div>
        </fieldset>

        {/* Optional Comment */}
        <div className="space-y-1">
          <label htmlFor="feedback-notes" className="text-[11px] font-semibold text-ink-600 block">
            Optional Notes or Highlights:
          </label>
          <textarea
            id="feedback-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Travel time was super fair and pasta was incredible!"
            rows={2}
            className="w-full rounded-xl border border-cream-300 bg-cream-50 p-2.5 text-xs text-ink-900 focus:border-terra-500"
          />
        </div>

        {/* Submit */}
        <div className="pt-2">
          <Button
            variant="primary"
            size="md"
            onClick={handleSubmit}
            isLoading={isSubmitting}
            className="w-full text-xs font-bold"
          >
            <HeartHandshake className="h-4 w-4" />
            <span>Submit Feedback</span>
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
