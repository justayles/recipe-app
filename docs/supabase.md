# Supabase: local Docker and hosted

Recipeek's backend is Supabase. Locally that means **Docker Desktop** plus the Supabase CLI. In production it is a project on supabase.com. Schema and functions are the same code; only where they run and how secrets are loaded changes.

See also [overview.md](./overview.md), [database.md](./database.md), [openai.md](./openai.md).

## Prerequisites

- Docker Desktop running (Linux engine started — the whale icon idle is not enough)
- Node, and the CLI already in `devDependencies` (`npx supabase …`)
- First time: `npm install` then `npm run db:start`

You do **not** put the React Native app in Docker. Docker only hosts Postgres, Auth, Storage, Realtime, Studio, and Edge Functions.

## Local ports (offset from Listy)

`supabase/config.toml` sets `project_id = "recipeek"` and shifts ports so Listy can keep the defaults.

| Service | Local URL / port |
| --- | --- |
| API, Auth, Storage, Functions (Kong) | http://127.0.0.1:54331 |
| Postgres | 54332 |
| Studio | http://127.0.0.1:54333 |
| Mailpit (local emails, not sent) | http://127.0.0.1:54334 |
| Shadow DB (used by `db diff`) | 54330 |
| Analytics | 54337 |

The Expo app's `.env` should use:

```
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54331
EXPO_PUBLIC_SUPABASE_KEY=<publishable key from supabase status>
```

On a phone, `src/lib/supabase.ts` rewrites `127.0.0.1` to the LAN IP of the machine running Expo. Keep `127.0.0.1` in `.env`; do not hard-code your laptop IP.

## Start, stop, status

```bash
npm run db:start          # supabase start — pulls images first time, applies migrations + seed
npm run db:stop           # supabase stop — keeps volumes (data survives)
npx supabase status       # URLs and keys for the running local stack
```

`db:start` failing with `dockerDesktopLinuxEngine: The system cannot find the file specified` means Docker Desktop is not running. Start it, wait until it is healthy, retry.

To wipe local data and re-seed Alice / Bob / Cara:

```bash
npm run db:reset
```

That is destructive. It replays every file in `supabase/migrations/` then `supabase/seed.sql`.

## Local vs hosted: where each value lives

| Value | Local | Hosted (prod) | Goes in the Expo app? |
| --- | --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | `.env` → `http://127.0.0.1:54331` | `.env` or EAS secret → `https://<ref>.supabase.co` | Yes (public) |
| `EXPO_PUBLIC_SUPABASE_KEY` | Publishable / anon key from `npx supabase status` | Project Settings → API | Yes (public; RLS protects data) |
| `OPENAI_API_KEY` | `supabase/functions/.env` | `npx supabase secrets set` (no `--local` flag) | **No** |
| `EXPO_PUBLIC_POSTHOG_KEY` / `EXPO_PUBLIC_POSTHOG_HOST` | `.env` project `phc_…` key | EAS env or `.env` | Yes (public; feature flags) |
| `POSTHOG_API_KEY` / `POSTHOG_HOST` | `supabase/functions/.env` | `npx supabase secrets set` | **No** (same project as the app key; used for AI events and the scan flag check) |
| Service role key | Printed by `supabase status` — do not put in the app | Dashboard — do not put in the app | **No** |

`EXPO_PUBLIC_*` is inlined into the JS bundle. Anything that can spend money or bypass RLS stays in Edge Function secrets.

## Task: add the app keys (URL + publishable key)

### Local

1. `npm run db:start`
2. `npx supabase status`
3. Copy **Publishable** (or **anon**) key — not the service role key.
4. Put it in the repo-root `.env`:

   ```
   EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54331
   EXPO_PUBLIC_SUPABASE_KEY=sb_publishable_...
   ```

5. Restart Expo (`Ctrl+C` then `npm start`) so Metro reloads env.

### Hosted

1. Dashboard → **Project Settings → API**.
2. Copy Project URL and the anon / publishable key.
3. Point the app at them. For a local Expo session against hosted:

   ```
   EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   EXPO_PUBLIC_SUPABASE_KEY=eyJhbGciOi...
   ```

4. Restart Expo. For a store build, set the same names as EAS env vars rather than committing `.env`.

## Task: add a secret the Edge Functions can read

Scan needs `OPENAI_API_KEY`. Import does not. The CLI command `npx supabase secrets set` talks to a **linked hosted project**. This version of the CLI has **no `--local` flag**.

### Local (Docker)

1. Create the file the local functions runtime actually loads:

   ```bash
   cp supabase/.env.example supabase/functions/.env
   ```

2. Edit `supabase/functions/.env` (gitignored):

   ```
   OPENAI_API_KEY=sk-proj-your-real-key
   ```

3. Restart the stack so the function process picks it up:

   ```bash
   npm run db:stop && npm run db:start
   ```

Optional overrides the scan function also reads:

```
OPENAI_SCAN_MODEL=gpt-6-luna
OPENAI_IMAGE_MODEL=gpt-image-2.5-sunburst
```

Do not put `OPENAI_API_KEY` in the Expo `.env`.

