"use client";

import React, { useState } from "react";
import { RecommendationCandidate, PlanParticipant } from "@/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Train } from "lucide-react";

export interface SingaporeMapProps {
  candidates: RecommendationCandidate[];
  participants: PlanParticipant[];
}

export function SingaporeMap({ candidates, participants }: SingaporeMapProps) {
  const [selectedCandidate, setSelectedCandidate] = useState<RecommendationCandidate | null>(
    candidates[0] || null
  );

  // Singapore bounding box:
  // Lat: 1.22 to 1.47 (height 0.25)
  // Lng: 103.60 to 104.04 (width 0.44)
  const mapWidth = 540;
  const mapHeight = 320;

  const projectCoord = (lat: number, lng: number) => {
    const minLat = 1.24;
    const maxLat = 1.45;
    const minLng = 103.65;
    const maxLng = 103.98;

    const x = ((lng - minLng) / (maxLng - minLng)) * mapWidth;
    const y = mapHeight - ((lat - minLat) / (maxLat - minLat)) * mapHeight;

    return { x: Math.max(20, Math.min(mapWidth - 20, x)), y: Math.max(20, Math.min(mapHeight - 20, y)) };
  };

  return (
    <div className="space-y-4">
      <Card variant="elevated" className="p-4 overflow-hidden relative">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-ink-900">
            <Train className="h-4 w-4 text-terra-600" />
            <span>Singapore venue area overview</span>
          </div>
          <span className="text-[11px] text-ink-500">{participants.length} diners · home points stay hidden</span>
        </div>

        {/* SVG Singapore Map Canvas */}
        <div className="relative rounded-2xl bg-[#f5efe6] border border-cream-300 p-2 overflow-hidden shadow-inner flex items-center justify-center">
          <svg
            viewBox={`0 0 ${mapWidth} ${mapHeight}`}
            className="w-full h-auto max-h-[300px] select-none"
          >
            {/* Stylized Singapore Island Outline */}
            <path
              d="M 60 180 Q 90 140, 160 120 T 260 90 T 360 80 Q 440 90, 480 140 Q 510 180, 480 230 Q 420 260, 320 270 Q 200 280, 120 260 Q 60 230, 60 180 Z"
              fill="#ebdcc8"
              stroke="#dac4aa"
              strokeWidth="2"
            />
            {/* Sentosa / Southern Islands */}
            <ellipse cx="280" cy="285" rx="35" ry="12" fill="#ebdcc8" stroke="#dac4aa" strokeWidth="1.5" />

            {/* MRT Line Network Visuals */}
            {/* East West Line (Green) */}
            <path
              d="M 90 190 Q 200 210, 270 230 T 360 220 T 480 160"
              fill="none"
              stroke="#009640"
              strokeWidth="2.5"
              strokeDasharray="4,4"
              opacity="0.6"
            />
            {/* North South Line (Red) */}
            <path
              d="M 180 90 Q 230 140, 260 180 T 275 240"
              fill="none"
              stroke="#d42e12"
              strokeWidth="2.5"
              strokeDasharray="4,4"
              opacity="0.6"
            />
            {/* Downtown Line (Blue) */}
            <path
              d="M 180 160 Q 280 200, 300 220 T 420 180"
              fill="none"
              stroke="#005ec4"
              strokeWidth="2.5"
              strokeDasharray="4,4"
              opacity="0.6"
            />

            {/* Candidate Venue Pins */}
            {candidates.map((c) => {
              const { x, y } = projectCoord(c.lat, c.lng);
              const isSelected = selectedCandidate?.id === c.id;

              return (
                <g
                  key={c.id}
                  onClick={() => setSelectedCandidate(c)}
                  className="cursor-pointer group"
                >
                  <circle
                    cx={x}
                    cy={y}
                    r={isSelected ? "12" : "9"}
                    fill={isSelected ? "#e4572e" : "#f0b84e"}
                    stroke="#ffffff"
                    strokeWidth="2.5"
                    className="transition-all duration-200 hover:scale-125 shadow-soft"
                  />
                  <text
                    x={x}
                    y={y + 3}
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="bold"
                    fill={isSelected ? "#ffffff" : "#221b14"}
                    className="select-none pointer-events-none"
                  >
                    #{c.rank}
                  </text>
                  <text
                    x={x}
                    y={y + 18}
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight={isSelected ? "bold" : "normal"}
                    fill="#17120d"
                    className="select-none"
                  >
                    {c.name.split(" ")[0]}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Selected Pin Details Box */}
        {selectedCandidate && (
          <div className="mt-3 p-3 rounded-xl bg-cream-100 border border-cream-200 animate-fade-in text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-ink-950 text-sm">
                #{selectedCandidate.rank} {selectedCandidate.name}
              </span>
              <Badge variant="terra" size="sm">
                {selectedCandidate.coarseArea}
              </Badge>
            </div>
            <p className="text-[11px] text-ink-600 font-medium">
              {selectedCandidate.whyRecommended}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {selectedCandidate.transitEstimates.map((te) => (
                <span
                  key={te.participantId}
                  className="bg-cream-50 px-2 py-0.5 rounded-md border border-cream-300 text-[10px] font-semibold text-ink-800"
                >
                  {te.displayName}: {te.durationMinutes} mins ({te.transitSummary.split(" · ")[0]})
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
