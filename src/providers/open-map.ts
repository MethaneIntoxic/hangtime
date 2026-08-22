export const OPEN_FREE_MAP_STYLE_URL =
  "https://tiles.openfreemap.org/styles/liberty";

export const OPEN_FREE_MAP_HOST = "tiles.openfreemap.org";

const SINGAPORE_BOUNDS = {
  minLat: 1.15,
  maxLat: 1.48,
  minLng: 103.6,
  maxLng: 104.1,
} as const;

export function isValidSingaporeCoordinate(lat: number, lng: number) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= SINGAPORE_BOUNDS.minLat &&
    lat <= SINGAPORE_BOUNDS.maxLat &&
    lng >= SINGAPORE_BOUNDS.minLng &&
    lng <= SINGAPORE_BOUNDS.maxLng
  );
}

export function openStreetMapVenueUrl(lat: number, lng: number, zoom = 18) {
  const latitude = lat.toFixed(6);
  const longitude = lng.toFixed(6);
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=${zoom}/${latitude}/${longitude}`;
}

export function openStreetMapEmbedUrl(lat: number, lng: number) {
  if (!isValidSingaporeCoordinate(lat, lng)) {
    throw new Error("OpenStreetMap embeds require a valid Singapore coordinate.");
  }
  const longitudeRadius = 0.018;
  const latitudeRadius = 0.012;
  const parameters = new URLSearchParams({
    bbox: [lng - longitudeRadius, lat - latitudeRadius, lng + longitudeRadius, lat + latitudeRadius]
      .map((value) => value.toFixed(6))
      .join(","),
    layer: "mapnik",
    marker: `${lat.toFixed(6)},${lng.toFixed(6)}`,
  });
  return `https://www.openstreetmap.org/export/embed.html?${parameters.toString()}`;
}
