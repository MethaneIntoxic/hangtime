"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  isValidSingaporeCoordinate,
  OPEN_FREE_MAP_STYLE_URL,
  openStreetMapEmbedUrl,
} from "@/providers/open-map";
import type { RecommendationCandidate } from "@/types";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import { Check, MapPin, RefreshCw, Train, TriangleAlert } from "lucide-react";

export type MapVenue = Pick<
  RecommendationCandidate,
  "id" | "rank" | "name" | "lat" | "lng" | "coarseArea" | "whyRecommended"
>;

export interface OpenSingaporeMapProps {
  venues: MapVenue[];
  participantCount: number;
  selectedVenueIds: string[];
  maxSelections: number;
  onToggleVenue: (venueId: string) => void;
}

type MapStatus = "loading" | "ready" | "failed" | "empty";
type MarkerRecord = { marker: MapLibreMarker; button: HTMLButtonElement; venueId: string; venueName: string };

export function OpenSingaporeMap({
  venues,
  participantCount,
  selectedVenueIds,
  maxSelections,
  onToggleVenue,
}: OpenSingaporeMapProps) {
  const validVenues = useMemo(
    () => venues.filter((venue) => isValidSingaporeCoordinate(venue.lat, venue.lng)),
    [venues],
  );
  const venueKey = validVenues.map((venue) => `${venue.id}:${venue.lat}:${venue.lng}`).join("|");
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<MarkerRecord[]>([]);
  const [focusedVenueId, setFocusedVenueId] = useState<string | null>(validVenues[0]?.id ?? null);
  const [mapStatus, setMapStatus] = useState<MapStatus>(validVenues.length > 0 ? "loading" : "empty");
  const [failureMessage, setFailureMessage] = useState("The live map could not be loaded.");
  const [retryAttempt, setRetryAttempt] = useState(0);

  const focusedVenue = validVenues.find((venue) => venue.id === focusedVenueId) ?? validVenues[0] ?? null;
  const isFocusedVenueSelected = focusedVenue ? selectedVenueIds.includes(focusedVenue.id) : false;

  useEffect(() => {
    const selectedSet = new Set(selectedVenueIds);
    for (const { button, venueId, venueName } of markersRef.current) {
      const selected = selectedSet.has(venueId);
      button.dataset.ballotSelected = String(selected);
      button.style.backgroundColor = selected ? "#345a3c" : "#c9431f";
      button.setAttribute("aria-label", `${selected ? "Selected on ballot. " : ""}Focus ${venueName} on the map`);
    }
  }, [selectedVenueIds]);

  useEffect(() => {
    let cancelled = false;
    let loadTimeout: ReturnType<typeof setTimeout> | undefined;
    let resizeObserver: ResizeObserver | undefined;

    const disposeMap = () => {
      if (loadTimeout) clearTimeout(loadTimeout);
      resizeObserver?.disconnect();
      for (const { marker } of markersRef.current) marker.remove();
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };

    async function initialiseMap() {
      disposeMap();
      if (!containerRef.current || validVenues.length === 0) {
        setMapStatus("empty");
        return;
      }

      setMapStatus("loading");
      setFailureMessage("The live map could not be loaded.");

      try {
        const { LngLatBounds, Map, Marker, NavigationControl } = await import("maplibre-gl");
        if (cancelled || !containerRef.current) return;

        const bounds = new LngLatBounds();
        for (const venue of validVenues) bounds.extend([venue.lng, venue.lat]);

        const map = new Map({
          container: containerRef.current,
          style: OPEN_FREE_MAP_STYLE_URL,
          ...(validVenues.length === 1
            ? { center: [validVenues[0].lng, validVenues[0].lat] as [number, number], zoom: 14 }
            : { bounds, fitBoundsOptions: { padding: 44, maxZoom: 13 } }),
          attributionControl: {
            compact: true,
            customAttribution: "OpenFreeMap · © OpenStreetMap contributors",
          },
        });
        mapRef.current = map;

        const markMapReady = () => {
          if (cancelled || !map.loaded() || !map.areTilesLoaded()) return;
          if (loadTimeout) clearTimeout(loadTimeout);
          setMapStatus("ready");
        };

        const failMap = (message: string) => {
          if (cancelled) return;
          if (loadTimeout) clearTimeout(loadTimeout);
          setFailureMessage(message);
          setMapStatus("failed");
        };

        // A style response alone can produce a blank WebGL canvas while vector
        // tiles are still pending. Only expose the live map after MapLibre has
        // rendered all requested viewport tiles; idle covers a late tile settle.
        map.once("load", markMapReady);
        map.once("idle", markMapReady);
        map.on("error", () => failMap("The map provider or WebGL renderer reported an error."));
        loadTimeout = setTimeout(() => failMap("The live map took too long to load."), 15_000);
        map.addControl(new NavigationControl({ showCompass: false }), "top-right");

        markersRef.current = validVenues.map((venue) => {
          const markerButton = document.createElement("button");
          markerButton.type = "button";
          markerButton.className = "hangtime-map-marker";
          markerButton.style.width = "44px";
          markerButton.style.height = "44px";
          markerButton.textContent = String(venue.rank);
          markerButton.setAttribute("aria-label", `Focus ${venue.name} on the map`);
          markerButton.addEventListener("click", () => {
            setFocusedVenueId(venue.id);
            const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            const camera = { center: [venue.lng, venue.lat] as [number, number], zoom: 14 };
            if (reducedMotion) map.jumpTo(camera);
            else map.easeTo(camera);
          });
          const marker = new Marker({ element: markerButton, anchor: "bottom" })
            .setLngLat([venue.lng, venue.lat])
            .addTo(map);
          return { marker, button: markerButton, venueId: venue.id, venueName: venue.name };
        });

        const selectedSet = new Set(selectedVenueIds);
        for (const record of markersRef.current) {
          const selected = selectedSet.has(record.venueId);
          record.button.dataset.ballotSelected = String(selected);
          record.button.style.backgroundColor = selected ? "#345a3c" : "#c9431f";
        }

        resizeObserver = new ResizeObserver(() => map.resize());
        resizeObserver.observe(containerRef.current);
      } catch {
        if (!cancelled) {
          setFailureMessage("This browser could not start the interactive map.");
          setMapStatus("failed");
        }
      }
    }

    void initialiseMap();
    return () => {
      cancelled = true;
      disposeMap();
    };
    // venueKey prevents referentially-new, geographically-identical API data from rebuilding MapLibre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryAttempt, venueKey]);

  const focusVenue = (venue: MapVenue) => {
    setFocusedVenueId(venue.id);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const camera = { center: [venue.lng, venue.lat] as [number, number], zoom: 14 };
    if (reducedMotion) mapRef.current?.jumpTo(camera);
    else mapRef.current?.easeTo(camera);
  };

  const statusMessage = mapStatus === "loading"
    ? "Loading the open venue map."
    : mapStatus === "ready"
      ? `Map ready with ${validVenues.length} venues.`
      : mapStatus === "empty"
        ? "No venues have valid Singapore coordinates."
        : failureMessage;

  return (
    <Card variant="elevated" className="overflow-hidden p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-ink-900">
          <Train className="h-4 w-4 text-terra-600" aria-hidden="true" />
          <span>Fair-meet venue map</span>
        </div>
        <span className="text-[11px] text-ink-500">{participantCount} people · home points stay hidden</span>
      </div>

      <p className="sr-only" aria-live="polite" aria-atomic="true">{statusMessage}</p>

      <div className="relative min-h-72 overflow-hidden rounded-2xl border border-cream-300 bg-[#e9e1d6] shadow-inner">
        <div ref={containerRef} role="region" aria-label="Interactive map of recommended Singapore venues" aria-busy={mapStatus === "loading"} inert={mapStatus !== "ready" ? true : undefined} className="h-72 w-full sm:h-80" />

        {mapStatus === "loading" && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-cream-100/80 text-xs font-bold text-ink-600">Loading the open map…</div>
        )}

        {mapStatus === "empty" && (
          <div className="absolute inset-0 grid place-items-center bg-cream-100 p-6 text-center">
            <div className="max-w-sm">
              <MapPin className="mx-auto h-6 w-6 text-terra-600" aria-hidden="true" />
              <p className="mt-2 text-sm font-bold text-ink-900">No mappable venues yet.</p>
              <p className="mt-1 text-xs leading-5 text-ink-600">The shortlist remains available while venue coordinates are checked.</p>
            </div>
          </div>
        )}

        {mapStatus === "failed" && (
          <div className="absolute inset-0 bg-cream-100">
            {focusedVenue && (
              <iframe
                title={`Basic OpenStreetMap view of ${focusedVenue.name}`}
                src={openStreetMapEmbedUrl(focusedVenue.lat, focusedVenue.lng)}
                className="h-full w-full border-0"
                loading="eager"
                referrerPolicy="no-referrer"
                sandbox="allow-scripts allow-same-origin"
              />
            )}
            <div className="absolute left-2 right-2 top-2 flex flex-wrap items-center justify-between gap-2 border border-ink-900/25 bg-cream-50/95 p-2 text-left shadow-soft">
              <span className="inline-flex items-center gap-2 text-xs font-bold text-ink-900">
                <TriangleAlert className="h-4 w-4 text-amber-900" aria-hidden="true" />Basic map fallback · {failureMessage}
              </span>
              <Button variant="outline" size="sm" onClick={() => setRetryAttempt((attempt) => attempt + 1)}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" /> Retry live map
              </Button>
            </div>
          </div>
        )}
      </div>

      {validVenues.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Map venue choices">
          {validVenues.map((venue) => (
            <button key={venue.id} type="button" onClick={() => focusVenue(venue)} aria-pressed={focusedVenue?.id === venue.id} className={`min-h-11 shrink-0 border px-3 text-left text-xs transition ${focusedVenue?.id === venue.id ? "border-terra-600 bg-terra-50 text-terra-800" : "border-cream-300 bg-cream-50 text-ink-700 hover:border-ink-900/30"}`}>
              <b>#{venue.rank}</b> {venue.name}
              {selectedVenueIds.includes(venue.id) && <Check className="ml-1 inline h-3.5 w-3.5 text-sage-700" aria-label="Selected on ballot" />}
            </button>
          ))}
        </div>
      )}

      {focusedVenue && (
        <div className="mt-3 border border-cream-200 bg-cream-100 p-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 font-bold text-ink-950 sm:text-sm">
              <MapPin className="h-4 w-4 text-terra-600" aria-hidden="true" />#{focusedVenue.rank} {focusedVenue.name}
            </span>
            <Badge variant="terra" size="sm">{focusedVenue.coarseArea}</Badge>
          </div>
          <p className="mt-1.5 text-[11px] font-medium leading-5 text-ink-600">{focusedVenue.whyRecommended}</p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-ink-500">{selectedVenueIds.length} of {maxSelections} ballot choices used</span>
            <Button variant={isFocusedVenueSelected ? "outline" : "sage"} size="sm" onClick={() => onToggleVenue(focusedVenue.id)}>
              {isFocusedVenueSelected ? "Remove from ballot" : "Add to ballot"}
            </Button>
          </div>
        </div>
      )}

      <p className="mt-3 text-[10px] leading-4 text-ink-500">Basemap: OpenFreeMap with OpenStreetMap data. Venue locations come from Hangtime&apos;s curated Singapore catalogue; routing times remain estimates in this MVP.</p>
    </Card>
  );
}
