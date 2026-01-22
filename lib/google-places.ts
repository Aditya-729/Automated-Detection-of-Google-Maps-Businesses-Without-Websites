const GOOGLE_PLACES_NEARBY_URL =
  "https://maps.googleapis.com/maps/api/place/nearbysearch/json";
const GOOGLE_PLACES_TEXT_URL =
  "https://maps.googleapis.com/maps/api/place/textsearch/json";
const GOOGLE_PLACES_DETAILS_URL =
  "https://maps.googleapis.com/maps/api/place/details/json";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface GooglePlacesNearbyResult {
  place_id: string;
  name: string;
  vicinity?: string;
  formatted_address?: string;
  geometry?: {
    location?: {
      lat: number;
      lng: number;
    };
  };
}

interface GooglePlacesResponse<T> {
  status: string;
  results?: T[];
  result?: T;
  next_page_token?: string;
  error_message?: string;
}

export interface GooglePlaceSummary {
  place_id: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
}

async function fetchGoogleJson<T>(url: string): Promise<GooglePlacesResponse<T> | null> {
  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }
  return (await response.json().catch(() => null)) as GooglePlacesResponse<T> | null;
}

export async function searchGooglePlacesNearby(params: {
  apiKey: string;
  location: { lat: number; lon: number };
  radiusMeters: number;
  keyword?: string;
  type?: string;
}): Promise<GooglePlaceSummary[]> {
  const results: GooglePlaceSummary[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(GOOGLE_PLACES_NEARBY_URL);
    url.searchParams.set("key", params.apiKey);
    url.searchParams.set("location", `${params.location.lat},${params.location.lon}`);
    url.searchParams.set("radius", String(params.radiusMeters));
    if (params.keyword) {
      url.searchParams.set("keyword", params.keyword);
    }
    if (params.type) {
      url.searchParams.set("type", params.type);
    }
    if (pageToken) {
      url.searchParams.set("pagetoken", pageToken);
    }

    const data = await fetchGoogleJson<GooglePlacesNearbyResult>(url.toString());
    if (!data || (data.status !== "OK" && data.status !== "ZERO_RESULTS")) {
      break;
    }

    const batch = data.results || [];
    for (const place of batch) {
      const location = place.geometry?.location;
      if (!location || !place.place_id) {
        continue;
      }
      results.push({
        place_id: place.place_id,
        name: place.name || "Unknown",
        address:
          place.vicinity || place.formatted_address || "Unknown",
        lat: location.lat,
        lon: location.lng,
      });
    }

    pageToken = data.next_page_token;
    if (pageToken) {
      await sleep(2000);
    }
  } while (pageToken);

  return results;
}

export async function findGooglePlaceId(
  query: string,
  apiKey: string
): Promise<string | null> {
  const url = new URL(GOOGLE_PLACES_TEXT_URL);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("query", query);
  const data = await fetchGoogleJson<GooglePlacesNearbyResult>(url.toString());
  if (!data || data.status !== "OK" || !data.results?.length) {
    return null;
  }
  return data.results[0]?.place_id || null;
}

export async function getGooglePlaceWebsite(
  placeId: string,
  apiKey: string
): Promise<string | null> {
  const url = new URL(GOOGLE_PLACES_DETAILS_URL);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "website");

  const data = await fetchGoogleJson<{ website?: string }>(url.toString());
  if (!data || data.status !== "OK") {
    return null;
  }

  return data.result?.website || null;
}
