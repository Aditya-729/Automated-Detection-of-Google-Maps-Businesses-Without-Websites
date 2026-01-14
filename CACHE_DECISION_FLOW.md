# Cache Decision Flow Explained

## Overview

This document explains how the system decides whether to use cached data or check via Mino API.

## Decision Logic

For each business found, the system follows this decision tree:

```
Is business in Supabase database?
│
├─ NO → Check via Mino API → Save to database
│
└─ YES → Check data freshness
         │
         ├─ has_website is null? → Check via Mino API → Save to database
         │
         └─ has_website is set?
            │
            ├─ last_checked_at < 24 hours? → USE CACHE (skip Mino API)
            │
            └─ last_checked_at >= 24 hours? → Check via Mino API → Update database
```

## Detailed Flow

### Step 1: Check Database

```typescript
const cached = await getBusinessFromCache(business.place_id);
```

**Question**: Does this business exist in our database?

- **If NO**: Business is new → Go to Step 2 (Check via Mino)
- **If YES**: Business exists → Go to Step 3 (Check freshness)

### Step 2: New Business (Not in Database)

**Action**: Check via Mino API

**Why**: We have no data about this business, so we must check.

**Result**: 
- Get `has_website` value from Mino API
- Save to database with `last_checked_at = now()`

### Step 3: Business Exists - Check Freshness

**Question**: Is the cached data still fresh?

**Criteria**:
1. `has_website` must not be `null` (we must have checked it before)
2. `last_checked_at` must be less than 24 hours ago

**Decision**:

#### Use Cache (Skip Mino API)
**Conditions**:
- ✓ `has_website !== null` (we have a value)
- ✓ `last_checked_at < 24 hours ago` (data is fresh)

**Action**: Use cached `has_website` value

**Benefits**:
- Saves API costs (no Mino API call)
- Faster response (no network delay)
- Reduces rate limiting issues

#### Re-check via Mino API
**Conditions** (any of these):
- ✗ `has_website === null` (never checked before)
- ✗ `last_checked_at >= 24 hours ago` (data is stale)

**Action**: 
1. Check via Mino API
2. Get fresh `has_website` value
3. Update database with:
   - `has_website`: New value from Mino
   - `last_checked_at`: Current timestamp

**Why re-check?**
- Businesses might add/remove websites over time
- 24 hours ensures data accuracy
- Fresh data improves user experience

## Example Scenarios

### Scenario 1: Fresh Cache (Use Cache)

```
Business: "Starbucks"
Database: { has_website: true, last_checked_at: "2024-01-15T10:00:00Z" }
Current Time: "2024-01-15T20:00:00Z" (10 hours later)

Decision: USE CACHE
Reason: last_checked_at is only 10 hours ago (< 24 hours)
Result: has_website = true (from cache, no API call)
```

### Scenario 2: Stale Cache (Re-check)

```
Business: "Starbucks"
Database: { has_website: true, last_checked_at: "2024-01-14T10:00:00Z" }
Current Time: "2024-01-15T20:00:00Z" (34 hours later)

Decision: RE-CHECK VIA MINO
Reason: last_checked_at is 34 hours ago (> 24 hours)
Action: Call Mino API → Get fresh result → Update database
Result: has_website = true/false (from Mino, saved to database)
```

### Scenario 3: Never Checked (Re-check)

```
Business: "New Coffee Shop"
Database: { has_website: null, last_checked_at: null }

Decision: RE-CHECK VIA MINO
Reason: has_website is null (never checked before)
Action: Call Mino API → Get result → Save to database
Result: has_website = true/false (from Mino, saved to database)
```

### Scenario 4: New Business (Re-check)

```
Business: "Brand New Restaurant"
Database: (does not exist)

Decision: RE-CHECK VIA MINO
Reason: Business not in database
Action: Call Mino API → Get result → Insert into database
Result: has_website = true/false (from Mino, new record created)
```

## Parallel Processing

When multiple businesses need checking, they are checked **in parallel**:

```
Sequential (slow):
Business 1 → 3s → Business 2 → 3s → Business 3 → 3s
Total: 9 seconds

Parallel (fast):
Business 1 ┐
Business 2 ├─→ All at once → 3s
Business 3 ┘
Total: 3 seconds
```

## Benefits of This Approach

1. **Cost Savings**: Only checks when necessary (saves Mino API calls)
2. **Speed**: Uses cache for fresh data (faster responses)
3. **Accuracy**: Re-checks stale data (ensures up-to-date information)
4. **Efficiency**: Parallel processing (faster for multiple businesses)

## Configuration

The 24-hour threshold can be adjusted in the code:

```typescript
const isFresh = isDataFresh(cached.last_checked_at, 24); // 24 hours
```

Change `24` to your desired threshold (in hours).
