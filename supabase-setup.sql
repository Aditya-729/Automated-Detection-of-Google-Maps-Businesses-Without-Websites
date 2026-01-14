/**
 * SUPABASE TABLE SETUP (supabase-setup.sql)
 * 
 * This file contains SQL commands to create the "businesses" table in Supabase.
 * 
 * WHAT IS SQL?
 * - SQL (Structured Query Language) is the language used to talk to databases
 * - It's like giving instructions to the database: "create a table", "get this data", etc.
 * 
 * HOW TO USE THIS FILE:
 * 1. Go to your Supabase project dashboard
 * 2. Click on "SQL Editor" in the left sidebar
 * 3. Click "New Query"
 * 4. Copy and paste the SQL below
 * 5. Click "Run" to execute
 * 
 * TABLE STRUCTURE EXPLAINED:
 * 
 * CREATE TABLE businesses (
 *   - This creates a new table called "businesses"
 *   - Think of it as creating a new Excel spreadsheet
 * 
 * id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   - id: A unique identifier for each row (like a row number)
 *   - UUID: A type of ID that's guaranteed to be unique
 *   - PRIMARY KEY: This is the main identifier (like a unique ID number)
 *   - DEFAULT gen_random_uuid(): Automatically generates a unique ID for each new row
 * 
 * name TEXT NOT NULL,
 *   - name: Stores the business name
 *   - TEXT: Type of data (text/string)
 *   - NOT NULL: This field is required (can't be empty)
 * 
 * place_id TEXT NOT NULL UNIQUE,
 *   - place_id: The unique ID from Google Places API
 *   - UNIQUE: No two businesses can have the same place_id
 *   - This is how we identify businesses (like a social security number)
 * 
 * has_website BOOLEAN,
 *   - has_website: Whether the business has a website (true/false)
 *   - BOOLEAN: Type of data (true or false)
 *   - Can be NULL (we haven't checked yet)
 * 
 * last_checked_at TIMESTAMPTZ,
 *   - last_checked_at: When we last checked/updated this business
 *   - TIMESTAMPTZ: Date and time with timezone
 *   - Can be NULL (if we just inserted it and haven't checked it yet)
 * 
 * created_at TIMESTAMPTZ DEFAULT NOW(),
 *   - created_at: When this record was first created
 *   - DEFAULT NOW(): Automatically sets to current time when row is created
 * 
 * updated_at TIMESTAMPTZ DEFAULT NOW()
 *   - updated_at: When this record was last updated
 *   - DEFAULT NOW(): Automatically sets to current time
 */

-- Create the businesses table
CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  place_id TEXT NOT NULL UNIQUE,
  has_website BOOLEAN,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

/**
 * CREATE INDEX
 * 
 * An index makes database lookups faster.
 * Think of it like an index in a book - it helps you find things quickly.
 * 
 * We create an index on place_id because we search by place_id a lot.
 * Without an index, the database has to check every row (slow).
 * With an index, it can find the row instantly (fast).
 */
CREATE INDEX IF NOT EXISTS idx_businesses_place_id ON businesses(place_id);

/**
 * ENABLE ROW LEVEL SECURITY (RLS)
 * 
 * RLS is a security feature in Supabase.
 * For now, we'll disable it to keep things simple.
 * In production, you'd want to enable it and set up proper security rules.
 */
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

/**
 * CREATE POLICY (Optional - for public access)
 * 
 * This allows anyone to read/write to the table.
 * In production, you'd want more restrictive policies.
 * 
 * For now, we'll create a policy that allows all operations.
 * You can modify this later based on your security needs.
 */
CREATE POLICY "Allow all operations on businesses"
ON businesses
FOR ALL
USING (true)
WITH CHECK (true);
