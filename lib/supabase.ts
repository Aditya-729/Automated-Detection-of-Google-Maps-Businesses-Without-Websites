/**
 * SUPABASE CLIENT (lib/supabase.ts)
 * 
 * This file creates a connection to your Supabase database.
 * 
 * What is Supabase?
 * - Supabase is a database service (like Firebase, but uses PostgreSQL)
 * - It provides a REST API and client library to interact with your database
 * - Think of it as a cloud-hosted database that you can access from your app
 * 
 * Database Basics:
 * - A database stores data in "tables" (like Excel spreadsheets)
 * - Each table has "columns" (fields) and "rows" (records)
 * - Example: A "businesses" table might have columns: name, place_id, has_website
 * 
 * This file creates a "client" - a tool that lets your code talk to the database
 */

import { createClient } from "@supabase/supabase-js";

/**
 * Get Supabase URL and API key from environment variables
 * 
 * These are like passwords/addresses for your database
 * - SUPABASE_URL: The address of your database (like a website URL)
 * - SUPABASE_ANON_KEY: A key that allows your app to read/write data
 * 
 * You'll get these from your Supabase project dashboard
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * VERCEL DEPLOYMENT NOTE:
 *
 * On Vercel, environment variables are set in the Vercel dashboard.
 * They are NOT read from `.env.local` files in production.
 *
 * IMPORTANT CHANGE (minimal, for safer deployments):
 * - We do NOT throw an error at import-time anymore.
 * - If Supabase env vars are missing, we simply disable caching.
 *
 * Why this protection exists:
 * - Throwing here can crash your whole API route on Vercel if you forgot to set vars.
 * - Disabling caching is safer than crashing the app.
 *
 * What to do (if you want caching enabled):
 * 1. Go to your Vercel project dashboard
 * 2. Settings → Environment Variables
 * 3. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
 * 4. Redeploy your app
 */

/**
 * Create and export the Supabase client
 * 
 * This client is used throughout your app to:
 * - Read data from the database (SELECT queries)
 * - Insert new records (INSERT queries)
 * - Update existing records (UPDATE queries)
 * - Delete records (DELETE queries)
 * 
 * Think of it as a helper that translates your JavaScript code into database commands
 */
/**
 * Create the Supabase client only when env vars are present.
 *
 * If env vars are missing:
 * - supabase will be null
 * - Database caching functions will safely no-op / return null
 */
export const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;
