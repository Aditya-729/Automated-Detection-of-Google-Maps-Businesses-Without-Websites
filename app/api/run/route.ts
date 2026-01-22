/**
 * API ROUTE (app/api/run/route.ts)
 * 
 * Updated to:
 * - Geo-tile a 10–60km radius into smaller tiles
 * - Paginate through every tile page
 * - Deduplicate and filter businesses without websites
 * - Stream results progressively to the frontend
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  getBusinessFromCache,
  upsertBusiness,
  updateBusiness,
  isDataFresh,
  BusinessRecord,
} from "@/lib/db-businesses";
import { buildGoogleMapsSearchUrl, checkBusinessWebsite } from "@/lib/mino-api";
import {
  searchGooglePlacesNearby,
  findGooglePlaceId,
  getGooglePlaceWebsite,
} from "@/lib/google-places";
import type { GooglePlaceSummary } from "@/lib/google-places";
import { searchPhotonPlaces } from "@/lib/photon-api";

/**
 * Gemini toggle
 * - Set USE_GEMINI=true to enable live Gemini extraction.
 * - Default is local/rule-based extraction for reliability.
 */
const USE_GEMINI =
  process.env.USE_GEMINI === "true" ||
  (process.env.USE_GEMINI !== "false" && !!process.env.GEMINI_API_KEY);
const GEMINI_FORCE_MOCK = process.env.GEMINI_FORCE_MOCK === "true";

/**
 * MINO API timeout logic (safe for Vercel limits).
 */
const rawMinoTimeout = Number(process.env.MINO_API_TIMEOUT_MS || 8000);
const MINO_API_TIMEOUT_MS =
  process.env.NODE_ENV === "production"
    ? Math.min(rawMinoTimeout, 8000)
    : rawMinoTimeout;

const NOMINATIM_RATE_LIMIT_MS = Number(
  process.env.NOMINATIM_RATE_LIMIT_MS || 1100
);
const TILE_SIZE_KM = Number(process.env.TILE_SIZE_KM || 6);
const TILE_OVERLAP_KM = Number(process.env.TILE_OVERLAP_KM || 1.5);
const MAX_PAGE_SIZE = 50;
const MAX_TILES_PER_REQUEST = Math.max(
  5,
  Number(process.env.MAX_TILES_PER_REQUEST || 40)
);
const WEBSITE_CHECK_CONCURRENCY = Math.max(
  1,
  Number(process.env.WEBSITE_CHECK_CONCURRENCY || 4)
);
const WEBSITE_CHECK_RETRIES = Math.max(
  0,
  Number(process.env.WEBSITE_CHECK_RETRIES || 2)
);
const OVERPASS_TIMEOUT_MS = Math.max(
  5000,
  Number(process.env.OVERPASS_TIMEOUT_MS || 25000)
);
const OVERPASS_RATE_LIMIT_MS = Math.max(
  500,
  Number(process.env.OVERPASS_RATE_LIMIT_MS || 1100)
);
const PHOTON_RATE_LIMIT_MS = Math.max(
  500,
  Number(process.env.PHOTON_RATE_LIMIT_MS || 1100)
);
const PHOTON_MAX_RESULTS = Math.max(
  20,
  Number(process.env.PHOTON_MAX_RESULTS || 80)
);
const DEFAULT_RADIUS_KM = 50;
const MIN_RADIUS_KM = 10;
const MAX_RADIUS_KM = 1000;

interface BusinessResult {
  name: string;
  address: string;
  place_id: string;
  lat: number | null;
  lon: number | null;
  website?: string | null;
  source?: "osm" | "google";
  google_place_id?: string | null;
}

interface GeoPoint {
  lat: number;
  lon: number;
}

