# Troubleshooting

Most Recipeek failures are environment (Docker, env files, JWT) rather than React. Match the symptom, then apply the fix. Deeper context: [supabase.md](./supabase.md), [openai.md](./openai.md), [database.md](./database.md).

## Docker / local stack

### `dockerDesktopLinuxEngine: The system cannot find the file specified`

Docker Desktop is not running, or the Linux engine has not finished starting. Start Docker, wait until it is idle/healthy, then `npm run db:start`.

### `npm run db:start` hangs or health check times out

First start downloads images. Later starts should be ~30s. If Postgres never becomes healthy, `npx supabase stop --no-backup` and start again. Port clash: Listy uses 54321; Recipeek uses **54331**. Another `supabase start` in a different repo with the same `project_id` will fight this one (`project_id = "recipeek"`).

### Studio not loading

http://127.0.0.1:54333 — not 54323. Confirm with `npx supabase status`.

## App cannot reach Supabase

### `Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_KEY`

Copy `.env.example` to `.env`, paste the publishable key from `npx supabase status`, restart Metro. Service role key is the wrong one.

### Phone: connection refused / failed to fetch

The phone is calling your PC. Checklist in [development.md](./development.md) (firewall 54331 + Metro port, same Wi-Fi, Docker up). Emulator without LAN rewrite uses `10.0.2.2` (already handled in `src/lib/supabase.ts` if `hostUri` is loopback).

### Web works, phone does not

Almost always LAN / firewall. Web talks to `127.0.0.1` on the PC itself.

## Auth and RLS

### Sign-up works locally, hosted says check your email

Hosted Auth confirms email by default. Confirm the message, or disable Confirm email in the hosted dashboard while testing.

### `new row violates row-level security policy for table recipes`

1. You just ran `db:reset` and the app still holds the old JWT → sign out and in.
2. Insert omitted `owner_id` — `useSaveRecipe` must pass `ownerId: session.user.id`.
3. You are looking at a SELECT-on-insert failure; `recipes_select` must allow `owner_id = auth.uid()` (already in `20261030140000_fix_recipes_select_rls.sql`).

### Friends list hangs or other user’s profile is empty

`can_see_profile` is `SECURITY DEFINER` so a pending request can read the other profile. If you drop that or make it `INVOKER`, the Friends tab will look broken. Do not “simplify” those helpers without reading [database.md](./database.md).

## Import

### Could not find a recipe on that page

No Recipe JSON-LD (and no usable `og:title`). Try BBC Food / Good Food, or enter the recipe by hand.

### Site returned 403 / 404

The function’s User-Agent is still blocked, or the URL is a homepage / AMP oddity. Open the URL in a browser; copy the canonical recipe URL.

### Works on web, fails on phone

Client fallback `importDirectly` cannot fetch many sites from a device. Fix the **function** (Docker must be able to reach the public internet). Community Fibre DNS has failed some third-party hosts before; if Docker cannot resolve a hostname, the function fails even when your PC browser works.

## Scan / OpenAI

### Scan button is missing

Scan is gated by PostHog flag `recipe-scan`. Hidden while flags load, if the flag is off, or if `EXPO_PUBLIC_POSTHOG_KEY` is unset. Create the boolean flag in PostHog, enable it for your user, and restart Metro. The `scan-recipe` function also returns 403 when the flag is off.

Instagram import is the same pattern with flag `instagram-import`. If paste-an-Instagram-link does nothing useful, the flag is off or PostHog is unset. If the function says Instagram would not share that post, the page is private or the server IP was blocked — try local Docker first.

Recipeek does not appear in Instagram’s share sheet in Expo Go. Build a development client (`npx expo run:android`). Paste still works.

### `OPENAI_API_KEY is not set`

Local: key belongs in `supabase/functions/.env`, then `npm run db:stop && npm run db:start`. Not Expo `.env`, not `npx supabase secrets set` (that is hosted).

Hosted: `npx supabase secrets set OPENAI_API_KEY=sk-proj-...` on the linked project, then `npx supabase secrets list`.

### `npx supabase secrets set … --local`

This CLI has no `--local` flag. Without it, the command uploads to the hosted project you select (you may already have done this to `zxcbiwkfknctkcoutkua`). That does not configure Docker.

### Quota / billing errors from OpenAI

API credit is separate from ChatGPT Plus. Add credit at platform.openai.com Billing.

### Scan succeeds but photo is a placeholder

Image generation failed; JSON extraction worked. Upload your own photo or save without one. Check function logs for the image API error.

### Scan is slow or times out

Two model calls, often 10–30s. Huge page photos are compressed to ~1280px JPEG in `src/lib/scan-recipe.ts`. If Kong still 413s, crop tighter in the picker.

### Terrible ingredients mixed into steps

That was the old OCR path (removed). Current scan uses `gpt-6-luna` + a strict schema. If a particular page is still messy, try a tighter crop or set `OPENAI_SCAN_MODEL=gpt-5.4-nano` in `supabase/functions/.env`.

## Edge Functions generally

### `Edge Function returned a non-2xx status code`

The SDK swallows the JSON body. `src/lib/function-error.ts` reads `error.context.json()`. If you still see the generic string, the body was empty or not JSON — check Docker / hosted function logs.

### Function changes not picked up

Local `per_worker` should hot-reload. If not: `npm run db:stop && npm run db:start`. Hosted: `npx supabase functions deploy <name>`.

## Expo

### Camera / library permission denied

Grant it in system settings. Copy lives in `app.json` under the `expo-image-picker` plugin.

### SplashScreen.setOptions cannot be used in Expo Go

Harmless warning. Custom splash timing is limited in Expo Go.

### Native module missing / invariant violation after `npm add`

You added a package with `npm add` instead of `npx expo install`, or it is not in Expo Go. Run `npx expo install --fix` and check whether you now need a development build.

## Git / keys

### Accidentally committed a key

Rotate it on OpenAI or Supabase, `git rm --cached` the file, ensure `.gitignore` lists `.env` and `supabase/functions/.env`. `.env.example` must stay a placeholder.
