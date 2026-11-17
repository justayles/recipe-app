# Recipeek

Android-first cookbook built with Expo (React Native). Save recipes with ingredients, steps, photos, categories and labels. Add friends by email and gift them recipes you have found. Import from BBC Food and similar sites by pasting a page URL, or scan a magazine / cookbook page. Backend is Supabase running locally in Docker (real Postgres, Auth, Row Level Security, Storage, Edge Functions).

## Setup

Prerequisites: Node, Docker Desktop (running), and Expo Go on an Android phone (or an Android emulator). Local API/Studio ports are offset from Listy (`54331` / `54333`) so both apps can run at once.

```bash
npm install
npm run db:start          # starts local Supabase; applies supabase/migrations + seed.sql
cp .env.example .env      # then paste the publishable key from `npx supabase status`
npx expo install --fix    # pins Expo module versions to this SDK
npm start                 # open in Expo Go
```

The app swaps `127.0.0.1` in `EXPO_PUBLIC_SUPABASE_URL` for your dev machine's address automatically, so a phone on the same Wi-Fi works. If it can't connect, allow ports `54321` (and `8081`) through the Windows firewall.

Seeded test accounts (password `password123`):

- `alice@example.com` — owns two recipes, friends with Bob, has a pending request from Cara
- `bob@example.com` — has a pending gift of Alice's tomato pasta
- `cara@example.com` — waiting for Alice to accept her friend request

Sign in as Alice and Bob on two devices to try gifting.

## Useful commands

| Command | What it does |
| --- | --- |
| `npm run db:start` / `db:stop` | Start / stop local Supabase |
| `npm run db:reset` | Re-apply migrations and seed data |
| `npm run db:types` | Regenerate `src/lib/database.types.ts` from the local schema |
| `npm run typecheck` | TypeScript check |
| `npx eslint src` | Lint |
| `npm run scan:recipe -- <file>` | OCR an image (or parse a `.txt` dump) into a recipe JSON |

Local Supabase Studio: http://127.0.0.1:54333

## Layout

- `src/app/` — Expo Router screens: `(auth)` sign in/up, `(app)/(tabs)` recipes / import / friends, recipe detail/edit
- `src/hooks/` — TanStack Query hooks (recipes, labels, friends, gifts, realtime)
- `src/lib/` — Supabase client, auth context, theme, recipe HTML parser, magazine OCR parser
- `scripts/parse-scan.ts` — CLI to OCR a page photo (tesseract.js) or parse a saved OCR dump
- `supabase/migrations/` — schema and RLS; `supabase/seed.sql` — local test data
- `supabase/functions/import-recipe` — fetches a recipe page, reads schema.org JSON-LD, returns title / ingredients / steps / image
- `supabase/functions/scan-recipe` — OCR.space + `parseScanText`, returns a recipe plus the page photo

## Importing a recipe

1. Open a recipe on BBC Food, BBC Good Food, or another site that publishes a Recipe schema.
2. Copy the page URL, open the Import tab, paste, and import.
3. Review the extracted ingredients, steps and photo, then save.

Deep link for later (development builds): `recipeek://import?url=<encoded-page-url>`.

## Scanning a magazine page

1. On the Import tab, tap **Scan** and photograph the page (or pick a photo). Crop to the recipe if you can.
2. The phone sends the photo to an OCR helper on your PC (`npm start` launches it). That helper calls OCR.space using Google DNS (the router DNS here cannot resolve `api.ocr.space`), then fills the form. The photo is kept as the recipe image.
3. Review title, ingredients, method and notes, then save.

Get a free key at https://ocr.space/ocrapi and set `EXPO_PUBLIC_OCR_SPACE_API_KEY` in `.env`. Restart Expo after changing `.env`. If OCR.space is unreachable, the helper falls back to Tesseract.

```bash
npx supabase secrets set OCR_SPACE_API_KEY=<your-key>
npx supabase functions deploy scan-recipe
```

To process a scan on your machine — a photo, or a `.txt` file of OCR output:

```bash
npm run scan:recipe -- scripts/fixtures/magazine-ocr.txt
npm run scan:recipe -- path/to/page.jpg
npm run scan:recipe -- --ocr-only path/to/page.jpg   # print raw OCR only
```

## Moving to hosted Supabase

1. Create a project at supabase.com and run `npx supabase link --project-ref <ref>`.
2. `npx supabase db push` to apply the migrations.
3. `npx supabase functions deploy import-recipe scan-recipe`
4. Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_KEY` to the hosted values.
5. Hosted projects require email confirmation by default; the sign-up screen tells users to confirm, or disable it under Auth settings while testing.
6. Optional: build an APK with `npx eas-cli build --platform android --profile preview`.

After changing the schema, regenerate types with `npm run db:types`.
