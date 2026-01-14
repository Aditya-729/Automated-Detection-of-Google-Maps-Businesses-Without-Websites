/**
 * DATABASE HELPER FUNCTIONS (lib/db-businesses.ts)
 * 
 * This file contains functions to interact with the "businesses" table in Supabase.
 * 
 * Database Concepts Explained:
 * 
 * 1. TABLE: A collection of related data (like a spreadsheet)
 *    - Our table is called "businesses"
 *    - It stores information about businesses we've found
 * 
 * 2. COLUMNS (Fields): The different types of data stored
 *    - name: Business name (text)
 *    - place_id: Unique ID from Google Places (text, used as identifier)
 *    - has_website: Whether business has a website (true/false)
 *    - last_checked_at: When we last checked this business (date/time)
 * 
 * 3. ROWS (Records): Individual entries in the table
 *    - Each row = one business
 *    - Example row: { name: "Starbucks", place_id: "ChIJ...", has_website: true, ... }
 * 
 * 4. CACHE: Storing data we've already fetched
 *    - Instead of calling Google Places API every time, we check the database first
 *    - If we have recent data, we use it (saves time and API costs)
 *    - If data is old or missing, we fetch fresh data from the API
 */

import { supabase } from "./supabase";

/**
 * Type definition for a business record in the database
 * 
 * This tells TypeScript what fields a business record should have
 */
export interface BusinessRecord {
  name: string;
  place_id: string;
  has_website: boolean | null; // null means we haven't checked yet
  last_checked_at: string | null; // ISO date string, or null if never checked
}

/**
 * Check if a business exists in the database (cache lookup)
 * 
 * This function:
 * 1. Searches the database for a business with the given place_id
 * 2. Returns the business record if found, or null if not found
 * 
 * Why check the database first?
 * - Saves API calls (Google Places API costs money per request)
 * - Faster responses (database is quicker than external API)
 * - Reduces rate limiting issues
 * 
 * @param placeId - The unique place_id from Google Places API
 * @returns Business record if found, null if not in database
 */
export async function getBusinessFromCache(
  placeId: string
): Promise<BusinessRecord | null> {
  try {
    /**
     * Supabase Query Explanation:
     * 
     * supabase.from("businesses")
     *   - Selects the "businesses" table
     * 
     * .select("*")
     *   - Selects all columns (fields) from the table
     *   - "*" means "everything"
     * 
     * .eq("place_id", placeId)
     *   - Filters to find rows where place_id equals the given placeId
     *   - .eq() means "equals"
     * 
     * .single()
     *   - Expects exactly one result (or null)
     *   - Throws error if multiple results found
     * 
     * This is equivalent to SQL: SELECT * FROM businesses WHERE place_id = 'xxx' LIMIT 1
     */
    const { data, error } = await supabase
      .from("businesses")
      .select("*")
      .eq("place_id", placeId)
      .single();

    // If there's an error (like record not found), return null
    if (error) {
      // "PGRST116" is Supabase's error code for "no rows returned"
      // This is normal - it just means the business isn't in our cache yet
      if (error.code === "PGRST116") {
        return null;
      }
      // For other errors, log and return null
      console.error("Error fetching business from cache:", error);
      return null;
    }

    return data as BusinessRecord;
  } catch (error) {
    console.error("Unexpected error in getBusinessFromCache:", error);
    return null;
  }
}

/**
 * Insert a new business record into the database
 * 
 * This function adds a new business to our cache.
 * 
 * Database Operations:
 * - INSERT: Adds a new row to the table
 * - This is like adding a new row to an Excel spreadsheet
 * 
 * @param business - The business data to insert
 */
export async function insertBusiness(
  business: BusinessRecord
): Promise<void> {
  try {
    /**
     * Supabase Insert Explanation:
     * 
     * supabase.from("businesses")
     *   - Selects the "businesses" table
     * 
     * .insert(business)
     *   - Inserts the business object as a new row
     *   - The object's properties become column values
     * 
     * This is equivalent to SQL: INSERT INTO businesses (name, place_id, ...) VALUES (...)
     */
    const { error } = await supabase.from("businesses").insert(business);

    if (error) {
      console.error("Error inserting business:", error);
      throw error;
    }
  } catch (error) {
    console.error("Unexpected error in insertBusiness:", error);
    throw error;
  }
}

