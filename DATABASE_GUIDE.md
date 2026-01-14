# Database Guide for Beginners

## What is a Database?

Think of a database like a digital filing cabinet or an Excel spreadsheet:
- **Tables** = Spreadsheets (collections of related data)
- **Rows** = Individual records (like one business)
- **Columns** = Fields (like name, address, etc.)

## Our Businesses Table

Our `businesses` table is like a spreadsheet with these columns:

| id | name | place_id | has_website | last_checked_at | created_at |
|----|------|----------|-------------|-----------------|------------|
| 1 | Starbucks | ChIJ... | true | 2024-01-15 | 2024-01-10 |
| 2 | McDonald's | ChIJ... | true | 2024-01-14 | 2024-01-11 |

## Key Concepts

### 1. Primary Key (id)
- A unique identifier for each row
- Like a social security number - no two rows have the same id
- Automatically generated when you insert a new row

### 2. Unique Constraint (place_id)
- `place_id` is marked as UNIQUE
- This means no two businesses can have the same place_id
- This is how we identify businesses from Google Places API

### 3. NULL Values
- NULL means "no value" or "not set yet"
- `has_website` can be NULL if we haven't checked yet
- `last_checked_at` can be NULL if we just inserted the record

### 4. Timestamps
- `created_at`: When the row was first created (never changes)
- `updated_at`: When the row was last modified (changes on updates)
- `last_checked_at`: When we last checked this business (can be updated)

## How Caching Works

### Scenario 1: First Time Searching
1. User searches: "coffee shops in New York"
2. System checks database: No results found
3. Calls Google Places API: Gets list of coffee shops
4. Saves to database: Stores each business
5. Returns results to user

### Scenario 2: Searching Again (Cache Hit)
1. User searches: "coffee shops in New York" (same search)
2. System checks database: Finds businesses we've seen before
3. Uses cached data: No API call needed!
4. Only calls API for new businesses we haven't seen
5. Returns results (mix of cached + new)

## Database Operations Explained

### SELECT (Read)
```sql
SELECT * FROM businesses WHERE place_id = 'ChIJ...'
```
- "Get me all columns (*) from businesses table where place_id equals this value"
- This is what `getBusinessFromCache()` does

### INSERT (Create)
```sql
INSERT INTO businesses (name, place_id, has_website) 
VALUES ('Starbucks', 'ChIJ...', true)
```
- "Add a new row to businesses table with these values"
- This is what `insertBusiness()` does

### UPDATE (Modify)
```sql
UPDATE businesses 
SET has_website = true, last_checked_at = NOW() 
WHERE place_id = 'ChIJ...'
```
- "Update the row where place_id equals this value, set these new values"
- This is what `updateBusiness()` does

### UPSERT (Insert or Update)
- Combination of INSERT and UPDATE
- "If row exists, update it. If not, insert it."
- This is what `upsertBusiness()` does

## Why Use a Cache?

1. **Speed**: Database lookups are faster than API calls
2. **Cost**: Google Places API charges per request - cache reduces calls
3. **Reliability**: If API is down, we can still serve cached data
4. **Rate Limits**: APIs have limits - caching helps stay under limits

## Common Questions

**Q: What if a business changes its name?**
A: We update the name when we fetch fresh data from the API. The `last_checked_at` field helps us know when data might be stale.

**Q: How long is cached data valid?**
A: Currently, we use cached data indefinitely. You could add logic to refresh data older than X days.

**Q: What if the database is full?**
A: Supabase free tier has limits, but for this use case, it's usually enough. You can add cleanup logic to remove old records if needed.

**Q: Can I see the data in the database?**
A: Yes! In Supabase dashboard, go to "Table Editor" to view and edit your data.
