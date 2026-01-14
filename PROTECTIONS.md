# System Protections Explained

This document explains all the protections implemented in the system and why each one exists.

## 1. Maximum Businesses Limit

### What It Does
Limits the number of businesses processed in a single request to `MAX_BUSINESSES_LIMIT` (default: 20).

### Why This Protection Exists

**Resource Protection:**
- Prevents processing too many businesses at once
- Limits memory usage (each business requires data structures)
- Prevents database connection exhaustion
- Protects CPU from overload

**Cost Control:**
- Each business requires multiple API calls:
  - Google Places API (search)
  - Mino API (website check)
  - Database operations
- Processing 100 businesses = 100+ API calls = high cost
- Limiting to 20 keeps costs reasonable

**Performance:**
- Too many businesses = very long response times
- Users don't want to wait 5+ minutes for results
- 20 businesses = reasonable response time (~30-60 seconds)

**User Experience:**
- Faster responses = better UX
- Partial results are better than no results
- User can refine search if needed

### How It Works
```typescript
if (businesses.length > MAX_BUSINESSES_LIMIT) {
  businesses = businesses.slice(0, MAX_BUSINESSES_LIMIT);
  // Log warning, continue with limited set
}
```

### Example
- User searches: "restaurants in New York"
- Google Places returns: 50 restaurants
- System processes: First 20 restaurants
- Result: User gets 20 results quickly instead of waiting for all 50

---

## 2. Graceful API Error Handling

### What It Does
Catches and handles errors from all API calls (Gemini, Google Places, Mino) without crashing the entire request.

### Why This Protection Exists

**Resilience:**
- APIs can fail for many reasons:
  - Network issues (no internet, connection lost)
  - Rate limits (too many requests)
  - Quota exceeded (API usage limit reached)
  - Invalid API keys
  - Server errors (API provider's server down)
- One failed API call shouldn't break the entire request

**Partial Results:**
- If 5 business types are searched and 1 fails, user still gets 4 results
- Better than getting no results at all
- User can retry failed searches if needed

**User Experience:**
- Users see helpful error messages
- System continues working even when some APIs fail
- No confusing crashes or blank screens

### How It Works

**Google Places API:**
```typescript
try {
  const response = await fetch(apiUrl);
  if (!response.ok) {
    // Log error, continue with next business type
    continue;
  }
  // Process results
} catch (error) {
  // Log error, continue with next business type
  continue;
}
```

**Gemini API:**
```typescript
try {
  const result = await model.generateContent(prompt);
  // Process result
} catch (error) {
  // Return user-friendly error message
  return NextResponse.json({ error: "AI processing failed" });
}
```

**Mino API:**
```typescript
try {
  const response = await fetch(minoUrl);
  // Process result
} catch (error) {
  // Return false (assume no website), continue with other businesses
  return false;
}
```

### Example
- User searches: "coffee shops and restaurants in New York"
- Google Places search for "coffee shops" succeeds → 10 results
- Google Places search for "restaurants" fails (rate limit) → 0 results
- Result: User still gets 10 coffee shops (partial success)

---

## 3. Timeout for Mino API Calls

### What It Does
Adds a timeout (default: 15 seconds) to each Mino API call to prevent hanging requests.

### Why This Protection Exists

**Prevent Hanging:**
- Mino API uses browser automation which can be slow
- Some pages might take a very long time to load
- Some pages might hang indefinitely
- Without timeout, a single slow request can block the entire response

**User Experience:**
- Users don't want to wait indefinitely
- 15 seconds is reasonable for page load + automation
- Better to timeout and continue than wait forever

**Resource Management:**
- Prevents server resources from being tied up
- Allows other requests to be processed
- Prevents memory leaks from hanging connections

**Partial Results:**
- If 10 businesses are checked and 2 timeout, user still gets 8 results
- Better than waiting for all 10 and potentially timing out the entire request

### How It Works
```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => {
  controller.abort(); // Cancel request after timeout
}, timeoutMs);

const response = await fetch(url, {
  signal: controller.signal // Enable cancellation
});
```

### Example
- Checking 5 businesses in parallel
- 4 businesses complete in 5 seconds → Success
- 1 business takes 20 seconds → Times out after 15 seconds
- Result: User gets 4 results quickly, 1 marked as failed

---

## 4. Promise.allSettled() for Parallel Processing

### What It Does
Uses `Promise.allSettled()` instead of `Promise.all()` for parallel Mino API calls.

### Why This Protection Exists

**Error Isolation:**
- `Promise.all()` fails if ANY promise fails
- `Promise.allSettled()` waits for ALL promises (success or failure)
- Failed checks don't prevent successful checks from completing

**Resilience:**
- If checking 10 businesses and 2 fail, user still gets 8 results
- Better than getting no results because 2 failed

**User Experience:**
- Partial results are better than complete failure
- User can see which businesses were checked successfully

### How It Works
```typescript
// Promise.all() - fails if ANY promise fails
const results = await Promise.all(promises); // ❌ All fail if one fails

// Promise.allSettled() - waits for ALL promises
const results = await Promise.allSettled(promises); // ✅ Continues even if some fail
```

### Example
- Checking 10 businesses in parallel
- 8 succeed, 2 fail (timeout or error)
- With `Promise.all()`: All 10 fail, no results
- With `Promise.allSettled()`: 8 succeed, 2 fail, user gets 8 results

---

## Summary

All protections work together to ensure:

1. **System Stability**: Prevents crashes and resource exhaustion
2. **Cost Control**: Limits API usage and costs
3. **Performance**: Ensures reasonable response times
4. **User Experience**: Provides partial results even when some operations fail
5. **Resilience**: System continues working even when APIs fail

These protections make the system production-ready and reliable.
