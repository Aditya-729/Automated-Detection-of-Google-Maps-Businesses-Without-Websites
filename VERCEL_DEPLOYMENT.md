# Vercel Deployment Guide

## App Compatibility ✅

This Next.js app is **fully compatible** with Vercel:

- ✅ Uses App Router (required for Vercel)
- ✅ API routes in `app/api/` (Vercel-compatible)
- ✅ Serverless functions (Vercel's default)
- ✅ TypeScript (fully supported)
- ✅ Environment variables (properly configured)

## Required Environment Variables

You **must** set these in Vercel dashboard before deploying:

### 1. Gemini API Key
```
GEMINI_API_KEY=your_gemini_api_key_here
```
- **Where to get it**: https://makersuite.google.com/app/apikey
- **Why needed**: Extracts business types and location from user prompts
- **Server-only**: Only used in API routes (not exposed to browser)

### 2. Google Maps API Key
```
GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
```
- **Where to get it**: https://console.cloud.google.com/google/maps-apis
- **Why needed**: Searches for businesses using Google Places API
- **Server-only**: Only used in API routes (not exposed to browser)

### 3. Mino API Key
```
MINO_API_KEY=your_mino_api_key_here
```
- **Where to get it**: https://mino.ai
- **Why needed**: Checks if businesses have websites using browser automation
- **Server-only**: Only used in API routes (not exposed to browser)

### 4. Supabase URL
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
```
- **Where to get it**: Supabase dashboard → Settings → API → Project URL
- **Why needed**: Connects to Supabase database for caching
- **Public**: Available in browser (NEXT_PUBLIC_ prefix)

### 5. Supabase Anon Key
```
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```
- **Where to get it**: Supabase dashboard → Settings → API → anon public key
- **Why needed**: Authenticates with Supabase database
- **Public**: Available in browser (NEXT_PUBLIC_ prefix)

## How to Set Environment Variables in Vercel

1. Go to your Vercel project dashboard
2. Click **Settings** → **Environment Variables**
3. Add each variable:
   - **Name**: The variable name (e.g., `GEMINI_API_KEY`)
   - **Value**: Your actual API key
   - **Environment**: Select all (Production, Preview, Development)
4. Click **Save**
5. **Redeploy** your app for changes to take effect

## Vercel Timeout Limits

### Important: Execution Time Limits

- **Hobby Plan**: 10 seconds maximum
- **Pro Plan**: 60 seconds maximum

### How We Handle This

The app is configured to stay under these limits:

1. **Business Limit**: Maximum 20 businesses per request
   - Prevents processing too many businesses
   - Keeps execution time reasonable

2. **Mino API Timeout**: 8 seconds per call
   - Stays under Vercel's 10-second limit (Hobby plan)
   - Leaves 2 seconds for other operations

3. **Parallel Processing**: Multiple checks run simultaneously
   - Faster than sequential processing
   - Still respects timeout limits

### If You Need More Time

- **Upgrade to Pro Plan**: 60 seconds instead of 10
- **Increase limits**: You can increase `MAX_BUSINESSES_LIMIT` and `MINO_API_TIMEOUT_MS` in `app/api/run/route.ts`
- **Note**: Be careful not to exceed Vercel's limits

## Deployment Steps

1. **Push your code to GitHub** (or GitLab/Bitbucket)
2. **Import project in Vercel**:
   - Go to https://vercel.com
   - Click "Add New Project"
   - Import your repository
3. **Set environment variables** (see above)
4. **Deploy**: Vercel will automatically build and deploy
5. **Test**: Visit your deployed URL to test the app

## What Was Changed for Vercel

### Minimal Changes Made:

1. **next.config.ts**: Added `runtime: "nodejs"` 
   - Tells Vercel to use Node.js runtime
   - Required for API routes to work

2. **MINO_API_TIMEOUT_MS**: Reduced from 15s to 8s
   - Stays under Vercel's 10-second limit (Hobby plan)
   - Leaves buffer for other operations

3. **Comments added**: Explained Vercel-specific considerations
   - Helps understand timeout limits
   - Explains serverless function behavior

### Nothing Else Changed:
- ✅ No architecture changes
- ✅ No new libraries added
- ✅ All existing functionality preserved
- ✅ Error handling already in place

## Troubleshooting

### "Function Execution Timeout"
- **Cause**: Request took longer than Vercel's limit
- **Solution**: Reduce `MAX_BUSINESSES_LIMIT` or upgrade to Pro plan

### "Missing Environment Variables"
- **Cause**: Environment variables not set in Vercel
- **Solution**: Add all 5 environment variables in Vercel dashboard

### "API Key Not Configured"
- **Cause**: Environment variable exists but is empty
- **Solution**: Check that you copied the full API key (no extra spaces)

### Build Fails
- **Cause**: Usually missing dependencies or TypeScript errors
- **Solution**: Run `npm install` locally first, fix any TypeScript errors

## Support

If you encounter issues:
1. Check Vercel deployment logs (in Vercel dashboard)
2. Check function logs (in Vercel dashboard → Functions)
3. Verify all environment variables are set correctly
4. Ensure your API keys are valid and have proper permissions
