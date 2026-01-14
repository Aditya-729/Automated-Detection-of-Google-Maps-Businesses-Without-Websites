# Next.js App Router - Folder Structure Explained

## 📁 Root Level Files

- **`package.json`** - Lists all dependencies and scripts for your project
- **`tsconfig.json`** - TypeScript configuration
- **`next.config.ts`** - Next.js configuration (optional customizations)
- **`.eslintrc.json`** - ESLint rules for code quality
- **`.gitignore`** - Files to exclude from Git

## 📁 app/ (App Router - Main Directory)

This is where your pages and layouts live. The App Router uses file-based routing.

### Key Files:
- **`app/layout.tsx`** - Root layout that wraps all pages (required)
- **`app/page.tsx`** - Home page (route: `/`)
- **`app/globals.css`** - Global CSS styles

### How Routing Works:
- `app/page.tsx` → `/` (home page)
- `app/about/page.tsx` → `/about`
- `app/blog/[id]/page.tsx` → `/blog/123` (dynamic route)
- `app/products/page.tsx` → `/products`

### Special Files in Folders:
- **`layout.tsx`** - Layout for that route segment
- **`page.tsx`** - The actual page component
- **`loading.tsx`** - Loading UI (optional)
- **`error.tsx`** - Error UI (optional)
- **`not-found.tsx`** - 404 page (optional)

## 📁 public/

Static files served directly:
- `public/logo.png` → accessible at `/logo.png`
- `public/favicon.ico` → `/favicon.ico`

## 📁 node_modules/

Dependencies installed by npm (auto-generated, don't edit)

## 📁 .next/

Build output (auto-generated, don't edit)

---

## 🚀 Quick Start

1. Install dependencies: `npm install`
2. Run dev server: `npm run dev`
3. Open: http://localhost:3000
