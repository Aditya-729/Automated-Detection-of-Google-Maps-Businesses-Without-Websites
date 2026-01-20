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

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Type definitions for API response
 * 
 * These types match the structure returned by the backend API
 * TypeScript uses these to ensure type safety and provide autocomplete
 */
interface BusinessWithoutWebsite {
  name: string;
  address: string;
  place_id: string;
  lat: number | null;
  lon: number | null;
  has_website?: boolean | null;
  website_status?: "no_website" | "unknown";
}

interface StreamMetadata {
  businessTypes: string[];
  location: string | null;
  radiusKm: number;
  tileCount: number;
  center: {
    lat: number;
    lon: number;
  };
  mockUsed?: boolean;
  geminiErrorMessage?: string | null;
  minoEnabled?: boolean;
}

interface StreamProgress {
  tilesSearched: number;
  totalTiles: number;
  businessesFound: number;
  uniqueBusinesses: number;
}

interface TileBounds {
  id: string;
  bounds: {
    west: number;
    east: number;
    north: number;
    south: number;
  };
}

const MapView = dynamic(() => import("./components/MapView"), {
  ssr: false,
});

interface ToastMessage {
  id: string;
  text: string;
}

export default function Home() {
  const quickPrompts = [
    "Find restaurants in New York without websites",
    "List coffee shops in Los Angeles without websites",
    "Show grocery stores in Chicago without websites",
    "Find salons in Houston without websites",
    "List gyms in Phoenix without websites",
  ];

  const [prompt, setPrompt] = useState("");
  const [radiusKm, setRadiusKm] = useState(50);
  const [businesses, setBusinesses] = useState<BusinessWithoutWebsite[]>([]);
  const [metadata, setMetadata] = useState<StreamMetadata | null>(null);
  const [progress, setProgress] = useState<StreamProgress | null>(null);
  const [tiles, setTiles] = useState<TileBounds[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const RESULTS_PAGE_SIZE = 100;
  const [visibleCount, setVisibleCount] = useState(RESULTS_PAGE_SIZE);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(0);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [geminiCheckStatus, setGeminiCheckStatus] = useState<string | null>(null);
  const [isCheckingGemini, setIsCheckingGemini] = useState(false);
  const streamControllerRef = useRef<AbortController | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((current) => current + RESULTS_PAGE_SIZE);
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(target);

    return () => observer.disconnect();
  }, [RESULTS_PAGE_SIZE]);

  useEffect(() => {
    if (!isStreaming) {
      return;
    }
    const interval = setInterval(() => {
      setNowTick(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [isStreaming]);

  /**
   * Handler for streaming results from the backend.
   * - Sends the prompt + radius
   * - Parses SSE events and updates the UI incrementally
   * - Shows errors without blocking partial results
   */
  const handleRun = async () => {
    streamControllerRef.current?.abort();
    const controller = new AbortController();
    streamControllerRef.current = controller;

    setIsStreaming(true);
    setHasSearched(true);
    setBusinesses([]);
    setMetadata(null);
    setProgress(null);
    setTiles([]);
    setError(null);
    setVisibleCount(RESULTS_PAGE_SIZE);
    setStartTime(Date.now());
    setNowTick(Date.now());
    setToasts([]);

    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ prompt, radiusKm }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error ||
            errorData.message ||
            `Request failed: ${response.status}`
        );
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text/event-stream")) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error ||
            errorData.message ||
            "Streaming response not supported by server."
        );
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Streaming is not supported in this browser.");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        let boundaryIndex = buffer.indexOf("\n\n");

        while (boundaryIndex !== -1) {
          const rawEvent = buffer.slice(0, boundaryIndex).trim();
          buffer = buffer.slice(boundaryIndex + 2);
          boundaryIndex = buffer.indexOf("\n\n");

          if (!rawEvent) {
            continue;
          }

          let eventType = "message";
          let dataPayload = "";

          for (const line of rawEvent.split("\n")) {
            if (line.startsWith("event:")) {
              eventType = line.replace("event:", "").trim();
            }
            if (line.startsWith("data:")) {
              dataPayload += line.replace("data:", "").trim();
            }
          }

          if (!dataPayload) {
            continue;
          }

          const parsed = JSON.parse(dataPayload);

          if (eventType === "metadata") {
            setMetadata(parsed);
          }

          if (eventType === "progress") {
            setProgress(parsed);
          }

          if (eventType === "business") {
            setBusinesses((current) => [...current, parsed]);
            const toastId = `${parsed.place_id}-${Date.now()}`;
            setToasts((current) => [
              { id: toastId, text: `Found: ${parsed.name}` },
              ...current,
            ].slice(0, 5));
            setTimeout(() => {
              setToasts((current) =>
                current.filter((toast) => toast.id !== toastId)
              );
            }, 5000);
          }

          if (eventType === "tile") {
            setTiles((current) => {
              if (current.some((tile) => tile.id === parsed.id)) {
                return current;
              }
              return [...current, parsed];
            });
          }

          if (eventType === "done") {
            setProgress((current) => ({
              tilesSearched: parsed.tilesSearched ?? current?.tilesSearched ?? 0,
              totalTiles: parsed.totalTiles ?? current?.totalTiles ?? 0,
              businessesFound: parsed.totalFound ?? current?.businessesFound ?? 0,
              uniqueBusinesses:
                parsed.uniqueBusinesses ?? current?.uniqueBusinesses ?? 0,
            }));
          }

          if (eventType === "error") {
            throw new Error(parsed.message || "Streaming error");
          }
        }
      }
    } catch (error) {
      console.error("Error:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown error occurred. Please try again.";
      setError(errorMessage);
    } finally {
      setIsStreaming(false);
    }
  };

  const handleGeminiCheck = async () => {
    setIsCheckingGemini(true);
    setGeminiCheckStatus(null);
    try {
      const response = await fetch("/api/gemini-check");
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        const message =
          data?.error || `Gemini check failed (${response.status})`;
        setGeminiCheckStatus(message);
        return;
      }
      setGeminiCheckStatus("Gemini check OK");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Gemini check failed";
      setGeminiCheckStatus(message);
    } finally {
      setIsCheckingGemini(false);
    }
  };

  const mapCenter = useMemo(
    () => metadata?.center ?? null,
    [metadata]
  );

  const elapsedSeconds = useMemo(() => {
    if (!startTime) {
      return 0;
    }
    return Math.floor((nowTick - startTime) / 1000);
  }, [startTime, nowTick]);

  const progressPercent = useMemo(() => {
    if (!progress || progress.totalTiles === 0) {
      return 0;
    }
    return Math.min(
      100,
      Math.round((progress.tilesSearched / progress.totalTiles) * 100)
    );
  }, [progress]);

  const etaSeconds = useMemo(() => {
    if (!progress || progress.tilesSearched === 0 || !startTime) {
      return null;
    }
    const elapsedMs = nowTick - startTime;
    const avgPerTile = elapsedMs / progress.tilesSearched;
    const remainingTiles = Math.max(
      0,
      progress.totalTiles - progress.tilesSearched
    );
    return Math.round((avgPerTile * remainingTiles) / 1000);
  }, [progress, startTime, nowTick]);

  const formatTime = (seconds: number | null) => {
    if (seconds === null) {
      return "--:--";
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  };

  return (
    <main className="app-shell">
      <div className="bg-orb orb-one" aria-hidden="true" />
      <div className="bg-orb orb-two" aria-hidden="true" />
      <div className="bg-orb orb-three" aria-hidden="true" />
      <section className="hero">
        <h1>Website Gap Finder</h1>
        <p className="page-description">Find local businesses missing a website.</p>

        <div className="status-list">
          <span className="status-pill">
            {metadata
              ? metadata.mockUsed
                ? "Gemini: Mocked"
                : "Gemini: Live"
              : "Gemini: Pending"}
          </span>
          <span className="status-pill">OpenStreetMap: On</span>
          <span className="status-pill">Supabase Cache: On</span>
          <span className="status-pill">
            Mino Check: {metadata?.minoEnabled === false ? "Off" : "On"}
          </span>
        </div>
        <div className="status-list status-actions">
          <button
            type="button"
            className="prompt-button action-button"
            onClick={handleGeminiCheck}
            disabled={isCheckingGemini}
          >
            {isCheckingGemini ? "Checking Gemini..." : "Check Gemini"}
          </button>
          {geminiCheckStatus && (
            <span className="status-pill">{geminiCheckStatus}</span>
          )}
        </div>

        <div className="intro-cards">
          <div className="intro-card">
            <h3>Prompt</h3>
            <p>Example: salons in Chicago</p>
          </div>
          <div className="intro-card">
            <h3>Live results</h3>
            <p>Businesses stream in instantly.</p>
          </div>
          <div className="intro-card">
            <h3>Tiles</h3>
            <p>Coverage is shown on the map.</p>
          </div>
        </div>
      </section>

      <section className="quick-prompts">
        <h2>Quick prompts</h2>
        <div className="prompt-buttons">
          {quickPrompts.map((text) => (
            <button
              key={text}
              className="prompt-button"
              type="button"
              onClick={() => setPrompt(text)}
            >
              {text}
            </button>
          ))}
        </div>
      </section>

      {/* TEXTAREA SECTION */}
      {/* 
        Textarea for user input:
        - value: controlled by React state (prompt)
        - onChange: updates state when user types
        - placeholder: hint text shown when empty
      */}
      <div className="input-section">
        <label htmlFor="prompt-input">Enter your prompt:</label>
        <div className={`prompt-status ${prompt.trim() ? "ready" : "idle"}`}>
          {prompt.trim()
            ? "Ready to search"
            : "Add a city"}
        </div>
        <textarea
          id="prompt-input"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Example: Find coffee shops in Austin without websites"
          rows={6}
        />
        <div className="radius-control">
          <label htmlFor="radius-slider">
            Search radius: <strong>{radiusKm} km</strong>
          </label>
          <input
            id="radius-slider"
            type="range"
            min={10}
            max={1000}
            step={1}
            value={radiusKm}
            onChange={(event) => setRadiusKm(Number(event.target.value))}
          />
          <span className="radius-hint">10–1000 km</span>
        </div>
      </div>

      {/* RUN BUTTON */}
      {/* 
        Button to trigger the action:
        - disabled when textarea is empty OR when streaming
        - shows "Streaming..." while results arrive
      */}
      <div className="button-section">
        <button onClick={handleRun} disabled={!prompt.trim() || isStreaming}>
          {isStreaming ? "Streaming..." : "Run"}
        </button>
      </div>

      <div className="status-bar">
        <div className="progress-row">
          <span>Progress</span>
          <span>{progressPercent}%</span>
        </div>
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="status-metrics">
          <span>Elapsed: {formatTime(elapsedSeconds)}</span>
          <span>ETA: {formatTime(etaSeconds)}</span>
          <span>
            Tiles: {progress?.tilesSearched ?? 0}/{progress?.totalTiles ?? 0}
          </span>
          <span>Found: {businesses.length}</span>
        </div>
        <div className="status-note">
          Tile coverage: full scan (no timeout)
        </div>
      </div>

      <section className="map-section">
        <h2>Map view</h2>
        {mapCenter ? (
          <MapView
            center={mapCenter}
            radiusKm={metadata?.radiusKm ?? radiusKm}
            tiles={tiles}
            businesses={businesses}
          />
        ) : (
          <div className="map-placeholder">
            <p>Run a search to see the tiles and businesses on the map.</p>
          </div>
        )}
      </section>

      {/* RESULTS SECTION */}
      {/* 
        States:
        - Streaming: show progress and loading copy
        - Error: show error message
        - Results: show businesses list as it grows
        - Empty: no search yet
      */}
      <div className="results-section">
        <h2>Results</h2>

        {isStreaming && (
          <div className="loading-state">
            <p>Streaming businesses without websites...</p>
            <p className="loading-hint">
              {progress
                ? `Tiles searched: ${progress.tilesSearched}/${progress.totalTiles}`
                : "Initializing geo-tiling and search"}
            </p>
          </div>
        )}

        {!isStreaming && error && (
          <div className="error-state">
            <p className="error-title">Error</p>
            <p className="error-message">{error}</p>
          </div>
        )}

        {!error && businesses.length > 0 && (
          <div className="results-content">
            <div className="statistics">
              <div className="stat-item">
                <span className="stat-label">Businesses Found:</span>
                <span className="stat-value">{businesses.length}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Tiles Progress:</span>
                <span className="stat-value stat-value-highlight">
                  {progress
                    ? `${progress.tilesSearched}/${progress.totalTiles}`
                    : metadata
                    ? `0/${metadata.tileCount}`
                    : "—"}
                </span>
              </div>
            </div>

            <div className="table-container">
              <h3>Businesses Without Website</h3>
              <table className="businesses-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Address</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {businesses.slice(0, visibleCount).map((business) => (
                    <tr key={business.place_id}>
                      <td className="business-name">{business.name}</td>
                      <td className="business-address">{business.address}</td>
                      <td className="business-status">
                        {business.has_website === false
                          ? "No website"
                          : "Needs check"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div ref={loadMoreRef} className="load-more-trigger" />
              {visibleCount < businesses.length && (
                <div className="load-more-actions">
                  <button
                    type="button"
                    className="prompt-button"
                    onClick={() =>
                      setVisibleCount((current) => current + RESULTS_PAGE_SIZE)
                    }
                  >
                    Load more
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {!isStreaming && !error && businesses.length === 0 && (
          <div className="empty-state">
            <p>
              {hasSearched
                ? "No businesses without websites were found for this radius."
                : "No results yet. Enter a prompt and click Run."}
            </p>
          </div>
        )}
      </div>

      {toasts.length > 0 && (
        <div className="toast-stack">
          {toasts.map((toast) => (
            <div key={toast.id} className="toast-item">
              {toast.text}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
