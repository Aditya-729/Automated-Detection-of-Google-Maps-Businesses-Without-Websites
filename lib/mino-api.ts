/**
 * MINO API HELPER (lib/mino-api.ts)
 * 
 * This file contains functions to interact with Mino API.
 * 
 * What is Mino API?
 * - Mino is a browser automation API that can visit websites and extract information
 * - It uses "browser agents" - automated browsers that can navigate and read web pages
 * - Perfect for checking if a business has a website by visiting their Google Maps page
 * 
 * How it works:
 * 1. We give Mino a Google Maps business URL
 * 2. Mino's browser agent visits the page
 * 3. The agent looks for a website link on the page
 * 4. Returns true if website found, false if not
 * 
 * Parallel Processing:
 * - We can check multiple businesses at the same time
 * - This is faster than checking one at a time
 * - Uses Promise.all() to run multiple checks simultaneously
 */

/**
 * Check if a business has a website using Mino API
 * 
 * This function:
 * 1. Takes a Google Maps business URL
 * 2. Sends it to Mino API with instructions to check for a website
 * 3. Mino's browser agent visits the page and looks for a website link
 * 4. Returns true if website found, false if not
 * 
 * PROTECTION: Includes timeout to prevent hanging requests
 * 
 * @param googleMapsUrl - The Google Maps URL for the business
 * @param apiKey - Mino API key from environment variables
 * @param timeoutMs - Timeout in milliseconds (default: 15000 = 15 seconds)
 * @returns true if business has a website, false if not (or on error/timeout)
 */
