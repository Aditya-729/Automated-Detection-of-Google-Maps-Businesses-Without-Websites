/**
 * API ROUTE (app/api/run/route.ts)
 * 
 * This creates a backend API endpoint at: /api/run
 * 
 * In Next.js App Router:
 * - app/api/[name]/route.ts = API endpoint at /api/[name]
 * - Export functions named after HTTP methods (GET, POST, PUT, DELETE)
 * - This file handles POST requests to /api/run
 * 
 * This is a Server-side API route (runs on the server, not in browser)
 */

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  getBusinessFromCache,
  upsertBusiness,
  updateBusiness,
  isDataFresh,
  BusinessRecord,
} from "@/lib/db-businesses";
import {
  checkBusinessesWebsitesParallel,
  buildGoogleMapsUrl,
} from "@/lib/mino-api";

/**
 * PROTECTION CONSTANTS
 * 
 * These constants define limits to protect the system from:
 * - Resource exhaustion (too many API calls)
 * - Timeout issues (requests taking too long)
 * - Cost overruns (unlimited API usage)
 */

/**
 * MAX_BUSINESSES_LIMIT
 * 
 * WHY THIS PROTECTION EXISTS:
 * - Prevents processing too many businesses in a single request
 * - Limits API costs (each business = API calls to Google Places + Mino)
 * - Prevents timeouts (too many businesses = very long response time)
 * - Protects server resources (memory, CPU, database connections)
 * - Ensures reasonable response times for users
 * 
 * Example: If user searches "restaurants in New York", Google Places might return 100+ results
 * - Without limit: Process all 100 = 100+ API calls, 5+ minutes, high cost
 * - With limit: Process first 20 = 20 API calls, ~30 seconds, reasonable cost
 * 
 * Adjust this value based on your needs:
 * - Lower (10-20): Faster responses, lower costs, fewer results
 * - Higher (50-100): More results, slower responses, higher costs
 */
const MAX_BUSINESSES_LIMIT = 20;

/**
 * MINO_API_TIMEOUT_MS
 * 
 * WHY THIS PROTECTION EXISTS:
 * - Mino API uses browser automation which can be slow
 * - Some pages might take a long time to load or might hang
 * - Without timeout, a single slow request can block the entire response
 * - Prevents user from waiting indefinitely
 * - Allows partial results (some businesses checked, some timed out)
 * 
 * VERCEL TIMEOUT LIMITS:
 * - Vercel Hobby plan: 10 seconds maximum execution time
 * - Vercel Pro plan: 60 seconds maximum execution time
 * - If our function takes longer, Vercel will kill it
 * - We set Mino timeout to 8 seconds to stay under Vercel's 10s limit
 * - This leaves 2 seconds for other operations (Gemini, Google Places, database)
 * 
 * Example: If Mino takes 30 seconds per business and we check 10 in parallel:
 * - Without timeout: Could wait 30+ seconds if one hangs
 * - With timeout: Fails after 8 seconds, continues with other businesses
 * 
 * 8 seconds is reasonable for:
 * - Page load time
 * - Browser automation overhead
 * - Network latency
 * - Stays under Vercel's 10-second limit (Hobby plan)
 */
const MINO_API_TIMEOUT_MS = 8000; // 8 seconds (reduced for Vercel Hobby plan 10s limit)

/**
 * Type definition for a business result from Google Places API
 */
interface BusinessResult {
  name: string;
  address: string;
  place_id: string;
  has_website?: boolean | null; // Whether business has a website (from Mino API check)
}

/**
 * Search for businesses using Google Places API with caching
 * 
 * CACHE STRATEGY:
 * 1. Before calling Google Places API, check if we already have the business in our database
 * 2. If found in cache: Use cached data (saves API calls and time)
 * 3. If not found: Call Google Places API to get fresh data
 * 4. Save the result to database for future use
 * 
 * This function uses Google Places Text Search API to find businesses.
 * 
 * API Logic:
 * 1. For each business type, create a search query combining business type + location
 * 2. Use Text Search API which is ideal when you have:
 *    - Business type/keyword (e.g., "coffee shop", "restaurant")
 *    - Location (e.g., "New York", "San Francisco")
 * 3. Text Search is better than Nearby Search here because:
 *    - Nearby Search requires lat/lng coordinates
 *    - Text Search works with location names/addresses
 *    - Text Search can handle multiple keywords naturally
 * 
 * Alternative: Nearby Search would be used if we had coordinates:
 * - Requires: latitude, longitude, radius
 * - Better for: "Find restaurants within 1km of this location"
 * 
 * @param businessTypes - Array of business types to search for
 * @param location - Location string (city, address, etc.) or null
 * @param apiKey - Google Maps API key
 * @returns Array of business results with name, address, and place_id
 */
