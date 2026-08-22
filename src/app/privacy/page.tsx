"use client";

import React from "react";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/nav";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Lock, EyeOff, MapPin, ArrowLeft } from "lucide-react";

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-cream-50 pb-28">
      <Header />

      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 space-y-6 animate-fade-up">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-600 hover:text-ink-950"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </Link>
          <Badge variant="sage" size="md">
            Privacy First
          </Badge>
        </div>

        <div>
          <h1 className="font-display text-2xl font-bold text-ink-950">
            Privacy & Trust Model
          </h1>
          <p className="text-xs text-ink-500 font-medium mt-0.5">
            How Hangtime protects your location, dietary preferences, and calendar data.
          </p>
        </div>

        <div className="space-y-4">
          <Card variant="elevated" className="p-5 space-y-2">
            <div className="flex items-center gap-2 font-bold text-ink-950 text-sm">
              <EyeOff className="h-4 w-4 text-terra-600" />
              <span>Coarse-Only Location Exposure</span>
            </div>
            <p className="text-xs text-ink-600 leading-relaxed">
              Your exact postal code and precise GPS coordinates are never displayed to dining companions. Companions see only coarse region labels (e.g. &ldquo;Novena (Central)&rdquo; or &ldquo;Jurong East (West)&rdquo;). Calculations occur entirely server-side.
            </p>
          </Card>

          <Card variant="elevated" className="p-5 space-y-2">
            <div className="flex items-center gap-2 font-bold text-ink-950 text-sm">
              <MapPin className="h-4 w-4 text-sage-700" />
              <span>Open Basemap Boundary</span>
            </div>
            <p className="text-xs text-ink-600 leading-relaxed">
              The interactive venue map uses MapLibre and OpenFreeMap with OpenStreetMap data. The tile service receives normal web request metadata and a viewport around public venue candidates; Hangtime never sends participant home coordinates, postal codes, or private origin labels to it. If the service is unavailable, the shortlist remains usable without the map.
            </p>
          </Card>

          <Card variant="elevated" className="p-5 space-y-2">
            <div className="flex items-center gap-2 font-bold text-ink-950 text-sm">
              <Lock className="h-4 w-4 text-terra-600" />
              <span>Zero-Storage of OAuth Calendar Events</span>
            </div>
            <p className="text-xs text-ink-600 leading-relaxed">
              We request only free/busy availability intervals, never event titles, descriptions, attendees, or private meeting details. Raw availability windows are automatically cleared after plan completion.
            </p>
          </Card>

          <Card variant="elevated" className="p-5 space-y-2">
            <div className="flex items-center gap-2 font-bold text-ink-950 text-sm">
              <ShieldCheck className="h-4 w-4 text-sage-600" />
              <span>Transparent Decision Overrides</span>
            </div>
            <p className="text-xs text-ink-600 leading-relaxed">
              To keep group dynamics healthy and avoid behind-the-scenes vetoes, any non-leading venue confirmed by an organizer requires a mandatory 10–240 character explanation that is clearly displayed to all participants.
            </p>
          </Card>

          <Card variant="elevated" className="p-5 space-y-2">
            <div className="flex items-center gap-2 font-bold text-ink-950 text-sm">
              <MapPin className="h-4 w-4 text-terra-600" />
              <span>Singapore F&B Charges Transparency</span>
            </div>
            <p className="text-xs text-ink-600 leading-relaxed">
              Estimated budget ranges automatically incorporate Singapore&apos;s standard 10% Service Charge and 9% Goods and Services Tax (GST), ensuring realistic price projections with no hidden surprises at the table.
            </p>
          </Card>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