interface GeoTile {
  id: string;
  bounds: {
    west: number;
    east: number;
    north: number;
    south: number;
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const kmToLatDegrees = (km: number) => km / 111.32;
const kmToLngDegrees = (km: number, atLat: number) =>
  km / (111.32 * Math.cos((atLat * Math.PI) / 180));

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function buildTiles(
  center: GeoPoint,
  radiusKm: number,
  tileSizeKm: number,
  overlapKm: number
): GeoTile[] {
  const stepKm = Math.max(tileSizeKm - overlapKm, 1);
  const steps = Math.ceil(radiusKm / stepKm);
  const tiles: GeoTile[] = [];
  const latStepDeg = kmToLatDegrees(stepKm);
  const lonStepDeg = kmToLngDegrees(stepKm, center.lat);

  let tileIndex = 0;
  for (let y = -steps; y <= steps; y += 1) {
    for (let x = -steps; x <= steps; x += 1) {
      const offsetKm = Math.sqrt(x * x + y * y) * stepKm;
      if (offsetKm > radiusKm + tileSizeKm / 2) {
        continue;
      }

      const tileCenter: GeoPoint = {
        lat: center.lat + y * latStepDeg,
        lon: center.lon + x * lonStepDeg,
      };

      const halfLat = kmToLatDegrees(tileSizeKm / 2);
      const halfLon = kmToLngDegrees(tileSizeKm / 2, tileCenter.lat);

      tiles.push({
        id: `tile-${tileIndex}`,
        bounds: {
          west: tileCenter.lon - halfLon,
          east: tileCenter.lon + halfLon,
          north: tileCenter.lat + halfLat,
          south: tileCenter.lat - halfLat,
        },
      });
      tileIndex += 1;
    }
  }

  return tiles;
}

function extractLocationFromPrompt(rawPrompt: string): string | null {
  const cleaned = rawPrompt
    .toLowerCase()
    .replace(/\b(with|without)\s+(a\s+)?website[s]?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const match =
    cleaned.match(/\bin\s+([a-z0-9\s.,'-]+)$/i) ||
    cleaned.match(/\bnear\s+([a-z0-9\s.,'-]+)$/i) ||
    cleaned.match(/\baround\s+([a-z0-9\s.,'-]+)$/i) ||
    cleaned.match(/\bat\s+([a-z0-9\s.,'-]+)$/i) ||
    cleaned.match(/\bin\s+([a-z0-9\s.,'-]+?)(?:,|\s+with|\s+without|$)/i) ||
    cleaned.match(/\bnear\s+([a-z0-9\s.,'-]+?)(?:,|\s+with|\s+without|$)/i) ||
    cleaned.match(/\baround\s+([a-z0-9\s.,'-]+?)(?:,|\s+with|\s+without|$)/i) ||
    cleaned.match(/\bat\s+([a-z0-9\s.,'-]+?)(?:,|\s+with|\s+without|$)/i);

  if (!match) {
    return null;
  }

  return match[1].trim().replace(/\s+/g, " ");
}

function extractBusinessTypesFromPrompt(rawPrompt: string): string[] {
  const prompt = rawPrompt.toLowerCase();
  const keywords: Array<[RegExp, string]> = [
    [/\brestaurants?\b/, "restaurant"],
    [/\bspas?\b/, "spa"],
    [/\bgyms?\b/, "gym"],
    [/\bsalons?\b/, "salon"],
    [/\bcoffee\s*shops?\b/, "coffee shop"],
    [/\bcafes?\b/, "cafe"],
    [/\bgrocery\s*stores?\b/, "grocery store"],
    [/\bhotels?\b/, "hotel"],
    [/\bclinics?\b/, "clinic"],
    [/\bdentists?\b/, "dentist"],
    [/\bbarbers?\b/, "barber"],
  ];

  const types = new Set<string>();
  for (const [pattern, value] of keywords) {
    if (pattern.test(prompt)) {
      types.add(value);
    }
  }

  if (types.size === 0) {
    const fallbackMatch = prompt.match(
      /\b(find|list|show)\s+([a-z\s,]+?)\s+in\b/i
    );
    if (fallbackMatch) {
      fallbackMatch[2]
        .split(/,|and|&/i)
        .map((chunk) => chunk.trim())
        .filter(Boolean)
        .forEach((chunk) => types.add(chunk));
    }
  }

  if (types.size === 0) {
    types.add("business");
  }

  return Array.from(types);
}

function parseGeminiJson(responseText: string) {
  const cleanedText = responseText
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  try {
    return JSON.parse(cleanedText);
  } catch {
    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  }

  return null;
}

async function geocodeLocation(
  location: string,
  signal?: AbortSignal
): Promise<GeoPoint | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.append("q", location);
  url.searchParams.append("format", "json");
  url.searchParams.append("limit", "1");

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": "business-website-checker/1.0",
    },
    signal,
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json().catch(() => null);
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const [first] = data;
  const lat = Number(first.lat);
  const lon = Number(first.lon);

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return null;
  }

  return { lat, lon };
}

let lastNominatimRequestAt = 0;
let lastOverpassRequestAt = 0;

async function fetchNominatim(url: URL, signal?: AbortSignal) {
  const now = Date.now();
  const waitMs = Math.max(
    0,
    NOMINATIM_RATE_LIMIT_MS - (now - lastNominatimRequestAt)
  );
  if (waitMs > 0) {
    await sleep(waitMs);
  }
  lastNominatimRequestAt = Date.now();

  const response = await fetch(url.toString(), {
        headers: {
          "User-Agent": "business-website-checker/1.0",
        },
    signal,
  });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
    console.error("Nominatim error:", response.status, errorText);
    return [];
  }

  const data = await response.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}

async function fetchOverpass(query: string, signal?: AbortSignal) {
  const now = Date.now();
  const waitMs = Math.max(0, OVERPASS_RATE_LIMIT_MS - (now - lastOverpassRequestAt));
  if (waitMs > 0) {
    await sleep(waitMs);
  }
  lastOverpassRequestAt = Date.now();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);

  try {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "business-website-checker/1.0",
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: signal ?? controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error("Overpass error:", response.status, errorText);
      return [];
    }

    const data = await response.json().catch(() => null);
    return Array.isArray(data?.elements) ? data.elements : [];
  } catch (error) {
    if (error instanceof Error && error.name !== "AbortError") {
      console.error("Overpass fetch error:", error);
    }
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildPlaceId(place: {
  osm_type?: string;
  osm_id?: string | number;
  place_id?: string | number;
}) {
  if (place.osm_type && place.osm_id) {
    return `osm:${place.osm_type}:${place.osm_id}`;
  }
  return String(place.place_id || "");
}

function normalizeBusiness(place: {
  display_name?: string;
  osm_type?: string;
  osm_id?: string | number;
  place_id?: string | number;
  lat?: string | number;
  lon?: string | number;
  extratags?: Record<string, string>;
}) {
  const placeId = buildPlaceId(place);
  const displayName = place.display_name || "Unknown";
  const name = displayName.split(",")[0] || "Unknown";
  const lat = Number(place.lat);
  const lon = Number(place.lon);
  const extratags = place.extratags || {};
  const website =
    extratags.website ||
    extratags["contact:website"] ||
    extratags.url ||
    extratags["contact:url"] ||
    null;

  return {
    place_id: placeId,
    name,
    address: displayName,
    lat: Number.isNaN(lat) ? null : lat,
    lon: Number.isNaN(lon) ? null : lon,
    website,
    source: "osm" as const,
    google_place_id: null,
  };
}

const OVERPASS_TYPE_MAP: Record<
  string,
  {
    amenity?: string[];
    shop?: string[];
    tourism?: string[];
    leisure?: string[];
    office?: string[];
    craft?: string[];
    healthcare?: string[];
  }
> = {
  restaurant: { amenity: ["restaurant"] },
  cafe: { amenity: ["cafe"] },
  "coffee shop": { amenity: ["cafe"] },
  gym: { leisure: ["fitness_centre"] },
  salon: { shop: ["hairdresser", "beauty"] },
  barber: { shop: ["hairdresser"] },
  spa: { amenity: ["spa"] },
  hotel: { tourism: ["hotel"] },
  clinic: { healthcare: ["clinic"], amenity: ["clinic"] },
  dentist: { healthcare: ["dentist"], amenity: ["dentist"] },
  "grocery store": { shop: ["supermarket", "convenience", "greengrocer"] },
};

function buildOverpassQuery(bounds: GeoTile["bounds"], businessTypes: string[]) {
  const tagQueries: string[] = [];

  const addTagGroup = (key: string, values: string[]) => {
    if (values.length === 0) {
      return;
    }
    const regex = values.join("|");
    tagQueries.push(`node["${key}"~"${regex}"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});`);
    tagQueries.push(`way["${key}"~"${regex}"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});`);
    tagQueries.push(`relation["${key}"~"${regex}"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});`);
  };

  const normalized = businessTypes.map((type) => type.toLowerCase().trim());
  const collected = {
    amenity: new Set<string>(),
    shop: new Set<string>(),
    tourism: new Set<string>(),
    leisure: new Set<string>(),
    office: new Set<string>(),
    craft: new Set<string>(),
    healthcare: new Set<string>(),
  };

  for (const type of normalized) {
    const mapEntry = OVERPASS_TYPE_MAP[type];
    if (mapEntry) {
      mapEntry.amenity?.forEach((value) => collected.amenity.add(value));
      mapEntry.shop?.forEach((value) => collected.shop.add(value));
      mapEntry.tourism?.forEach((value) => collected.tourism.add(value));
      mapEntry.leisure?.forEach((value) => collected.leisure.add(value));
      mapEntry.office?.forEach((value) => collected.office.add(value));
      mapEntry.craft?.forEach((value) => collected.craft.add(value));
      mapEntry.healthcare?.forEach((value) => collected.healthcare.add(value));
    }
  }

  const hasSpecificTags =
    collected.amenity.size ||
    collected.shop.size ||
    collected.tourism.size ||
    collected.leisure.size ||
    collected.office.size ||
    collected.craft.size ||
    collected.healthcare.size;

  if (hasSpecificTags) {
    addTagGroup("amenity", Array.from(collected.amenity));
    addTagGroup("shop", Array.from(collected.shop));
    addTagGroup("tourism", Array.from(collected.tourism));
    addTagGroup("leisure", Array.from(collected.leisure));
    addTagGroup("office", Array.from(collected.office));
    addTagGroup("craft", Array.from(collected.craft));
    addTagGroup("healthcare", Array.from(collected.healthcare));
  } else {
    addTagGroup("amenity", ["*"]);
    addTagGroup("shop", ["*"]);
    addTagGroup("tourism", ["*"]);
    addTagGroup("office", ["*"]);
    addTagGroup("craft", ["*"]);
    addTagGroup("healthcare", ["*"]);
    addTagGroup("leisure", ["*"]);
  }

  return `[out:json][timeout:25];(${tagQueries.join("")});out center tags;`;
}

function formatOverpassAddress(tags: Record<string, string>) {
  const parts = [
    tags["addr:housenumber"],
    tags["addr:street"],
    tags["addr:city"],
    tags["addr:state"],
    tags["addr:postcode"],
    tags["addr:country"],
  ]
    .filter(Boolean)
    .join(" ");

  return parts || tags["addr:full"] || tags["addr:place"] || "Unknown";
}

function normalizeOverpassBusiness(element: {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}): BusinessResult | null {
  const tags = element.tags || {};
  const name = tags.name || tags.brand || "Unknown";
  const address = formatOverpassAddress(tags);
  const coordinates = element.center || { lat: element.lat, lon: element.lon };
  const lat = coordinates?.lat;
  const lon = coordinates?.lon;
  if (typeof lat !== "number" || typeof lon !== "number") {
    return null;
  }

  const website =
    tags.website ||
    tags["contact:website"] ||
    tags.url ||
    tags["contact:url"] ||
    null;

  return {
    place_id: `osm:${element.type}:${element.id}`,
    name,
    address,
    lat,
    lon,
    website,
    source: "osm" as const,
    google_place_id: null,
  };
}

async function fetchBusinessesFromOverpass(
  tile: GeoTile,
  businessTypes: string[],
  signal?: AbortSignal
): Promise<BusinessResult[]> {
  const query = buildOverpassQuery(tile.bounds, businessTypes);
  const elements = await fetchOverpass(query, signal);
  const results: BusinessResult[] = [];

  for (const element of elements) {
    const business = normalizeOverpassBusiness(element);
    if (business?.place_id) {
      results.push(business);
    }
  }

  return results;
}

const GOOGLE_PLACES_TYPE_MAP: Record<
  string,
  { type?: string; keyword?: string }
> = {
  restaurant: { type: "restaurant" },
  cafe: { type: "cafe" },
  "coffee shop": { type: "cafe", keyword: "coffee shop" },
  gym: { type: "gym" },
  salon: { keyword: "salon" },
  barber: { keyword: "barber" },
  spa: { type: "spa" },
  hotel: { type: "lodging" },
  clinic: { keyword: "clinic" },
  dentist: { type: "dentist" },
  "grocery store": { type: "supermarket" },
  business: { keyword: "business" },
};

function normalizeGooglePlace(place: GooglePlaceSummary): BusinessResult {
  return {
    place_id: `gplaces:${place.place_id}`,
    google_place_id: place.place_id,
    name: place.name,
    address: place.address,
    lat: place.lat,
    lon: place.lon,
    website: null,
    source: "google" as const,
  };
}

async function fetchBusinessesFromGooglePlaces(
  tile: GeoTile,
  businessTypes: string[],
  apiKey: string,
  signal?: AbortSignal
): Promise<BusinessResult[]> {
  if (signal?.aborted) {
    return [];
  }

  const centerLat = (tile.bounds.north + tile.bounds.south) / 2;
  const centerLon = (tile.bounds.east + tile.bounds.west) / 2;
  const latRadius = Math.abs(tile.bounds.north - tile.bounds.south) / 2;
  const lonRadius = Math.abs(tile.bounds.east - tile.bounds.west) / 2;
  const approxKm =
    Math.max(latRadius * 111.32, lonRadius * 111.32 * Math.cos((centerLat * Math.PI) / 180));
  const radiusMeters = Math.max(500, Math.min(50000, Math.round(approxKm * 1000)));

  const results: BusinessResult[] = [];
  const normalizedTypes = businessTypes.map((type) => type.toLowerCase().trim());
  const typesToQuery = normalizedTypes.length > 0 ? normalizedTypes : ["business"];

  for (const type of typesToQuery) {
    const mapEntry = GOOGLE_PLACES_TYPE_MAP[type] || { keyword: type };
    const places = await searchGooglePlacesNearby({
      apiKey,
      location: { lat: centerLat, lon: centerLon },
      radiusMeters,
      keyword: mapEntry.keyword,
      type: mapEntry.type,
    });

    for (const place of places) {
      results.push(normalizeGooglePlace(place));
    }
  }

  return results;
}

async function fetchBusinessesFromPhoton(
  tile: GeoTile,
  businessTypes: string[],
  signal?: AbortSignal
): Promise<BusinessResult[]> {
  const results: BusinessResult[] = [];
  const normalizedTypes = businessTypes.map((type) => type.toLowerCase().trim());
  const queries = normalizedTypes.length > 0 ? normalizedTypes : ["business"];

  for (const query of queries) {
    const places = await searchPhotonPlaces({
      query,
      bounds: tile.bounds,
      limit: PHOTON_MAX_RESULTS,
      rateLimitMs: PHOTON_RATE_LIMIT_MS,
      signal,
    });

    for (const place of places) {
      results.push({
        place_id: `osm:${place.osm_type}:${place.osm_id}`,
        name: place.name,
        address: place.address,
        lat: place.lat,
        lon: place.lon,
        website: null,
        source: "osm" as const,
        google_place_id: null,
      });
    }
  }

  return results;
}

async function fetchBusinessesForTile(
  businessType: string,
  tile: GeoTile,
  locationHint: string | null,
  signal?: AbortSignal
): Promise<BusinessResult[]> {
  const results: BusinessResult[] = [];
  let offset = 0;
  const query =
    locationHint && locationHint.trim().length > 0
      ? `${businessType} in ${locationHint}`
      : businessType;

  while (true) {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.append("q", query);
    url.searchParams.append("format", "json");
    url.searchParams.append("addressdetails", "1");
    url.searchParams.append("extratags", "1");
    url.searchParams.append("limit", String(MAX_PAGE_SIZE));
    url.searchParams.append("offset", String(offset));
    url.searchParams.append(
      "viewbox",
      `${tile.bounds.west},${tile.bounds.north},${tile.bounds.east},${tile.bounds.south}`
    );
    url.searchParams.append("bounded", "1");

    const data = await fetchNominatim(url, signal);
    if (data.length === 0) {
      break;
    }

    for (const place of data) {
      const business = normalizeBusiness(place);
      if (business.place_id) {
        results.push(business);
      }
    }

    if (data.length < MAX_PAGE_SIZE) {
      break;
    }

    offset += MAX_PAGE_SIZE;
  }

  return results;
}

async function resolveHasWebsite(
  business: BusinessResult,
  minoApiKey: string | undefined,
  googleApiKey: string | undefined
): Promise<boolean | null> {
  const cached = await getBusinessFromCache(business.place_id);

  if (cached && cached.has_website !== null && isDataFresh(cached.last_checked_at, 24)) {
    return cached.has_website;
  }

  if (business.website && business.website.trim().length > 0) {
    try {
      await updateBusiness(business.place_id, {
        has_website: true,
        last_checked_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error(`Failed to update has_website for ${business.place_id}:`, error);
    }
    return true;
  }

  if (googleApiKey) {
    let placeId = business.google_place_id;
    if (!placeId) {
      placeId = await findGooglePlaceId(
        `${business.name} ${business.address}`,
        googleApiKey
      );
    }
    if (placeId) {
      const website = await getGooglePlaceWebsite(placeId, googleApiKey);
      if (website !== null) {
        const hasWebsite = website.trim().length > 0;
        try {
          await updateBusiness(business.place_id, {
            has_website: hasWebsite,
            last_checked_at: new Date().toISOString(),
          });
        } catch (error) {
          console.error(
            `Failed to update has_website for ${business.place_id}:`,
            error
          );
        }
        return hasWebsite;
      }
    }
  }

  if (!cached) {
    const businessRecord: BusinessRecord = {
      name: business.name,
      place_id: business.place_id,
      has_website: null,
              last_checked_at: new Date().toISOString(),
            };

    try {
      await upsertBusiness(businessRecord);
    } catch (error) {
      console.error("Failed to cache business:", error);
    }
  }

  if (!minoApiKey) {
    return null;
  }

  const googleMapsUrl = buildGoogleMapsSearchUrl(
    business.name,
    business.address
  );
  let hasWebsite: boolean | null = null;
  for (let attempt = 0; attempt <= WEBSITE_CHECK_RETRIES; attempt += 1) {
    hasWebsite = await checkBusinessWebsite(
      googleMapsUrl,
      minoApiKey,
      MINO_API_TIMEOUT_MS
    );
    if (hasWebsite !== null) {
      break;
    }
    if (attempt < WEBSITE_CHECK_RETRIES) {
      await sleep(400 + attempt * 400);
    }
  }

  try {
    await updateBusiness(business.place_id, {
      has_website: hasWebsite,
      last_checked_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`Failed to update has_website for ${business.place_id}:`, error);
  }

  return hasWebsite;
}

async function processWithConcurrency<T>(
  items: T[],
  limit: number,
  handler: (item: T) => Promise<void>
) {
  const executing = new Set<Promise<void>>();

  for (const item of items) {
    const task = handler(item).finally(() => executing.delete(task));
    executing.add(task);

    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  await Promise.allSettled(executing);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, radiusKm: radiusKmRaw, startTileIndex } = body;

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "Prompt is required and must be a string" },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;

    const radiusKm = clamp(
      Number(radiusKmRaw || DEFAULT_RADIUS_KM),
      MIN_RADIUS_KM,
      MAX_RADIUS_KM
    );

    const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;
    const model = genAI?.getGenerativeModel({ model: "gemini-2.0-flash" });

    const extractionPrompt = `
Analyze the following user prompt and extract business types and location information.

User prompt: "${prompt}"

Extract the following information:
1. Business types: List all types of businesses mentioned (e.g., "restaurant", "coffee shop", "gym", "hotel", etc.)
2. Location: Extract any location information (city, state, country, address, neighborhood, etc.)

Return your response as a valid JSON object with this exact structure:
{
  "businessTypes": ["type1", "type2"],
  "location": "location string or null if not found"
}

If no business types are found, return an empty array: []
If no location is found, return null for location.

Only return the JSON object, no additional text or explanation.
`;

    let responseText = "";
    let usedGeminiMock = false;
    let geminiErrorMessage: string | null = null;

    try {
      if (!USE_GEMINI || GEMINI_FORCE_MOCK || !apiKey) {
        usedGeminiMock = true;
        const extractedTypes = extractBusinessTypesFromPrompt(prompt);
        const mockBusinessTypes =
          extractedTypes.length > 0 ? extractedTypes : ["restaurant"];
        const extractedLocation = extractLocationFromPrompt(prompt);
        const mockLocation = extractedLocation
          ? extractedLocation
              .split(" ")
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(" ")
          : null;

        responseText = JSON.stringify({
          businessTypes: mockBusinessTypes,
          location: mockLocation,
        });
      } else {
        const result = await model!.generateContent(extractionPrompt);
        const response = await result.response;
        responseText = response.text().trim();
      }
    } catch (geminiError) {
      console.error("Gemini API error:", geminiError);
      const errorMessage =
        geminiError instanceof Error
          ? geminiError.message
          : "Failed to process prompt with AI";
      geminiErrorMessage = errorMessage;

      const isQuotaZero =
        typeof errorMessage === "string" &&
        (errorMessage.includes("Quota exceeded") ||
          errorMessage.includes("quota") ||
          errorMessage.includes("generate_content_free_tier"));

      if (isQuotaZero) {
        usedGeminiMock = true;
        const fallbackLocation = extractLocationFromPrompt(prompt);
        responseText = JSON.stringify({
          businessTypes: ["restaurant"],
          location: fallbackLocation,
        });
      } else {
        return NextResponse.json(
          {
            error: "AI processing failed",
            message: errorMessage,
            suggestion:
              "Please check your API key and try again. If the issue persists, the AI service may be temporarily unavailable.",
          },
          { status: 500 }
        );
      }
    }

    let extractedData: { businessTypes: string[]; location: string | null } | null =
      null;
    try {
      extractedData = parseGeminiJson(responseText);
    } catch (parseError) {
      console.error("Gemini JSON parse error:", parseError);
    }

    if (!extractedData) {
      geminiErrorMessage =
        geminiErrorMessage || "Gemini response JSON could not be parsed.";
      const fallbackTypes = extractBusinessTypesFromPrompt(prompt);
      const fallbackLocation = extractLocationFromPrompt(prompt);
      extractedData = {
        businessTypes: fallbackTypes,
        location: fallbackLocation,
      };
    }

    if (
      !extractedData ||
      typeof extractedData !== "object" ||
      !Array.isArray(extractedData.businessTypes) ||
      (extractedData.location !== null &&
        typeof extractedData.location !== "string")
    ) {
      return NextResponse.json(
        {
          error: "Invalid data structure from AI",
          received: extractedData,
        },
        { status: 500 }
      );
    }

    if (!extractedData.location) {
      extractedData.location = extractLocationFromPrompt(prompt);
    }

    if (!extractedData.location) {
      return NextResponse.json(
        { error: "Location could not be extracted from the prompt." },
        { status: 400 }
      );
    }

    if (extractedData.businessTypes.length === 0) {
      extractedData.businessTypes = extractBusinessTypesFromPrompt(prompt);
    }

    if (extractedData.businessTypes.length === 0) {
      return NextResponse.json(
        { error: "No business types found in the prompt." },
        { status: 400 }
      );
    }

    const center = await geocodeLocation(extractedData.location, request.signal);
    if (!center) {
      return NextResponse.json(
        { error: "Unable to geocode the provided location." },
        { status: 400 }
      );
    }

    const tiles = buildTiles(
      center,
      radiusKm,
      TILE_SIZE_KM,
      TILE_OVERLAP_KM
    );
    const normalizedStart = Number.isFinite(Number(startTileIndex))
      ? Math.max(0, Math.floor(Number(startTileIndex)))
      : 0;
    const startIndex = Math.min(normalizedStart, Math.max(tiles.length - 1, 0));
    const endIndex = Math.min(startIndex + MAX_TILES_PER_REQUEST, tiles.length);
    const tilesBatch = tiles.slice(startIndex, endIndex);
    const minoApiKey = process.env.MINO_API_KEY;
    const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: string, payload: unknown) => {
          controller.enqueue(
            encoder.encode(
              `event: ${event}\n` +
                `data: ${JSON.stringify(payload)}\n\n`
            )
          );
        };

        const heartbeat = setInterval(() => {
          sendEvent("heartbeat", { ts: Date.now() });
        }, 10000);

        const seenPlaceIds = new Set<string>();
        let tilesSearched = 0;
        let businessesFound = 0;
        const startedAtMs = Date.now();

        try {
          sendEvent("metadata", {
            businessTypes: extractedData.businessTypes,
            location: extractedData.location,
            radiusKm,
            tileCount: tiles.length,
            startTileIndex: startIndex,
            batchTileCount: tilesBatch.length,
            maxTilesPerRequest: MAX_TILES_PER_REQUEST,
            center,
            mockUsed: usedGeminiMock,
            geminiErrorMessage,
            minoEnabled: !!minoApiKey,
            googlePlacesEnabled: !!googleApiKey,
            photonEnabled: true,
          });

          if (!minoApiKey && !googleApiKey) {
            sendEvent("error", {
              message:
                "MINO_API_KEY or GOOGLE_PLACES_API_KEY is required to verify websites. Add one to Vercel env vars and redeploy.",
            });
            return;
          }

          for (const tile of tilesBatch) {
            if (request.signal.aborted) {
              break;
            }

            sendEvent("tile", {
              id: tile.id,
              bounds: tile.bounds,
            });
            const tileBusinesses: BusinessResult[] = [];
            for (const businessType of extractedData.businessTypes) {
              const tileResults = await fetchBusinessesForTile(
                businessType,
                tile,
                extractedData.location,
                request.signal
              );
              tileBusinesses.push(...tileResults);
            }

            const fallbackResults = await fetchBusinessesFromOverpass(
              tile,
              extractedData.businessTypes,
              request.signal
            );
            tileBusinesses.push(...fallbackResults);

            const photonResults = await fetchBusinessesFromPhoton(
              tile,
              extractedData.businessTypes,
              request.signal
            );
            tileBusinesses.push(...photonResults);

            if (googleApiKey) {
              const googleResults = await fetchBusinessesFromGooglePlaces(
                tile,
                extractedData.businessTypes,
                googleApiKey,
                request.signal
              );
              tileBusinesses.push(...googleResults);
            }

            const uniqueTileBusinesses = tileBusinesses.filter((business) => {
              if (seenPlaceIds.has(business.place_id)) {
                return false;
              }
              seenPlaceIds.add(business.place_id);
              return true;
            });

            await processWithConcurrency(
              uniqueTileBusinesses,
              WEBSITE_CHECK_CONCURRENCY,
              async (business) => {
                const hasWebsite = await resolveHasWebsite(
                  business,
                  minoApiKey,
                  googleApiKey
                );

                if (hasWebsite === false) {
                  businessesFound += 1;
                  sendEvent("business", {
                    ...business,
                    has_website: hasWebsite,
                    website_status: "no_website",
                  });
                }
      }
            );

            tilesSearched += 1;
            sendEvent("progress", {
              tilesSearched: startIndex + tilesSearched,
              totalTiles: tiles.length,
              businessesFound,
              uniqueBusinesses: seenPlaceIds.size,
              elapsedMs: Date.now() - startedAtMs,
            });
          }

          const nextTileIndex = endIndex < tiles.length ? endIndex : null;
          sendEvent("done", {
            totalFound: businessesFound,
            tilesSearched: startIndex + tilesSearched,
            totalTiles: tiles.length,
            uniqueBusinesses: seenPlaceIds.size,
            elapsedMs: Date.now() - startedAtMs,
            hasMore: endIndex < tiles.length,
            nextTileIndex,
          });
        } catch (error) {
          console.error("Streaming error:", error);
          sendEvent("error", {
            message:
              error instanceof Error
                ? error.message
                : "Unexpected error while streaming results.",
          });
        } finally {
          clearInterval(heartbeat);
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("API Error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    return NextResponse.json(
      {
        error: "Internal server error",
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
