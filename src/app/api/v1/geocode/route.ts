import { apiSuccess } from "@/lib/api-response";
import { SINGAPORE_PLANNING_AREAS } from "@/providers/singapore-transit";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const query = (url.searchParams.get("q") || "").toLowerCase().trim();

  if (!query) {
    return apiSuccess({ results: SINGAPORE_PLANNING_AREAS });
  }

  const results = SINGAPORE_PLANNING_AREAS.filter(
    (area) =>
      area.label.toLowerCase().includes(query) ||
      area.postalCode.includes(query) ||
      area.region.toLowerCase().includes(query)
  );

  return apiSuccess({ results });
}
