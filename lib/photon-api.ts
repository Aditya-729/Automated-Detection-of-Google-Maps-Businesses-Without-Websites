const PHOTON_API_URL = "https://photon.komoot.io/api/";

let lastPhotonRequestAt = 0;

export interface PhotonPlaceSummary {
  osm_id: number | string;
  osm_type: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
}

interface PhotonFeature {
  properties?: {
    osm_id?: number | string;
    osm_type?: string;
    name?: string;
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
    street?: string;
    housenumber?: string;
    extent?: number[];
  };
  geometry?: {
    coordinates?: [number, number];
  };
}

interface PhotonResponse {
  features?: PhotonFeature[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function formatPhotonAddress(props: PhotonFeature["properties"]) {
  if (!props) {
    return "Unknown";
  }
  const parts = [
    props.housenumber,
    props.street,
    props.city,
    props.state,
    props.postcode,
    props.country,
  ]
    .filter(Boolean)
    .join(" ");

  return parts || props.name || "Unknown";
}

export async function searchPhotonPlaces(params: {
  query: string;
  bounds: { west: number; east: number; north: number; south: number };
  limit: number;
  rateLimitMs: number;
  signal?: AbortSignal;
}): Promise<PhotonPlaceSummary[]> {
  const now = Date.now();
  const waitMs = Math.max(0, params.rateLimitMs - (now - lastPhotonRequestAt));
  if (waitMs > 0) {
    await sleep(waitMs);
  }
  lastPhotonRequestAt = Date.now();

  const url = new URL(PHOTON_API_URL);
  url.searchParams.set("q", params.query);
  url.searchParams.set(
    "bbox",
    `${params.bounds.west},${params.bounds.south},${params.bounds.east},${params.bounds.north}`
  );
  url.searchParams.set("limit", String(params.limit));
  url.searchParams.set("lang", "en");

  const response = await fetch(url.toString(), { signal: params.signal });
  if (!response.ok) {
    return [];
  }

  const data = (await response.json().catch(() => null)) as PhotonResponse | null;
  const results: PhotonPlaceSummary[] = [];
  if (!data?.features) {
    return results;
  }

  for (const feature of data.features) {
    const coords = feature.geometry?.coordinates;
    const props = feature.properties;
    if (!coords || !props?.osm_id || !props?.osm_type) {
      continue;
    }

    results.push({
      osm_id: props.osm_id,
      osm_type: props.osm_type,
      name: props.name || "Unknown",
      address: formatPhotonAddress(props),
      lat: coords[1],
      lon: coords[0],
    });
  }

  return results;
}
