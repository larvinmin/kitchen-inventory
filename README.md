# Kitchen Inventory

A recipe management app that lets you import recipes from Instagram Reels, cook with ingredient substitutions, photograph your meals, and rank them.

Built with **Next.js 16**, **Supabase**, **Gemini AI**, and **Apify**.

## Features

- **Recipe Importer** — Paste an Instagram Reel URL → Apify scrapes the content → Gemini extracts structured recipe data (from caption, transcript, or video comprehension)
- **Cooking Sessions** — Cook recipes with ingredient swaps, track substitutions, and add notes
- **Photo Upload** — Photograph your finished meals (stored in Supabase Storage)
- **Beli-Style Ranking** — Rate meals as bad/ok/good, then refine position via pairwise comparisons. Scores are distributed along a bell curve within each category (0–3.3, 3.3–6.7, 6.7–10)
- **Cook Log** — View all meals ranked by score with drag-and-drop reordering
- **Recipe Iteration** — Save substituted recipes as iterations linked to the original

## Getting Started

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project
- An [Apify](https://apify.com) account (for Instagram scraping)
- Google AI credentials — either:
  - [AI Studio](https://aistudio.google.com) API key, or
  - [Google Cloud](https://console.cloud.google.com) project with Vertex AI enabled

### Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.local.example .env.local
   ```
   Fill in your API keys — see `.env.local.example` for details.

3. **Set up Supabase:**
   - Create a new project at [supabase.com](https://supabase.com)
   - Run both migration files in the SQL Editor:
     - `supabase/migrations/001_initial_schema.sql`
     - `supabase/migrations/002_cooking_sessions.sql`
   - Create a **Storage bucket** named `meal-photos` (set to Public)

4. **If using Vertex AI**, authenticate:
   ```bash
   gcloud auth application-default login
   ```

5. **Run the dev server:**
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Database | Supabase (PostgreSQL + Auth + Storage) |
| AI | Google Gemini 2.5 Flash (caption/video extraction) |
| Scraping | Apify (Instagram Reel Scraper) |
| Styling | Tailwind CSS v4 |
| Language | TypeScript |

## Project Structure

```
src/
├── app/
│   ├── (app)/           # Authenticated routes
│   │   ├── recipes/     # Recipe library + detail + cook flow
│   │   ├── cook-log/    # Rankings + session detail
│   │   └── import/      # Recipe importer
│   ├── (auth)/          # Login / signup
│   └── api/             # API routes
│       ├── cook-sessions/
│       ├── import/
│       └── upload-photo/
├── components/          # Shared UI components
└── lib/                 # Utilities
    ├── supabase/        # Supabase client helpers
    ├── apify.ts         # Instagram scraping (REST API)
    ├── gemini.ts        # AI recipe extraction
    ├── ranking.ts       # Beli-style bell curve scoring
    └── types.ts         # TypeScript interfaces
```