If the function still says the key is missing, confirm the file is `supabase/functions/.env` (not only `supabase/.env`) and that you restarted after editing.

### Hosted

You must be logged in and linked:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
```

Set one secret:

```bash
npx supabase secrets set OPENAI_API_KEY=sk-proj-your-real-key
```

Or several from a gitignored file:

```bash
npx supabase secrets set --env-file supabase/functions/.env
```

List names (values are not printed):

```bash
npx supabase secrets list
```

Hosted functions read a new secret immediately; you do not need to redeploy for a key-only change.

To remove a hosted secret:

```bash
npx supabase secrets unset OPENAI_API_KEY
```

## Task: deploy Edge Functions to hosted

Functions live in `supabase/functions/<name>/index.ts`. Shared parsers are in `supabase/functions/_shared/`.

```bash
npx supabase functions deploy import-recipe
npx supabase functions deploy scan-recipe
```

Or both:

```bash
npx supabase functions deploy import-recipe scan-recipe
```

The app calls them with the user's JWT:

```ts
supabase.functions.invoke('scan-recipe', { body: { imageBase64, imageContentType } });
supabase.functions.invoke('import-recipe', { body: { url } });
supabase.functions.invoke('import-recipe', { body: { url, useAi: true } });
```

Kong requires `Authorization`. Both functions also reject missing `Authorization` with 401.

After changing function **code**, deploy again. After changing only a **secret**, skip deploy.

## Task: inspect local functions and logs

Studio: http://127.0.0.1:54333 → Edge Functions.

Or invoke from the machine that runs Docker (replace the key with the publishable one):

```bash
curl -i http://127.0.0.1:54331/functions/v1/scan-recipe \
  -H "Authorization: Bearer YOUR_ANON_OR_USER_JWT" \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"imageBase64\":\"...\",\"imageContentType\":\"image/jpeg\"}"
```

Docker function logs: `npx supabase functions logs` (hosted) or the Edge Functions container output after `npm run db:start`.

## Task: link this repo to a hosted project

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
```

That writes `.supabase` locally (gitignored). After that:

```bash
npx supabase db push                          # apply pending migrations remotely
npx supabase functions deploy import-recipe scan-recipe
npx supabase secrets set OPENAI_API_KEY=sk-proj-...
```

`db push` does **not** run `seed.sql`. Hosted starts empty; create a real user in the app or Dashboard.

## Auth URL (email confirmation)

Hosted Auth defaults Site URL to `http://localhost:3000`. Recipeek is not a website — confirmation must open the app.

| Setting | Value |
| --- | --- |
| Site URL | `recipeek://auth/callback` |
| Additional Redirect URLs | `recipeek://**`, `recipeek://auth/callback`, `exp://**` |

Sign-up sends `emailRedirectTo: recipeek://auth/callback`. Email templates use `{{ .RedirectTo }}?token_hash={{ .TokenHash }}`, not `{{ .ConfirmationURL }}` (that verifies on supabase.co then Chrome mangles the `recipeek://` bounce).

If the deep link fails (common in Expo Go), type the 6-digit code on `/confirm`.

Hosted **Free** projects using the default mailer cannot change email HTML. `supabase/templates/` is ready for when you add custom SMTP. Until then, the Confirm button still goes through supabase.co; Site URL + `emailRedirectTo` must still be `recipeek://auth/callback` so the bounce is into the app.

Dashboard: [URL Configuration](https://supabase.com/dashboard/project/zxcbiwkfknctkcoutkua/auth/url-configuration).

## Local Auth behaviour vs hosted

| Setting | Local (`config.toml`) | Hosted default |
| --- | --- | --- |
| Email confirmation | Off | On |
| Minimum password | 6 | 6+ (Dashboard) |
| Sign-up | Allowed | Allowed unless you disable it |

If hosted sign-up says “check your email”, either confirm via the inbox or turn off **Confirm email** under Authentication → Providers → Email while you are testing.

Local emails never leave the machine. Open Mailpit at http://127.0.0.1:54334.

## Studio

http://127.0.0.1:54333 — Table Editor, SQL, Auth users, Storage (`recipe-images`), function logs.

Prefer a new file in `supabase/migrations/` over editing tables only in Studio, or local and hosted will drift. See [database.md](./database.md).

## Common failures

| Symptom | Likely cause |
| --- | --- |
| `dockerDesktopLinuxEngine` / cannot list containers | Docker Desktop not running |
| App: missing `EXPO_PUBLIC_SUPABASE_*` | No `.env`, or Expo not restarted after creating it |
| Phone cannot reach API | Firewall; or Expo host is `127.0.0.1` so the rewrite never got a LAN IP — start Expo and open via QR on Wi-Fi |
| `OPENAI_API_KEY is not set` | Local file missing / wrong path, or stack not restarted |
| `supabase secrets set` asks you to pick a cloud project | That command is **hosted only**. For local, use `supabase/functions/.env` |
| RLS / “new row violates row-level security” | Signed-in JWT stale after `db:reset` — sign out and back in; or owner_id not set to `auth.uid()` |
| Function non-2xx | Read the JSON `error` field (the client unwraps `FunctionsHttpError` in `src/lib/function-error.ts`) |