async function searchBusinesses(
  businessTypes: string[],
  location: string | null,
  apiKey: string
): Promise<BusinessResult[]> {
  // If no business types, return empty array
  if (!businessTypes || businessTypes.length === 0) {
    return [];
  }

  // If no location, we can't search effectively
  // Return empty array or you could search without location (less accurate)
  if (!location) {
    console.warn("No location provided, skipping business search");
    return [];
  }

  // Array to store all business results
  const allBusinesses: BusinessResult[] = [];

  // Search for each business type
  // We search separately for each type to get more specific results
  for (const businessType of businessTypes) {
    try {
      /**
       * Build the search query for Google Places Text Search
       * 
       * Query format: "business type in location"
       * Examples:
       * - "coffee shop in New York"
       * - "restaurant in San Francisco"
       * - "gym near Times Square"
       * 
       * The Text Search API is flexible and can handle various query formats
       */
      const query = `${businessType} in ${location}`;

      /**
       * Google Places API Text Search endpoint
       * 
       * Endpoint: https://maps.googleapis.com/maps/api/place/textsearch/json
       * 
       * Required parameters:
       * - query: The search query string
       * - key: Your Google Maps API key
       * 
       * Optional parameters:
       * - type: Filter by place type (restaurant, cafe, etc.)
       * - location: Bias results to a location (lat,lng)
       * - radius: Limit results within radius (in meters)
       * 
       * Response structure:
       * {
       *   "results": [
       *     {
       *       "name": "Business Name",
       *       "formatted_address": "Full Address",
       *       "place_id": "unique_place_id",
       *       ...
       *     }
       *   ],
       *   "status": "OK"
       * }
       */
      const apiUrl = new URL(
        "https://maps.googleapis.com/maps/api/place/textsearch/json"
      );
      apiUrl.searchParams.append("query", query);
      apiUrl.searchParams.append("key", apiKey);

      // Make the API request
      const response = await fetch(apiUrl.toString());

      /**
       * PROTECTION: Handle Google Places API Errors Gracefully
       * 
       * WHY THIS PROTECTION EXISTS:
       * - Google Places API can return various error statuses
       * - Some errors are recoverable (rate limit, temporary issues)
       * - Some errors are permanent (invalid API key, quota exceeded)
       * - We don't want one failed search to break the entire request
       * 
       * ERROR HANDLING STRATEGY:
       * - Continue processing other business types even if one fails
       * - Log the error for debugging
       * - Don't throw - allows partial results
       * 
       * Common errors:
       * - 429 (Too Many Requests): Rate limit hit, wait and retry
       * - 400 (Bad Request): Invalid parameters, skip this search
       * - 403 (Forbidden): API key issue, skip this search
       * - 500 (Server Error): Google's server issue, skip this search
       */
      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        console.error(
          `Google Places API error for "${businessType}":`,
          response.status,
          errorText
        );
        // Continue with next business type instead of failing entire request
        continue;
      }

      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        /**
         * PROTECTION: Handle JSON Parse Errors
         * 
         * WHY THIS PROTECTION EXISTS:
         * - API might return non-JSON response (HTML error page, plain text)
         * - Network issues might corrupt the response
         * - We don't want a parse error to crash the entire request
         * 
         * WHAT HAPPENS:
         * - Log the error
         * - Skip this business type
         * - Continue processing other business types
         */
        console.error(
          `Failed to parse Google Places API response for "${businessType}":`,
          parseError
        );
        continue;
      }

      /**
       * PROTECTION: Handle Google Places API Response Status
       * 
       * WHY THIS PROTECTION EXISTS:
       * - Google Places API returns status codes in the response body
       * - Different statuses require different handling
       * - Some statuses indicate errors that should be logged
       * - We want to handle all cases gracefully
       * 
       * STATUS HANDLING:
       * - "OK": Success, process results
       * - "ZERO_RESULTS": No results (normal, not an error)
       * - "OVER_QUERY_LIMIT": Quota exceeded (log warning, skip)
       * - "REQUEST_DENIED": Invalid API key (log error, skip)
       * - "INVALID_REQUEST": Bad parameters (log error, skip)
       * 
       * We continue processing even if one business type fails
       */
      if (data.status === "OK" && data.results && Array.isArray(data.results)) {
        // Process each result from the API
        for (const place of data.results) {
          const placeId = place.place_id || "";

          // CACHE CHECK: Before using API data, check if we have it in database
          // This saves API calls and speeds up responses
          let cachedBusiness = await getBusinessFromCache(placeId);

          if (cachedBusiness) {
            /**
             * BUSINESS FOUND IN CACHE
             * 
             * We already have this business in our database, so we use cached data.
             * This means:
             * - We don't need to save it again (already saved)
             * - Response is faster (no database write needed)
             * - We save API quota
             * 
             * Note: We still use the API data for address (in case it changed),
             * but we keep the cached name and other fields
             */
            allBusinesses.push({
              name: cachedBusiness.name,
              address: place.formatted_address || "Address not available",
              place_id: placeId,
            });
          } else {
            /**
             * BUSINESS NOT IN CACHE
             * 
             * This is a new business we haven't seen before.
             * We need to:
             * 1. Use the data from Google Places API
             * 2. Save it to our database for future use
             * 
             * Note: has_website is set to null initially (we haven't checked yet)
             * You can add logic later to check if a business has a website
             */
            const businessData: BusinessRecord = {
              name: place.name || "Unknown",
              place_id: placeId,
              has_website: null, // We'll check this later if needed
              last_checked_at: new Date().toISOString(),
            };

            // Save to database (cache it for next time)
            try {
              await upsertBusiness(businessData);
            } catch (dbError) {
              // If database save fails, we still return the business
              // (don't fail the whole request because of cache issue)
              console.error("Failed to cache business:", dbError);
            }

            // Add to results
            allBusinesses.push({
              name: businessData.name,
              address: place.formatted_address || "Address not available",
              place_id: placeId,
            });
          }
        }
      } else if (data.status === "ZERO_RESULTS") {
        // No results found for this business type - this is normal, just continue
        console.log(`No results found for "${businessType}" in ${location}`);
      } else {
        /**
         * PROTECTION: Handle Non-OK API Status Codes
         * 
         * WHY THIS PROTECTION EXISTS:
         * - API returned an error status (OVER_QUERY_LIMIT, REQUEST_DENIED, etc.)
         * - We log the error but don't fail the entire request
         * - Allows partial results (some business types succeed, some fail)
         * 
         * WHAT HAPPENS:
         * - Log error with status and message
         * - Continue processing other business types
         * - User still gets results from successful searches
         */
        console.error(
          `Google Places API error for "${businessType}":`,
          data.status,
          data.error_message || ""
        );
        // Continue with next business type - don't fail entire request
      }
    } catch (error) {
      // Handle network errors or other exceptions
      console.error(`Error searching for "${businessType}":`, error);
      // Continue with next business type even if one fails
    }
  }

  // Remove duplicates based on place_id
  // Same business might appear in multiple searches
  const uniqueBusinesses = Array.from(
    new Map(allBusinesses.map((b) => [b.place_id, b])).values()
  );

  return uniqueBusinesses;
}

