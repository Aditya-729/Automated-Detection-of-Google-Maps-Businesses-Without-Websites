# API Response Format

## Endpoint

`POST /api/run`

## Request

```json
{
  "prompt": "Find coffee shops in New York"
}
```

## Response Structure

```json
{
  "success": true,
  "summary": {
    "totalBusinesses": 5,
    "countWithoutWebsite": 2
  },
  "businessesWithoutWebsite": [
    {
      "name": "Local Coffee Shop",
      "address": "123 Main St, New York, NY 10001"
    },
    {
      "name": "Corner Cafe",
      "address": "456 Broadway, New York, NY 10002"
    }
  ],
  "allBusinesses": [
    {
      "name": "Starbucks",
      "address": "789 5th Ave, New York, NY 10003",
      "place_id": "ChIJ...",
      "has_website": true
    },
    {
      "name": "Local Coffee Shop",
      "address": "123 Main St, New York, NY 10001",
      "place_id": "ChIJ...",
      "has_website": false
    },
    {
      "name": "Corner Cafe",
      "address": "456 Broadway, New York, NY 10002",
      "place_id": "ChIJ...",
      "has_website": false
    },
    {
      "name": "Blue Bottle Coffee",
      "address": "321 Park Ave, New York, NY 10004",
      "place_id": "ChIJ...",
      "has_website": true
    },
    {
      "name": "Dunkin'",
      "address": "654 Lexington Ave, New York, NY 10005",
      "place_id": "ChIJ...",
      "has_website": true
    }
  ],
  "metadata": {
    "businessTypes": ["coffee shop"],
    "location": "New York",
    "originalPrompt": "Find coffee shops in New York",
    "timestamp": "2024-01-15T12:00:00.000Z"
  }
}
```

## Response Fields Explained

### `success`
- **Type**: `boolean`
- **Description**: Indicates if the request was successful
- **Value**: Always `true` for successful requests

### `summary`
- **Type**: `object`
- **Description**: Statistics about the search results
- **Fields**:
  - `totalBusinesses`: Total number of businesses found
  - `countWithoutWebsite`: Number of businesses that don't have a website

### `businessesWithoutWebsite`
- **Type**: `array`
- **Description**: List of businesses that don't have a website
- **Format**: Each item contains only `name` and `address`
- **Note**: Only includes businesses where `has_website === false` (confirmed no website)
- **Excludes**: Businesses where `has_website === null` (not checked yet)

### `allBusinesses`
- **Type**: `array`
- **Description**: Complete list of all businesses found
- **Format**: Full business objects with all fields:
  - `name`: Business name
  - `address`: Full address
  - `place_id`: OpenStreetMap ID
  - `has_website`: `true`, `false`, or `null`

### `metadata`
- **Type**: `object`
- **Description**: Additional information about the request
- **Fields**:
  - `businessTypes`: Array of business types extracted from prompt
  - `location`: Location extracted from prompt
  - `originalPrompt`: The original user prompt
  - `timestamp`: When the request was processed

## Edge Cases

### No Businesses Found

```json
{
  "success": true,
  "summary": {
    "totalBusinesses": 0,
    "countWithoutWebsite": 0
  },
  "businessesWithoutWebsite": [],
  "allBusinesses": [],
  "metadata": {
    "businessTypes": ["coffee shop"],
    "location": "New York",
    "originalPrompt": "Find coffee shops in New York",
    "timestamp": "2024-01-15T12:00:00.000Z"
  }
}
```

### All Businesses Have Websites

```json
{
  "success": true,
  "summary": {
    "totalBusinesses": 3,
    "countWithoutWebsite": 0
  },
  "businessesWithoutWebsite": [],
  "allBusinesses": [
    {
      "name": "Starbucks",
      "address": "123 Main St, New York, NY",
      "place_id": "ChIJ...",
      "has_website": true
    },
    // ... more businesses
  ],
  "metadata": { ... }
}
```

### Some Businesses Not Checked Yet

```json
{
  "success": true,
  "summary": {
    "totalBusinesses": 5,
    "countWithoutWebsite": 1
  },
  "businessesWithoutWebsite": [
    {
      "name": "Local Coffee Shop",
      "address": "123 Main St, New York, NY"
    }
  ],
  "allBusinesses": [
    {
      "name": "Starbucks",
      "address": "789 5th Ave, New York, NY",
      "place_id": "ChIJ...",
      "has_website": true
    },
    {
      "name": "Local Coffee Shop",
      "address": "123 Main St, New York, NY",
      "place_id": "ChIJ...",
      "has_website": false
    },
    {
      "name": "New Cafe",
      "address": "456 Broadway, New York, NY",
      "place_id": "ChIJ...",
      "has_website": null  // Not checked yet - excluded from businessesWithoutWebsite
    }
  ],
  "metadata": { ... }
}
```

## Frontend Usage

### Display Summary

```typescript
const response = await fetch('/api/run', { ... });
const data = await response.json();

console.log(`Found ${data.summary.totalBusinesses} businesses`);
console.log(`${data.summary.countWithoutWebsite} don't have websites`);
```

### Display Businesses Without Website

```typescript
data.businessesWithoutWebsite.forEach(business => {
  console.log(`${business.name} - ${business.address}`);
});
```

### Access Full Business Data

```typescript
data.allBusinesses.forEach(business => {
  if (business.has_website === false) {
    // Handle business without website
  }
});
```