/**
 * Update an existing business record in the database
 * 
 * This function updates a business that already exists in the cache.
 * 
 * Database Operations:
 * - UPDATE: Modifies an existing row
 * - We identify which row to update using place_id (unique identifier)
 * - Only the fields we provide get updated
 * 
 * @param placeId - The unique place_id to identify which business to update
 * @param updates - Object with fields to update (only include fields that changed)
 */
export async function updateBusiness(
  placeId: string,
  updates: Partial<BusinessRecord>
): Promise<void> {
  try {
    /**
     * Supabase Update Explanation:
     * 
     * supabase.from("businesses")
     *   - Selects the "businesses" table
     * 
     * .update(updates)
     *   - Updates the row with new values
     *   - Only updates the fields provided in the updates object
     * 
     * .eq("place_id", placeId)
     *   - Filters to find the row where place_id equals placeId
     *   - This identifies which row to update
     * 
     * This is equivalent to SQL: UPDATE businesses SET ... WHERE place_id = 'xxx'
     */
    const { error } = await supabase
      .from("businesses")
      .update(updates)
      .eq("place_id", placeId);

    if (error) {
      console.error("Error updating business:", error);
      throw error;
    }
  } catch (error) {
    console.error("Unexpected error in updateBusiness:", error);
    throw error;
  }
}

/**
 * Check if cached data is still fresh (less than 24 hours old)
 * 
 * This function determines if we should use cached data or fetch fresh data.
 * 
 * CACHE FRESHNESS LOGIC:
 * - Data is considered "fresh" if it was checked within the last 24 hours
 * - After 24 hours, data might be stale (business might have added/removed website)
 * - We re-check to ensure accuracy
 * 
 * @param lastCheckedAt - ISO date string of when data was last checked, or null
 * @param maxAgeHours - Maximum age in hours before data is considered stale (default: 24)
 * @returns true if data is fresh (less than maxAgeHours old), false otherwise
 */
export function isDataFresh(
  lastCheckedAt: string | null,
  maxAgeHours: number = 24
): boolean {
  // If never checked, data is not fresh
  if (!lastCheckedAt) {
    return false;
  }

  try {
    // Parse the ISO date string to a Date object
    const lastChecked = new Date(lastCheckedAt);
    const now = new Date();

    // Calculate the difference in milliseconds
    const diffMs = now.getTime() - lastChecked.getTime();

    // Convert to hours
    const diffHours = diffMs / (1000 * 60 * 60);

    // Data is fresh if checked within the last maxAgeHours
    return diffHours < maxAgeHours;
  } catch (error) {
    // If date parsing fails, consider data stale (better to re-check)
    console.error("Error parsing last_checked_at date:", error);
    return false;
  }
}

/**
 * Insert or update a business (upsert operation)
 * 
 * This function:
 * 1. Checks if business exists in database
 * 2. If exists: Updates it
 * 3. If not exists: Inserts it
 * 
 * This is called "upsert" (update + insert)
 * 
 * @param business - The business data to save
 */
export async function upsertBusiness(business: BusinessRecord): Promise<void> {
  try {
    // Check if business already exists
    const existing = await getBusinessFromCache(business.place_id);

    if (existing) {
      // Business exists - update it
      // We update last_checked_at to current time
      await updateBusiness(business.place_id, {
        name: business.name, // Update name in case it changed
        has_website: business.has_website,
        last_checked_at: new Date().toISOString(), // Current timestamp
      });
    } else {
      // Business doesn't exist - insert it
      // Set last_checked_at to current time for new records
      await insertBusiness({
        ...business,
        last_checked_at: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("Error in upsertBusiness:", error);
    throw error;
  }
}
