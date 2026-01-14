/**
 * ROOT LAYOUT (app/layout.tsx)
 * 
 * This is the root layout for your entire app.
 * It wraps all pages and is required in the App Router.
 * 
 * - Must export a default function
 * - Must include <html> and <body> tags
 * - Shared components (like navigation) go here
 * - Metadata for SEO goes here
 */

import type { Metadata } from "next";
import "./globals.css"; // Import global styles

export const metadata: Metadata = {
  title: "Next.js App",
  description: "A simple Next.js app with TypeScript",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
