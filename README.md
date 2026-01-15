# Next.js App with TypeScript

A simple Next.js application using the App Router with Gemini AI integration.

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase Database

1. **Create a Supabase account** (free tier available):
   - Go to https://supabase.com
   - Sign up and create a new project

2. **Get your Supabase credentials**:
   - In your Supabase project dashboard, go to Settings → API
   - Copy your "Project URL" and "anon public" key

3. **Create the database table**:
   - In Supabase dashboard, go to SQL Editor
   - Click "New Query"
   - Copy and paste the SQL from `supabase-setup.sql` file
   - Click "Run" to execute

### 3. Set Up Environment Variables

**Quick Setup:**
1. Copy the example file: `cp .env.example .env.local` (or copy `.env.example` and rename to `.env.local`)
2. Open `.env.local` and replace the placeholders with your actual API keys

**Manual Setup:**
Create a `.env.local` file in the root directory and add your API keys:

```bash
# Gemini AI API
GEMINI_API_KEY=your_gemini_api_key_here

# Google Maps API (optional)
# Only needed if you want the app to search businesses via Google Places.
# If you don't set this, the app will return 0 businesses (but it will still run).
GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here

# Mino API (for website checking)
MINO_API_KEY=your_mino_api_key_here

# Supabase Database
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

**Get your API keys from:**
- Gemini API: https://makersuite.google.com/app/apikey
- Google Maps API: https://console.cloud.google.com/google/maps-apis
- Mino API: https://mino.ai (for browser automation and website checking)
- Supabase: Your project dashboard (Settings → API)

**⚠️ Important:** The `.env.local` file is gitignored and will NOT be committed to GitHub. Your API keys stay secure!

### 4. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Features

- **Prompt Input**: Enter text describing businesses and locations
- **AI Extraction**: Uses Gemini AI to extract business types and location information
- **Business Search**: Uses Google Places API to find actual businesses
- **Website Checking**: Uses Mino API with parallel browser agents to check if businesses have websites
- **Database Caching**: Stores businesses in Supabase to reduce API calls and improve speed
- **Structured Response**: Returns clean JSON with business details (name, address, place_id, has_website)

## How Caching Works

### Smart Cache Decision Logic

The system uses intelligent caching to balance freshness and efficiency:

**Decision Flow**:
1. **Check Database**: Is business in Supabase?
2. **If exists**: Is data fresh (checked < 24 hours ago)?
   - **YES** → Use cached `has_website` value (skip Mino API)
   - **NO** → Re-check via Mino API (data is stale)
3. **If not exists**: Check via Mino API (new business)
4. **Save Result**: Update database with fresh data and timestamp

**Benefits**:
- **Cost Savings**: Only checks when necessary (fresh data uses cache)
- **Speed**: Cached data returns instantly (no API delay)
- **Accuracy**: Re-checks stale data after 24 hours (ensures freshness)
- **Efficiency**: Parallel processing for multiple businesses

See `CACHE_DECISION_FLOW.md` for detailed flow diagrams and examples.

## Website Checking with Mino API

The app automatically checks if businesses have websites using Mino API:

1. **Parallel Processing**: Multiple businesses are checked simultaneously (faster than sequential)
2. **Smart Caching**: Only checks businesses we haven't checked before (saves API calls)
3. **Database Storage**: Website status is saved to database for future use
4. **Browser Agents**: Mino uses automated browsers to visit Google Maps pages and detect website links

**How it works**:
- For each business found, the app builds a Google Maps URL
- Mino's browser agent visits the page and looks for a website link
- Returns `true` if website found, `false` if not
- Results are cached in the database to avoid re-checking

## API Endpoint

- `POST /api/run` - Processes user prompt, extracts business types and location, searches for businesses using Google Places API, and checks if they have websites using Mino API

## Database Structure

The `businesses` table stores:
- `name`: Business name
- `place_id`: Unique identifier from Google Places (used to identify businesses)
- `has_website`: Whether business has a website (can be null if not checked)
- `last_checked_at`: Timestamp of last update
- `created_at`: When record was first created
- `updated_at`: When record was last updated

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [TypeScript Documentation](https://www.typescriptlang.org/docs)
- [Google Gemini API](https://ai.google.dev/)
- [Google Places API](https://developers.google.com/maps/documentation/places/web-service)
- [Mino API Documentation](https://docs.mino.ai)
- [Supabase Documentation](https://supabase.com/docs)