export async function checkBusinessWebsite(
  googleMapsUrl: string,
  apiKey: string,
  timeoutMs: number = 15000
): Promise<boolean | null> {
  /**
   * PROTECTION: Timeout for Mino API Calls
   * 
   * WHY THIS PROTECTION EXISTS:
   * - Mino API uses browser automation which can be slow or hang
   * - Some pages might take a very long time to load
   * - Without timeout, a single slow request can block the entire response
   * - Prevents user from waiting indefinitely
   * - Allows partial results (some businesses checked, some timed out)
   * 
   * HOW IT WORKS:
   * - AbortController creates a signal that can cancel the request
   * - setTimeout triggers after timeoutMs milliseconds
   * - If timeout triggers, we abort the fetch request
   * - This prevents the request from hanging forever
   * 
   * Example:
   * - Normal request: Completes in 5 seconds → Returns result
   * - Slow request: Takes 20 seconds → Times out after 15 seconds → Returns false
   * - Hanging request: Never completes → Times out after 15 seconds → Returns false
   */
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(); // Cancel the request after timeout
  }, timeoutMs);

  try {
    /**
     * Mino API Request with Timeout Protection
     * 
     * Endpoint: https://mino.ai/v1/automation/run-sse
     * 
     * Request Body:
     * - url: The Google Maps URL to visit
     * - goal: Instructions for the browser agent (what to look for)
     * 
     * Headers:
     * - X-API-Key: Your Mino API key
     * - Content-Type: application/json
     * 
     * Signal:
     * - AbortController signal allows cancellation on timeout
     * 
     * The browser agent will:
     * 1. Visit the Google Maps page
     * 2. Look for a website link (usually in the business info section)
     * 3. Return true if found, false if not found
     */
    const response = await fetch("https://mino.ai/v1/automation/run-sse", {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: googleMapsUrl,
        goal: "Check if this business has a website. Look for a website link on the Google Maps page. Return true if a website link is found, false if not found. Return your answer as a JSON object with a 'has_website' boolean field.",
      }),
      signal: controller.signal, // Enable timeout cancellation
    });

    /**
     * PROTECTION: Handle Mino API HTTP Errors Gracefully
     * 
     * WHY THIS PROTECTION EXISTS:
     * - API might return error status (400, 500, etc.)
     * - Rate limiting might return 429
     * - Invalid API key might return 401
     * - We don't want API errors to crash the entire request
     * 
     * ERROR HANDLING STRATEGY:
     * - Log the error for debugging
     * - Return false (assume no website) instead of throwing
     * - Allows other businesses to still be checked
     */
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      // Clear timeout since request completed
      clearTimeout(timeoutId);
      console.error(
        `Mino API error: ${response.status} ${response.statusText}`,
        errorText
      );
      return null; // Unknown on error
    }

    let data;
    try {
      const rawText = await response.text();
      try {
        data = JSON.parse(rawText);
      } catch (parseError) {
        /**
         * PROTECTION: Handle JSON Parse Errors (SSE-safe)
         *
         * WHY THIS PROTECTION EXISTS:
         * - Mino may return Server-Sent Events (lines starting with "data:")
         * - We extract the last JSON payload if present
         */
        const lastDataLine = rawText
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.startsWith("data:"))
          .pop();

        if (lastDataLine) {
          const payload = lastDataLine.replace(/^data:\s*/, "");
          try {
            data = JSON.parse(payload);
          } catch (sseParseError) {
            console.error(
              "Failed to parse Mino SSE JSON payload:",
              sseParseError
            );
            return null;
          }
        } else {
          console.error("Failed to parse Mino API response:", parseError);
          return null;
        }
      }
    } finally {
      // Clear timeout after body is fully processed
      clearTimeout(timeoutId);
    }

    /**
     * Parse Mino API Response
     * 
     * Mino returns the result in resultJson field
     * Expected format: { has_website: true/false }
     * 
     * We extract the has_website boolean value
     */
    const hasWebsite = data.resultJson?.has_website;

    // Validate that we got a boolean value
    if (typeof hasWebsite === "boolean") {
      return hasWebsite;
    }

    // If response format is unexpected, return unknown
    console.warn("Unexpected response format from Mino API:", data);
    return null;
  } catch (error) {
    // Clear timeout in case of error
    clearTimeout(timeoutId);

    /**
     * PROTECTION: Handle All Errors and Timeouts Gracefully
     * 
     * WHY THIS PROTECTION EXISTS:
     * - Network errors (no internet, connection lost)
     * - Timeout errors (request took too long)
     * - Abort errors (request was cancelled)
     * - Other unexpected errors
     * 
     * ERROR HANDLING STRATEGY:
     * - Check if error is a timeout/abort
     * - Log appropriate message
     * - Return false (assume no website) instead of throwing
     * - Allows other businesses to still be checked
     * 
     * WHAT HAPPENS:
     * - User still gets results for businesses that succeeded
     * - Failed checks don't break the entire request
     * - Errors are logged for debugging
     */
    if (error instanceof Error && error.name === "AbortError") {
      // Request was aborted due to timeout
      console.warn(
        `Mino API timeout for ${googleMapsUrl} (exceeded ${timeoutMs}ms)`
      );
    } else {
      // Other errors (network, etc.)
      console.error("Error checking website with Mino API:", error);
    }
    return null; // Unknown on error/timeout
  }
}

/**
 * Check multiple businesses for websites in parallel
 * 
 * PARALLEL PROCESSING EXPLAINED:
 * - Instead of checking businesses one by one (slow)
 * - We check them all at the same time (fast)
 * - Uses Promise.allSettled() to handle errors gracefully
 * 
 * Example:
 * - Sequential (slow): Check business 1 (5s) → Check business 2 (5s) → Total: 10s
 * - Parallel (fast): Check business 1 & 2 at same time → Total: 5s
 * 
 * PROTECTION: Uses Promise.allSettled() instead of Promise.all()
 * - Promise.all() fails if ANY promise fails
 * - Promise.allSettled() waits for ALL promises (success or failure)
 * - This allows partial results even if some checks fail
 * 
 * @param businesses - Array of objects with place_id and googleMapsUrl
 * @param apiKey - Mino API key
 * @param timeoutMs - Timeout in milliseconds for each check
 * @returns Map of place_id to has_website boolean
 */
