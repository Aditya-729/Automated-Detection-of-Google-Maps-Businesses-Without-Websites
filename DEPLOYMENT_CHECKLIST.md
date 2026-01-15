# Vercel Deployment Checklist

## ✅ Pre-Deployment Verification

### 1. App Compatibility ✅
- [x] Uses Next.js App Router (required for Vercel)
- [x] API routes in `app/api/` directory
- [x] Proper route exports (`export async function POST`)
- [x] TypeScript configured correctly
- [x] No breaking changes needed

### 2. Configuration ✅
- [x] `next.config.ts` configured with `runtime: "nodejs"`
- [x] Timeouts adjusted for Vercel limits (8 seconds for Mino API)
- [x] Business limit in place (20 max)
- [x] Error handling complete

### 3. Environment Variables Required
Set these in Vercel dashboard before deploying:

- [ ] `GEMINI_API_KEY` - Gemini AI API key
- [ ] `GOOGLE_MAPS_API_KEY` - Google Maps API key (optional; only needed for business search)
- [ ] `MINO_API_KEY` - Mino API key
- [ ] `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key

### 4. Vercel-Specific Considerations ✅
- [x] Timeout limits respected (8s Mino timeout, 20 business limit)
- [x] Serverless function compatible
- [x] Error handling graceful (won't crash on API failures)
- [x] Environment variable validation in place

## Changes Made for Vercel

### Minimal Changes (Only What Was Needed):

1. **next.config.ts**
   - Added `runtime: "nodejs"` 
   - **Why**: Tells Vercel to use Node.js runtime for API routes
   - **Impact**: None on functionality, just ensures compatibility

2. **app/api/run/route.ts**
   - Reduced `MINO_API_TIMEOUT_MS` from 15s to 8s
   - **Why**: Vercel Hobby plan has 10-second limit, need buffer
   - **Impact**: Slightly faster timeout, still reasonable for Mino API

3. **lib/supabase.ts**
   - Updated error message to mention Vercel
   - **Why**: Helpful for deployment troubleshooting
   - **Impact**: None on functionality

4. **Comments Added**
   - Explained Vercel timeout limits
   - Explained serverless function behavior
   - **Why**: Help understand deployment considerations
   - **Impact**: None on functionality

### What Was NOT Changed:
- ✅ No architecture changes
- ✅ No new libraries
- ✅ No refactoring
- ✅ All existing features work the same
- ✅ Error handling was already complete

## Ready to Deploy

The app is now ready for Vercel deployment. Follow these steps:

1. **Set environment variables** in Vercel dashboard
2. **Push code to GitHub** (or your Git provider)
3. **Import project in Vercel**
4. **Deploy**

See `VERCEL_DEPLOYMENT.md` for detailed instructions.
