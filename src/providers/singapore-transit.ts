export interface TransitRouteResult {
  durationMinutes: number;
  transitSummary: string;
  mrtLines: string[];
}

// Representative Singapore Planning Areas & Coarse Coordinates
export const SINGAPORE_PLANNING_AREAS = [
  { label: "Bishan / Ang Mo Kio (Central)", postalCode: "579837", lat: 1.3508, lng: 103.8481, region: "central_north" },
  { label: "Novena / Balestier (Central)", postalCode: "307683", lat: 1.3204, lng: 103.8436, region: "central" },
  { label: "Jurong East / Clementi (West)", postalCode: "609731", lat: 1.3329, lng: 103.7436, region: "west" },
  { label: "Tampines / Pasir Ris (East)", postalCode: "529538", lat: 1.3533, lng: 103.9452, region: "east" },
  { label: "Woodlands / Yishun (North)", postalCode: "738343", lat: 1.4368, lng: 103.7865, region: "north" },
  { label: "Punggol / Sengkang (North-East)", postalCode: "828629", lat: 1.4052, lng: 103.9023, region: "northeast" },
  { label: "Queenstown / Holland V (South-West)", postalCode: "149732", lat: 1.2942, lng: 103.8060, region: "southwest" },
  { label: "Telok Ayer / CBD (South)", postalCode: "069870", lat: 1.2808, lng: 103.8475, region: "cbd" },
  { label: "Bugis / City Hall (Central)", postalCode: "188395", lat: 1.2965, lng: 103.8548, region: "bugis" },
  { label: "Katong / Marine Parade (East)", postalCode: "428771", lat: 1.3048, lng: 103.9038, region: "east_coast" },
];

/**
 * Calculates realistic door-to-door public transit travel time in Singapore
 * using haversine distance + Singapore MRT line connectivity modeling.
 */
export function estimateSingaporeTransit(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  originLabel?: string
): TransitRouteResult {
  // Haversine distance in km
  const R = 6371; // Earth radius in km
  const dLat = ((destLat - originLat) * Math.PI) / 180;
  const dLng = ((destLng - originLng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((originLat * Math.PI) / 180) *
      Math.cos((destLat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightDistanceKm = R * c;

  // In Singapore, urban transit factor is ~1.4x road distance, average transit speed ~24-28 km/h + 8m fixed walk/wait
  const estimatedDuration = Math.max(
    10,
    Math.round(8 + straightDistanceKm * 2.1)
  );

  // Determine likely MRT lines
  const lines: string[] = [];
  const originText = (originLabel || "").toLowerCase();

  if (originText.includes("jurong") || originText.includes("clementi") || originText.includes("queenstown")) {
    lines.push("EWL");
  }
  if (originText.includes("tampines") || originText.includes("pasir ris") || originText.includes("bedok")) {
    lines.push("DTL", "EWL");
  }
  if (originText.includes("bishan") || originText.includes("ang mo kio") || originText.includes("novena") || originText.includes("woodlands")) {
    lines.push("NSL");
  }
  if (originText.includes("punggol") || originText.includes("sengkang") || originText.includes("serangoon")) {
    lines.push("NEL");
  }
  if (lines.length === 0) {
    lines.push("TEL", "DTL");
  }

  const primaryLine = lines[0];
  const lineNames: Record<string, string> = {
    EWL: "East West Line",
    NSL: "North South Line",
    NEL: "North East Line",
    CCL: "Circle Line",
    DTL: "Downtown Line",
    TEL: "Thomson-East Coast Line",
  };

  const summary = `MRT (${lineNames[primaryLine] || "Downtown Line"}) · ${estimatedDuration} mins`;

  return {
    durationMinutes: estimatedDuration,
    transitSummary: summary,
    mrtLines: Array.from(new Set(lines)),
  };
}
