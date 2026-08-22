"use client";

import { useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, Map as MapIcon, Sparkles, Trophy } from "lucide-react";
import { ConfirmModal } from "@/components/confirmation/confirm-modal";
import { OpenSingaporeMap } from "@/components/recommendations/open-singapore-map";
import { ShortlistCard } from "@/components/recommendations/shortlist-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { formatDateLabel } from "@/lib/utils";
import type { Plan, PlanParticipant, RecommendationCandidate, UserProfile } from "@/types";

export interface BallotViewProps {
  plan: Plan;
  candidates: RecommendationCandidate[];
  participants: PlanParticipant[];
  currentUser: UserProfile;
  isOrganizer: boolean;
  maxSelections: number;
  initialSelections: string[];
  tally: {
    candidateVotes: Record<string, number>;
    totalBallots: number;
    leaders: string[];
    isTie: boolean;
  } | null;
  onRefreshPlan: () => void;
}

export function BallotView({
  plan,
  candidates,
  participants,
  isOrganizer,
  maxSelections,
  initialSelections,
  tally,
  onRefreshPlan,
}: BallotViewProps) {
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState(initialSelections);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const mapVenues = useMemo(
    () => candidates.map(({ id, rank, name, lat, lng, coarseArea, whyRecommended }) => ({
      id,
      rank,
      name,
      lat,
      lng,
      coarseArea,
      whyRecommended,
    })),
    [candidates],
  );

  const toggleSelectCandidate = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds((current) => current.filter((item) => item !== id));
      return;
    }
    if (selectedIds.length >= maxSelections) {
      toast(`Choose up to ${maxSelections} places for this ballot.`, "info");
      return;
    }
    setSelectedIds((current) => [...current, id]);
  };

  const handleSaveBallot = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/v1/plans/${plan.id}/ballot`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateIds: selectedIds }),
      });
      const payload = await response.json();
      if (!response.ok) {
        toast(payload.error?.message ?? "Your vote could not be saved.", "error");
        return;
      }
      toast("Your choices are in.", "success");
      onRefreshPlan();
    } catch {
      toast("Your vote could not be saved. Check your connection and try again.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const leaderCandidate = candidates.find((candidate) => tally?.leaders.includes(candidate.id));

  return (
    <div className="space-y-5 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:pb-0">
      <section className="border-y border-ink-900/20 bg-[#fffaf1] px-4 py-5 sm:px-6" aria-labelledby="ballot-title">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-terra-700">Your ballot</p>
            <h2 id="ballot-title" className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink-950">Pick the places you&apos;d enjoy</h2>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-600">
              <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" aria-hidden="true" />{formatDateLabel(plan.date)}</span>
              <span className="inline-flex items-center gap-1.5"><Clock3 className="h-4 w-4" aria-hidden="true" />{plan.windowStart}–{plan.windowEnd}</span>
            </div>
          </div>
          <div className="shrink-0 border-l-2 border-terra-600 pl-4" aria-live="polite" aria-atomic="true">
            <span className="block font-display text-2xl font-semibold text-ink-950">{selectedIds.length} of {maxSelections}</span>
            <span className="text-xs text-ink-600">selected · choose at least one</span>
          </div>
        </div>
        {tally && tally.totalBallots > 0 && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-ink-900/20 pt-4 text-xs">
            <span className="inline-flex items-center gap-2 font-bold text-sage-700">
              <Trophy className="h-4 w-4 text-amber-500" aria-hidden="true" />
              {tally.isTie ? `${tally.leaders.length} places are tied` : `${leaderCandidate?.name ?? "A place"} is leading`}
            </span>
            <span className="text-ink-500">{tally.totalBallots} {tally.totalBallots === 1 ? "diner has" : "diners have"} voted</span>
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ink-900/15 pb-3">
        <div>
          <p className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-900">
            <MapIcon className="h-4 w-4 text-terra-600" aria-hidden="true" />See the shortlist in context
          </p>
          <p className="mt-1 text-xs text-ink-500">Focus a venue on the map, then add or remove it from your ballot.</p>
        </div>
        <p className="text-xs text-ink-500">You can change your choices until the organizer confirms.</p>
      </div>

      <OpenSingaporeMap
        venues={mapVenues}
        participantCount={participants.length}
        selectedVenueIds={selectedIds}
        maxSelections={maxSelections}
        onToggleVenue={toggleSelectCandidate}
      />

      <div className="grid gap-3" aria-label="Venue shortlist and ballot controls">
        {candidates.map((candidate) => {
          const votesCount = tally?.candidateVotes[candidate.id] ?? 0;
          return (
            <ShortlistCard
              key={candidate.id}
              candidate={candidate}
              isSelectable
              isSelected={selectedIds.includes(candidate.id)}
              onToggleSelect={() => toggleSelectCandidate(candidate.id)}
              isLeader={Boolean(tally?.leaders.includes(candidate.id) && votesCount > 0)}
              votesCount={votesCount}
            />
          );
        })}
      </div>

      <div role="region" className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-ink-900/20 bg-cream-50/95 p-3 backdrop-blur md:sticky md:bottom-4 md:border md:px-4" aria-label="Ballot submission">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <p className="hidden text-xs text-ink-600 sm:block"><b className="text-ink-950">{selectedIds.length}</b> selected of {maxSelections} allowed</p>
          <Button variant="primary" size="md" onClick={handleSaveBallot} isLoading={isSubmitting} disabled={selectedIds.length === 0} className="ml-auto w-full font-bold sm:w-auto">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />Submit choices
          </Button>
        </div>
      </div>

      {isOrganizer && (
        <Card variant="default" className="rounded-none border-ink-900/20 bg-sage-50/70 p-5 shadow-none">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-display text-xl font-semibold text-ink-950">Organizer decision</p>
              <p className="mt-1 text-xs text-ink-600">Choose the winning place, or override it with a short reason everyone can see.</p>
            </div>
            <Button variant="primary" size="md" onClick={() => setIsConfirmModalOpen(true)} className="font-bold">
              <Sparkles className="h-4 w-4" aria-hidden="true" />Confirm venue and time
            </Button>
          </div>
        </Card>
      )}

      <ConfirmModal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        plan={plan}
        candidates={candidates}
        tally={tally}
        onConfirmed={() => {
          setIsConfirmModalOpen(false);
          onRefreshPlan();
        }}
      />
    </div>
  );
}
