import type { NextConfig } from "next";

/**
 * Next.js configuration
 *
 * Note (fix for dev/build error):
 * - The `runtime` key is NOT supported in `next.config.ts`
 * - It caused a warning: "Invalid next.config.ts options detected"
 * - Removing it keeps the app working on Vercel (no behavior change)
 * - Vercel already uses the correct runtime automatically
 */
const nextConfig: NextConfig = {};

export default nextConfig;
