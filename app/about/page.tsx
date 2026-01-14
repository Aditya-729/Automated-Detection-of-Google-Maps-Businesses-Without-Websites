/**
 * ABOUT PAGE (app/about/page.tsx)
 * 
 * This creates a route at "/about"
 * 
 * Folder structure = URL structure:
 * - app/about/page.tsx → /about
 * - app/contact/page.tsx → /contact
 * - app/blog/[id]/page.tsx → /blog/123 (dynamic)
 */

export default function About() {
  return (
    <main>
      <h1>About Page</h1>
      <p>This is the about page at /about</p>
      <a href="/">← Back to home</a>
    </main>
  );
}
