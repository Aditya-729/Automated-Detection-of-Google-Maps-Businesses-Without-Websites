/**
 * HOME PAGE (app/page.tsx)
 * 
 * This file creates the home page at the route "/"
 * 
 * "use client" directive:
 * - Makes this a Client Component (runs in the browser)
 * - Needed for interactivity (buttons, inputs, event handlers)
 * - Server Components (default) can't use useState, onClick, etc.
 */
"use client";

import { useState } from "react";

/**
 * Type definitions for API response
 * 
 * These types match the structure returned by the backend API
 * TypeScript uses these to ensure type safety and provide autocomplete
 */
interface BusinessWithoutWebsite {
  name: string;
  address: string;
}

interface ApiResponse {
  success: boolean;
  summary: {
    totalBusinesses: number;
    countWithoutWebsite: number;
  };
  businessesWithoutWebsite: BusinessWithoutWebsite[];
  allBusinesses: Array<{
    name: string;
    address: string;
    place_id: string;
    has_website: boolean | null;
  }>;
  metadata: {
    businessTypes: string[];
    location: string | null;
    originalPrompt: string;
    timestamp: string;
  };
}

export default function Home() {
  // State to store the user's prompt input
  const [prompt, setPrompt] = useState("");
  
  // State to store the API response data
  // null = no data yet, ApiResponse = successful response, string = error message
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // State to track loading state (shows when request is in progress)
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Handler function that runs when the "Run" button is clicked
   * 
   * UI LOGIC FLOW:
   * 1. Set loading state → Shows "Running..." and disables button
   * 2. Clear previous data and errors → Clean slate for new results
   * 3. Send API request → POST to /api/run with user prompt
   * 4. Handle response:
   *    - Success → Parse JSON and update data state
   *    - Error → Update error state with message
   * 5. Always clear loading state → Re-enable button
   * 
   * ERROR HANDLING:
   * - Network errors (no internet, server down)
   * - HTTP errors (400, 500, etc.)
   * - JSON parsing errors (malformed response)
   * - All errors are caught and displayed to user
   */
  const handleRun = async () => {
    // STEP 1: Set loading state
    // This shows "Running..." text and disables the button
    setIsLoading(true);
    
    // STEP 2: Clear previous results and errors
    // Ensures we don't show stale data from previous searches
    setData(null);
    setError(null);

    try {
      // STEP 3: Send POST request to the API route
      // fetch() is the browser's built-in function for HTTP requests
      const response = await fetch("/api/run", {
        method: "POST", // HTTP method
        headers: {
          "Content-Type": "application/json", // Tell server we're sending JSON
        },
        body: JSON.stringify({ prompt }), // Convert prompt to JSON string
      });

      // STEP 4a: Check if the request was successful (status 200-299)
      // If not successful, throw an error with status code
      if (!response.ok) {
        // Try to get error message from response
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || errorData.message || `Request failed: ${response.status}`
        );
      }

      // STEP 4b: Parse the JSON response from the server
      // The response should match our ApiResponse type
      const responseData: ApiResponse = await response.json();

      // Validate response structure
      if (!responseData.success || !responseData.summary) {
        throw new Error("Invalid response format from server");
      }

      // STEP 5: Update data state with successful response
      // This triggers a re-render and displays the results
      setData(responseData);
    } catch (error) {
      // ERROR HANDLING: Catch any errors and display to user
      // Types of errors:
      // - NetworkError: No internet, server unreachable
      // - HTTPError: Server returned error status (400, 500, etc.)
      // - ParseError: Response is not valid JSON
      // - ValidationError: Response doesn't match expected structure
      
      console.error("Error:", error);
      
      // Extract error message
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown error occurred. Please try again.";

      // Update error state to display error message in UI
      setError(errorMessage);
    } finally {
      // STEP 6: Always clear loading state when done
      // This runs whether request succeeded or failed
      // Re-enables the button and hides loading indicator
      setIsLoading(false);
    }
  };

  return (
    <main>
      <h1>Business Website Checker</h1>
      <p className="page-description">
        Enter a prompt to find businesses and check which ones don't have websites.
      </p>

      {/* TEXTAREA SECTION */}
      {/* 
        Textarea for user input:
        - value: controlled by React state (prompt)
        - onChange: updates state when user types
        - placeholder: hint text shown when empty
      */}
      <div className="input-section">
        <label htmlFor="prompt-input">Enter your prompt:</label>
        <textarea
          id="prompt-input"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Type your prompt here..."
          rows={6}
        />
      </div>

      {/* RUN BUTTON */}
      {/* 
        Button to trigger the action:
        - onClick: calls handleRun function when clicked
        - disabled: button is disabled when textarea is empty OR when loading
        - Shows "Running..." text when isLoading is true
      */}
      <div className="button-section">
        <button onClick={handleRun} disabled={!prompt.trim() || isLoading}>
          {isLoading ? "Running..." : "Run"}
        </button>
      </div>

      {/* RESULTS SECTION */}
      {/* 
        UI STATE LOGIC:
        The results section displays different content based on state:
        
        1. LOADING STATE (isLoading === true):
           - Shows loading message
           - User knows request is in progress
           
        2. ERROR STATE (error !== null):
           - Shows error message
           - User knows something went wrong
           - Can try again
           
        3. SUCCESS STATE (data !== null):
           - Shows statistics (total, count without website)
           - Shows table of businesses without website
           - User can see the results
           
        4. EMPTY STATE (no data, no error, not loading):
           - Shows placeholder message
           - User hasn't searched yet
      */}
      <div className="results-section">
        <h2>Results</h2>

        {/* LOADING STATE */}
        {/* 
          Displayed when isLoading is true
          Shows user that the request is in progress
          Prevents confusion about why nothing is happening
        */}
        {isLoading && (
          <div className="loading-state">
            <p>Searching for businesses...</p>
            <p className="loading-hint">This may take a few seconds</p>
          </div>
        )}

        {/* ERROR STATE */}
        {/* 
          Displayed when error is not null
          Shows the error message to help user understand what went wrong
          User can fix the issue and try again
        */}
        {!isLoading && error && (
          <div className="error-state">
            <p className="error-title">Error</p>
            <p className="error-message">{error}</p>
          </div>
        )}

        {/* SUCCESS STATE */}
        {/* 
          Displayed when data is not null and not loading
          Shows the actual results from the API
          Includes statistics and table
        */}
        {!isLoading && !error && data && (
          <div className="results-content">
            {/* STATISTICS SECTION */}
            {/* 
              Display summary statistics:
              - Total businesses found
              - Count of businesses without website
              
              These numbers give users a quick overview before seeing the full list
            */}
            <div className="statistics">
              <div className="stat-item">
                <span className="stat-label">Total Businesses:</span>
                <span className="stat-value">{data.summary.totalBusinesses}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Without Website:</span>
                <span className="stat-value stat-value-highlight">
                  {data.summary.countWithoutWebsite}
                </span>
              </div>
            </div>

            {/* BUSINESSES TABLE */}
            {/* 
              Display businesses without website in a table format
              
              TABLE STRUCTURE:
              - Header row with column names
              - Data rows with business name and address
              
              CONDITIONAL RENDERING:
              - If countWithoutWebsite > 0: Show table with businesses
              - If countWithoutWebsite === 0: Show message that all businesses have websites
              
              This makes it easy to scan and read the results
            */}
            {data.summary.countWithoutWebsite > 0 ? (
              <div className="table-container">
                <h3>Businesses Without Website</h3>
                <table className="businesses-table">
                  {/* TABLE HEADER */}
                  {/* 
                    Defines column names
                    Helps users understand what each column represents
                  */}
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Address</th>
                    </tr>
                  </thead>
                  {/* TABLE BODY */}
                  {/* 
                    Maps through businessesWithoutWebsite array
                    Creates one row per business
                    Displays name in first column, address in second column
                  */}
                  <tbody>
                    {data.businessesWithoutWebsite.map((business, index) => (
                      <tr key={index}>
                        <td className="business-name">{business.name}</td>
                        <td className="business-address">{business.address}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              // NO BUSINESSES WITHOUT WEBSITE
              // Displayed when all businesses have websites
              <div className="no-results-message">
                <p>✓ All businesses have websites!</p>
              </div>
            )}
          </div>
        )}

        {/* EMPTY STATE */}
        {/* 
          Displayed when:
          - Not loading
          - No error
          - No data
          
          This is the initial state before user makes their first search
        */}
        {!isLoading && !error && !data && (
          <div className="empty-state">
            <p>No results yet. Enter a prompt and click Run to search for businesses.</p>
          </div>
        )}
      </div>
    </main>
  );
}