export async function checkBusinessesWebsitesParallel(
  businesses: Array<{ place_id: string; googleMapsUrl: string }>,
  apiKey: string,
  timeoutMs: number = 15000
): Promise<Map<string, boolean | null>> {
  /**
   * PROTECTION: Use Promise.allSettled() for Error Resilience
   * 
   * WHY THIS PROTECTION EXISTS:
   * - If we use Promise.all(), one failed check stops all checks
   * - With Promise.allSettled(), each check is independent
   * - Failed checks don't prevent successful checks from completing
   * - User gets partial results instead of complete failure
   * 
   * Example:
   * - Check 10 businesses in parallel
   * - 8 succeed, 2 fail (timeout or error)
   * - With Promise.all(): All 10 fail, no results
   * - With Promise.allSettled(): 8 succeed, 2 fail, user gets 8 results
   * 
   * Create an array of promises
   * Each promise checks one business's website
   * They run in parallel (at the same time), not sequentially (one after another)
   */
  const checkPromises = businesses.map(async (business) => {
    try {
      const hasWebsite = await checkBusinessWebsite(
        business.googleMapsUrl,
        apiKey,
        timeoutMs
      );
      return {
        status: "fulfilled" as const,
        place_id: business.place_id,
        has_website: hasWebsite,
      };
    } catch (error) {
      /**
       * PROTECTION: Catch Individual Check Errors
       * 
       * WHY THIS PROTECTION EXISTS:
       * - Even though checkBusinessWebsite handles errors internally
       * - We add an extra layer of protection here
       * - Ensures one failed check doesn't break others
       */
      console.error(
        `Error checking website for ${business.place_id}:`,
        error
      );
      return {
        status: "rejected" as const,
        place_id: business.place_id,
        has_website: null, // Unknown on error
      };
    }
  });

  /**
   * Wait for all checks to complete (they run in parallel)
   * Promise.allSettled() waits for ALL promises, even if some fail
   * This is different from Promise.all() which fails if ANY promise fails
   */
  const results = await Promise.allSettled(checkPromises);

  /**
   * Process results from Promise.allSettled()
   * 
   * Each result is either:
   * - { status: "fulfilled", value: { place_id, has_website } }
   * - { status: "rejected", reason: Error }
   * 
   * We handle both cases gracefully
   */
  const websiteMap = new Map<string, boolean | null>();
  for (const result of results) {
    if (result.status === "fulfilled") {
      // Check succeeded, use the result
      websiteMap.set(result.value.place_id, result.value.has_website);
    } else {
      /**
       * PROTECTION: Handle Rejected Promises
       * 
       * WHY THIS PROTECTION EXISTS:
       * - Even with all our error handling, promises can still reject
       * - We want to handle these gracefully
       * - Default to false (no website) for failed checks
       * 
       * Note: This should rarely happen since checkBusinessWebsite
       * catches errors internally, but it's good to be safe
       */
      console.error("Promise rejected:", result.reason);
      // Don't add to map - will default to null/undefined
      // This means the business won't have has_website set
    }
  }

  return websiteMap;
}

/**
 * Build Google Maps URL from place_id
 * 
 * Google Maps URLs follow this format:
 * https://www.google.com/maps/place/?q=place_id:PLACE_ID
 * 
 * @param placeId - The Google place_id (if you have it)
 * @returns Google Maps URL for the business
 */
export function buildGoogleMapsUrl(placeId: string): string {
  return `https://www.google.com/maps/place/?q=place_id:${placeId}`;
}

/**
 * Build a Google Maps search URL from a name + address
 *
 * WHY THIS EXISTS:
 * - OpenStreetMap results don't include Google place_id
 * - Mino can still use a Google Maps search URL to find the business
 * - This works without a Google Maps API key
 *
 * @param name - Business name
 * @param address - Business address
 * @returns Google Maps search URL
 */
export function buildGoogleMapsSearchUrl(name: string, address: string): string {
  const query = encodeURIComponent(`${name} ${address}`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}