/**
 * POST handler function
 * 
 * This function:
 * 1. Receives user prompt from frontend
 * 2. Sends it to Gemini API to extract business types and location
 * 3. Returns structured JSON response
 * 
 * @param request - The incoming HTTP request object
 * @returns NextResponse with structured JSON data
 */
/**
 * VERCEL DEPLOYMENT NOTE:
 * 
 * This function runs as a "serverless function" on Vercel.
 * 
 * What does that mean?
 * - Vercel creates a temporary server just for this request
 * - After the request completes, the server is destroyed
 * - This is efficient and cost-effective
 * 
 * Important limits:
 * - Hobby plan: 10 seconds maximum execution time
 * - Pro plan: 60 seconds maximum execution time
 * - If we exceed the limit, Vercel will kill the function
 * - That's why we have timeouts and limits in place
 * 
 * Our protections:
 * - MAX_BUSINESSES_LIMIT: Limits how many businesses we process
 * - MINO_API_TIMEOUT_MS: Limits how long each Mino call can take
 * - These ensure we stay under Vercel's time limits
 */
export async function POST(request: NextRequest) {
  try {
    // Parse the JSON body from the request
    // The frontend will send { prompt: "user's text" }
    const body = await request.json();
    const { prompt } = body;

    // Validate that prompt exists
    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "Prompt is required and must be a string" },
        { status: 400 } // 400 = Bad Request
      );
    }

    // Get API key from environment variables
    // In Next.js, environment variables are accessed via process.env
    // Make sure to set GEMINI_API_KEY in your .env.local file
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("GEMINI_API_KEY is not set in environment variables");
      return NextResponse.json(
        { error: "API key not configured" },
        { status: 500 }
      );
    }

    // Initialize Gemini AI client
    // GoogleGenerativeAI is the main class from the SDK
    const genAI = new GoogleGenerativeAI(apiKey);

    // Get the Gemini Pro model
    // You can use different models: gemini-pro, gemini-pro-vision, etc.
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    /**
     * Create a prompt for Gemini to extract business information
     * 
     * We're using a structured prompt that asks Gemini to:
     * 1. Extract business types from the user's text
     * 2. Extract location information
     * 3. Return the result as valid JSON
     */
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

    /**
     * PROTECTION: Handle Gemini API Errors Gracefully
     * 
     * WHY THIS PROTECTION EXISTS:
     * - Gemini API can fail for various reasons (rate limits, quota, network)
     * - API might return errors or malformed responses
     * - We want to provide helpful error messages to users
     * - Don't want API errors to crash the entire request
     */
    let result;
    let response;
    let responseText;

    try {
      // Send the prompt to Gemini and get response
      // generateContent() sends the prompt and returns a response object
      result = await model.generateContent(extractionPrompt);
      response = await result.response;

      // Get the text content from Gemini's response
      responseText = response.text().trim();
    } catch (geminiError) {
      /**
       * PROTECTION: Catch Gemini API Errors
       * 
       * WHY THIS PROTECTION EXISTS:
       * - Network errors (no connection to Gemini API)
       * - Rate limit errors (too many requests)
       * - Quota errors (API quota exceeded)
       * - Invalid API key errors
       * - Other API errors
       * 
       * ERROR HANDLING:
       * - Log the error for debugging
       * - Return user-friendly error message
       * - Include error details in response
       */
      console.error("Gemini API error:", geminiError);
      const errorMessage =
        geminiError instanceof Error
          ? geminiError.message
          : "Failed to process prompt with AI";

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

    // Parse the JSON response from Gemini
    // Gemini should return valid JSON, but we need to handle potential parsing errors
    let extractedData;
    try {
      // Sometimes Gemini wraps JSON in markdown code blocks, so we clean it
      const cleanedText = responseText
        .replace(/```json\n?/g, "") // Remove ```json
        .replace(/```\n?/g, "") // Remove ```
        .trim();

      extractedData = JSON.parse(cleanedText);
    } catch (parseError) {
      // If JSON parsing fails, return the raw response for debugging
      console.error("Failed to parse Gemini response as JSON:", responseText);
      return NextResponse.json(
        {
          error: "Failed to parse AI response",
          rawResponse: responseText,
        },
        { status: 500 }
      );
    }

    // Validate the extracted data structure
    // Ensure it has the expected format
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

    // Get Google Maps API key from environment variables
    const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!googleMapsApiKey) {
      console.error("GOOGLE_MAPS_API_KEY is not set in environment variables");
      return NextResponse.json(
        { error: "Google Maps API key not configured" },
        { status: 500 }
      );
    }

    // Search for businesses using Google Places API
    // We'll search for each business type in the location
    let businesses = await searchBusinesses(
      extractedData.businessTypes,
      extractedData.location,
      googleMapsApiKey
    );

    /**
     * PROTECTION: Limit Maximum Businesses Processed
     * 
     * WHY THIS PROTECTION EXISTS:
     * - Prevents processing too many businesses in one request
     * - Limits API costs (each business requires multiple API calls)
     * - Ensures reasonable response times
     * - Protects server resources
     * 
     * WHAT HAPPENS:
     * - If businesses.length > MAX_BUSINESSES_LIMIT, we only process the first N
     * - We log a warning so you know results were truncated
     * - User still gets results, just limited to the first MAX_BUSINESSES_LIMIT
     * 
     * Example:
     * - Google Places returns 50 businesses
     * - MAX_BUSINESSES_LIMIT = 20
     * - We process first 20, log warning, return 20 results
     */
    const originalCount = businesses.length;
    if (businesses.length > MAX_BUSINESSES_LIMIT) {
      console.warn(
        `Business limit exceeded: Found ${businesses.length} businesses, limiting to ${MAX_BUSINESSES_LIMIT}`
      );
      businesses = businesses.slice(0, MAX_BUSINESSES_LIMIT);
    }

    /**
     * WEBSITE CHECKING DECISION LOGIC
     * 
     * For each business, we decide whether to use cache or check via Mino API:
     * 
     * DECISION FLOW:
     * 1. Check if business exists in Supabase database
     * 2. If exists:
     *    a. Check if last_checked_at is less than 24 hours ago
     *    b. If YES (data is fresh) → Use cached has_website value
     *    c. If NO (data is stale) → Re-check via Mino API
     * 3. If not exists:
     *    → Check via Mino API (new business)
     * 4. Save result back to Supabase (update last_checked_at)
     * 
     * WHY 24 HOURS?
     * - Businesses might add/remove websites over time
     * - 24 hours balances freshness vs API costs
     * - You can adjust this threshold if needed
     */
    const businessesToCheck: Array<{ place_id: string; googleMapsUrl: string }> =
      [];
    const websiteResults = new Map<string, boolean>();

    // Get Mino API key for website checking
    const minoApiKey = process.env.MINO_API_KEY;

    if (minoApiKey && businesses.length > 0) {
      // Process each business to decide: use cache or check via Mino
      for (const business of businesses) {
        // Step 1: Check if business exists in database
        const cached = await getBusinessFromCache(business.place_id);

        if (cached) {
          /**
           * BUSINESS EXISTS IN DATABASE
           * 
           * Now we need to decide: use cache or re-check?
           * 
           * Decision criteria:
           * - has_website must not be null (we must have checked it before)
           * - last_checked_at must be less than 24 hours ago (data is fresh)
           * 
           * If both conditions are true → USE CACHE
           * Otherwise → RE-CHECK via Mino API
           */
          const hasWebsiteValue = cached.has_website !== null;
          const isFresh = isDataFresh(cached.last_checked_at, 24);

          if (hasWebsiteValue && isFresh) {
            /**
             * USE CACHE
             * 
             * Conditions met:
             * ✓ Business exists in database
             * ✓ has_website is set (not null)
             * ✓ last_checked_at is less than 24 hours ago
             * 
             * Action: Use cached value, skip Mino API call
             * Benefit: Saves API costs and time
             */
            websiteResults.set(business.place_id, cached.has_website);
          } else {
            /**
             * RE-CHECK VIA MINO API
             * 
             * Why re-check?
             * - has_website is null (never checked before), OR
             * - last_checked_at is more than 24 hours ago (data is stale)
             * 
             * Action: Add to checking list, will check via Mino API
             * Result: Fresh data will be saved back to database
             */
            businessesToCheck.push({
              place_id: business.place_id,
              googleMapsUrl: buildGoogleMapsUrl(business.place_id),
            });
          }
        } else {
          /**
           * BUSINESS NOT IN DATABASE
           * 
           * This is a new business we haven't seen before.
           * 
           * Action: Check via Mino API
           * Result: Will be saved to database after checking
           */
          businessesToCheck.push({
            place_id: business.place_id,
            googleMapsUrl: buildGoogleMapsUrl(business.place_id),
          });
        }
      }

      // Check websites in parallel for businesses that need checking
      if (businessesToCheck.length > 0) {
        /**
         * PARALLEL WEBSITE CHECKING VIA MINO API
         * 
         * These businesses need checking because:
         * - They don't exist in database, OR
         * - They exist but data is stale (>24 hours old), OR
         * - They exist but has_website is null (never checked)
         * 
         * checkBusinessesWebsitesParallel() checks multiple businesses at the same time
         * This is much faster than checking them one by one
         * 
         * PROTECTION: Includes timeout protection
         * - Each Mino API call has a timeout (15 seconds default)
         * - Prevents hanging requests from blocking the response
         * - Failed/timeout checks don't prevent successful checks
         * 
         * Example:
         * - Sequential: Check 5 businesses = 5 × 3 seconds = 15 seconds
         * - Parallel: Check 5 businesses = ~3 seconds (all at once)
         * - With timeout: Slow request times out after 15s, others continue
         */
        const newWebsiteResults = await checkBusinessesWebsitesParallel(
          businessesToCheck,
          minoApiKey,
          MINO_API_TIMEOUT_MS
        );

        /**
         * SAVE RESULTS BACK TO SUPABASE
         * 
         * For each business we just checked:
         * 1. Store the result (has_website: true/false)
         * 2. Update database with:
         *    - has_website: The result from Mino API
         *    - last_checked_at: Current timestamp (marks data as fresh)
         * 
         * This ensures:
         * - Next time we see this business, we'll use cache (if <24h old)
         * - Database always has the latest checked timestamp
         * - We can track when data was last verified
         */
        for (const [placeId, hasWebsite] of newWebsiteResults.entries()) {
          // Store result for response
          websiteResults.set(placeId, hasWebsite);

          // Save result back to Supabase
          try {
            await updateBusiness(placeId, {
              has_website: hasWebsite,
              last_checked_at: new Date().toISOString(), // Mark as fresh
            });
          } catch (dbError) {
            // Log error but don't fail the request
            // The result is still returned to user, just not cached
            console.error(
              `Failed to update has_website for ${placeId}:`,
              dbError
            );
          }
        }
      }
    }

    // Add has_website to each business result
    const businessesWithWebsite = businesses.map((business) => ({
      ...business,
      has_website: websiteResults.get(business.place_id) ?? null,
    }));

    /**
     * FORMAT FINAL API RESPONSE
     * 
     * Calculate statistics and format response for frontend:
     * 1. Total businesses found
     * 2. Count of businesses without website
     * 3. List of businesses without website (name + address only)
     */
    const totalBusinesses = businessesWithWebsite.length;

    // Filter businesses that don't have a website
    // has_website === false means we checked and confirmed no website
    // has_website === null means we haven't checked yet (exclude from count)
    const businessesWithoutWebsite = businessesWithWebsite.filter(
      (business) => business.has_website === false
    );

    const countWithoutWebsite = businessesWithoutWebsite.length;

    // Format list of businesses without website (only name and address)
    const businessesWithoutWebsiteList = businessesWithoutWebsite.map(
      (business) => ({
        name: business.name,
        address: business.address,
      })
    );

    /**
     * FINAL RESPONSE STRUCTURE
     * 
     * Clean JSON format for frontend consumption:
     * - summary: Statistics about the search results
     * - businesses: Full list of all businesses (for reference)
     * - businessesWithoutWebsite: Filtered list (name + address only)
     * - metadata: Additional info about the request
     */
    return NextResponse.json({
      success: true,
      summary: {
        totalBusinesses: totalBusinesses,
        countWithoutWebsite: countWithoutWebsite,
      },
      businessesWithoutWebsite: businessesWithoutWebsiteList,
      allBusinesses: businessesWithWebsite, // Full list for reference
      metadata: {
        businessTypes: extractedData.businessTypes,
        location: extractedData.location,
        originalPrompt: prompt,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    // Handle any errors that occur
    console.error("API Error:", error);

    // Return a more specific error message if possible
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    return NextResponse.json(
      {
        error: "Internal server error",
        message: errorMessage,
      },
      { status: 500 } // 500 = Internal Server Error
    );
  }
}
