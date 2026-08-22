"use client";

import {
  Check,
  ChevronDown,
  CircleDollarSign,
  ExternalLink,
  MapPin,
  Navigation,
  Sparkles,
  Train,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCentsToSGD } from "@/lib/utils";
import type { RecommendationCandidate } from "@/types";

export interface ShortlistCardProps {
  candidate: RecommendationCandidate;
  isSelectable?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  isLeader?: boolean;
  votesCount?: number;
}

export function ShortlistCard({
  candidate,
  isSelectable = false,
  isSelected = false,
  onToggleSelect,
  isLeader = false,
  votesCount,
}: ShortlistCardProps) {
  const averageTravel = Math.round(
    candidate.transitEstimates.reduce((sum, estimate) => sum + estimate.durationMinutes, 0) /
      Math.max(candidate.transitEstimates.length, 1),
  );

  return (
    <article
      className={`relative border bg-[#fffaf1] transition ${
        isSelected
          ? "border-terra-600 shadow-[4px_4px_0_rgb(201_67_31_/_0.22)]"
          : "border-ink-900/15 hover:border-ink-900/35"
      }`}
    >
      <div className="grid grid-cols-[auto_1fr_auto] gap-3 p-4 sm:gap-5 sm:p-5">
        <span className={`grid h-10 w-10 place-items-center rounded-full border text-sm font-extrabold ${isSelected ? "border-terra-600 bg-terra-600 text-white" : "border-terra-300 bg-terra-50 text-terra-700"}`}>
          {candidate.rank}
        </span>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-xl font-semibold leading-tight text-ink-950 sm:text-2xl">{candidate.name}</h3>
            {isLeader && <Badge variant="sage">Leading · {votesCount} {votesCount === 1 ? "vote" : "votes"}</Badge>}
            {!isLeader && Boolean(votesCount) && <Badge variant="neutral">{votesCount} votes</Badge>}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-600">
            <span>{candidate.cuisine}</span><span aria-hidden="true">·</span>
            <span>{"$".repeat(candidate.priceTier)}</span><span aria-hidden="true">·</span>
            <span className="font-bold text-amber-900">★ {candidate.rating}</span>
            <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden="true" />{candidate.coarseArea}</span>
          </p>

          <p className="mt-3 flex items-start gap-2 text-sm leading-5 text-ink-800">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-terra-600" aria-hidden="true" />
            {candidate.whyRecommended}
          </p>

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-ink-700">
            <span className="inline-flex items-center gap-1.5"><Train className="h-4 w-4 text-sage-700" aria-hidden="true" />About {averageTravel} min each</span>
            <span className="inline-flex items-center gap-1.5"><CircleDollarSign className="h-4 w-4 text-amber-900" aria-hidden="true" />{formatCentsToSGD(candidate.priceRangeMinCents)}–{formatCentsToSGD(candidate.priceRangeMaxCents)} group</span>
          </div>
        </div>

        {isSelectable && (
          <button
            type="button"
            onClick={onToggleSelect}
            aria-pressed={isSelected}
            aria-label={`${isSelected ? "Remove" : "Add"} ${candidate.name} ${isSelected ? "from" : "to"} your ballot`}
            className={`grid h-11 w-11 place-items-center rounded-full border-2 transition ${isSelected ? "border-terra-600 bg-terra-600 text-white" : "border-ink-900/20 bg-cream-50 text-transparent hover:border-terra-500"}`}
          >
            <Check className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>

      <details className="group/details border-t border-ink-900/10 px-4 sm:px-5">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-xs font-bold text-ink-700 marker:content-none">
          Travel, dietary and price details
          <ChevronDown className="h-4 w-4 transition group-open/details:rotate-180" aria-hidden="true" />
        </summary>
        <div className="grid gap-5 border-t border-dashed border-ink-900/15 py-4 sm:grid-cols-2">
          <div>
            <h4 className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-sage-700">Public transport</h4>
            <ul className="mt-2 space-y-2 text-xs text-ink-700">
              {candidate.transitEstimates.map((estimate) => (
                <li key={estimate.participantId} className="flex justify-between gap-4">
                  <span>{estimate.displayName} · {estimate.originCoarseArea}</span>
                  <b className="shrink-0">{estimate.durationMinutes} min</b>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-terra-700">Good to know</h4>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {candidate.badges.map((badge) => <Badge key={badge.id} variant={badge.variant}>{badge.label}</Badge>)}
            </div>
            {candidate.dietarySuitability.map((item) => (
              <p key={item.ruleCode} className={`mt-2 text-xs leading-5 ${item.status === "incompatible" ? "font-bold text-berry-700" : item.status === "caution" ? "text-amber-900" : "text-ink-600"}`}>
                {item.note}
              </p>
            ))}
            <p className="mt-2 text-[11px] text-ink-500">Group estimate includes 10% service charge and 9% GST.</p>
          </div>
        </div>
      </details>

      <div className="flex flex-wrap justify-end gap-2 border-t border-ink-900/10 px-4 py-3 sm:px-5">
        {candidate.mapsUrl && (
          <a href={candidate.mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 px-3 text-xs font-bold text-ink-700 hover:text-terra-700">
            <Navigation className="h-4 w-4" aria-hidden="true" />Open map
          </a>
        )}
        {candidate.bookingUrl && (
          <a href={candidate.bookingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 border border-terra-700 px-4 text-xs font-bold text-terra-700 hover:bg-terra-50">
            Book or view menu <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        )}
      </div>
    </article>
  );
}
