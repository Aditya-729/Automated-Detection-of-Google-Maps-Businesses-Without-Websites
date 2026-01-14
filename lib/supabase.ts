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
 * They are NOT read from .env.local files in production.
 * 
 * What to do:
 * 1. Go to your Vercel project dashboard
 * 2. Go to Settings → Environment Variables
 * 3. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
 * 4. Redeploy your app
 * 
 * Why NEXT_PUBLIC_ prefix?
 * - Variables with NEXT_PUBLIC_ are available in the browser
 * - Variables without it are only available on the server
 * - Supabase client can work in both places, so we use NEXT_PUBLIC_
 */
// Validate that environment variables are set
if (!supabaseUrl || !supabaseAnonKey) {
  // On Vercel, this error will show in the build logs
  // Make sure to set these in Vercel dashboard → Settings → Environment Variables
  throw new Error(
    "Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your Vercel project settings (or .env.local for local development)"
  );
}

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
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
