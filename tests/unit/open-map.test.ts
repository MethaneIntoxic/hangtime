import { describe, expect, it } from "vitest";
import {
  isValidSingaporeCoordinate,
  OPEN_FREE_MAP_HOST,
  OPEN_FREE_MAP_STYLE_URL,
  openStreetMapVenueUrl,
  openStreetMapEmbedUrl,
} from "@/providers/open-map";

describe("open map provider", () => {
  it("uses the keyless OpenFreeMap style endpoint", () => {
    const styleUrl = new URL(OPEN_FREE_MAP_STYLE_URL);
    expect(styleUrl.protocol).toBe("https:");
    expect(styleUrl.hostname).toBe(OPEN_FREE_MAP_HOST);
    expect(styleUrl.search).toBe("");
  });

  it("creates an OpenStreetMap venue link without leaking an origin", () => {
    const url = openStreetMapVenueUrl(1.2808, 103.8475);
    expect(url).toBe("https://www.openstreetmap.org/?mlat=1.280800&mlon=103.847500#map=18/1.280800/103.847500");
    expect(url).not.toContain("google");
    expect(url).not.toContain("origin");
  });

  it("creates a bounded, keyless OpenStreetMap fallback embed", () => {
    const url = new URL(openStreetMapEmbedUrl(1.2808, 103.8475));
    expect(url.origin).toBe("https://www.openstreetmap.org");
    expect(url.pathname).toBe("/export/embed.html");
    expect(url.searchParams.get("marker")).toBe("1.280800,103.847500");
    expect(url.searchParams.get("bbox")?.split(",")).toHaveLength(4);
    expect(url.href).not.toContain("origin");
  });

  it("accepts finite coordinates inside Singapore", () => {
    expect(isValidSingaporeCoordinate(1.2808, 103.8475)).toBe(true);
    expect(isValidSingaporeCoordinate(1.15, 103.6)).toBe(true);
    expect(isValidSingaporeCoordinate(1.48, 104.1)).toBe(true);
  });

  it("rejects malformed and out-of-Singapore coordinates", () => {
    expect(isValidSingaporeCoordinate(Number.NaN, 103.8475)).toBe(false);
    expect(isValidSingaporeCoordinate(1.2808, Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidSingaporeCoordinate(51.5074, -0.1278)).toBe(false);
    expect(isValidSingaporeCoordinate(1.49, 103.8475)).toBe(false);
  });
});
