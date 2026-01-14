import type { NextConfig } from "next";

/**
 * VERCEL DEPLOYMENT CONFIGURATION
 * 
 * This file configures Next.js for deployment on Vercel.
 * 
 * What is Vercel?
 * - Vercel is a hosting platform that runs your Next.js app
 * - It automatically builds and deploys your app when you push code
 * - It runs your app on "serverless functions" (functions that run on-demand)
 * 
 * Why these settings?
 * - runtime: 'nodejs' - Tells Vercel to use Node.js runtime (required for our APIs)
 * - This ensures our API routes work correctly on Vercel
 */
const nextConfig: NextConfig = {
  // Use Node.js runtime for API routes
  // This is required for Vercel serverless functions
  // Without this, API routes might not work correctly
  runtime: "nodejs",
};

export default nextConfig;
