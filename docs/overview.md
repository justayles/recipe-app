# How Recipeek works

Recipeek is an Android-first cookbook app. You sign in with email, save recipes (ingredients, steps, photos, categories, labels), import from a URL, scan a magazine or cookbook page, add friends, and gift them recipes.

There are two runtimes, and they are not the same thing:

| Piece | What it is | How you run it |
| --- | --- | --- |
| **App** | Expo / React Native (Expo Router) | `npm start`, then Expo Go (or later an EAS build) |
| **Backend** | Supabase: Postgres, Auth, Storage, Realtime, Edge Functions | **Local:** Docker Desktop + `npm run db:start`. **Prod:** a hosted project at supabase.com |

The app never talks to OpenAI directly. Scan and URL-import go through Edge Functions so secrets stay off the phone.

Related docs: [README.md](./README.md) (index), [development.md](./development.md), [app.md](./app.md), [import.md](./import.md), [openai.md](./openai.md), [supabase.md](./supabase.md), [database.md](./database.md), [troubleshooting.md](./troubleshooting.md).

## Local vs production

```
Local
  phone / emulator / web
        │  EXPO_PUBLIC_SUPABASE_URL → http://<LAN-IP>:54331
        ▼
  Docker (supabase start)
    Postgres :54332
    API / Auth / Functions / Storage :54331
    Studio :54333
    Mailpit (fake inbox) :54334

Production
  Expo Go still works against hosted, or a store/APK build
        │  EXPO_PUBLIC_SUPABASE_URL → https://<project-ref>.supabase.co
        ▼
  Hosted Supabase project
    same schema (pushed migrations)
    same functions (deployed)
    secrets set in the Dashboard / CLI
```

Local Auth has email confirmation **off** (`enable_confirmations = false` in `supabase/config.toml`). Hosted projects have confirmation **on** by default, so a new sign-up will not get a session until the user clicks the email link (or you turn confirmation off in the hosted Auth settings while testing).

Local also seeds three test users. Hosted does not run `supabase/seed.sql` unless you apply it yourself. See [database.md](./database.md).

## Day-to-day local loop

1. Start **Docker Desktop** and wait until the engine is running. If it is not, `npm run db:start` fails with `dockerDesktopLinuxEngine: The system cannot find the file specified`.
2. In a terminal:

   ```bash
   npm run db:start
   ```

3. First time only: copy `.env.example` to `.env` and paste the **publishable** key from `npx supabase status` into `EXPO_PUBLIC_SUPABASE_KEY`. Keep `EXPO_PUBLIC_SUPABASE_URL` as `http://127.0.0.1:54331`.
4. In another terminal:

   ```bash
   npm start
   ```

5. Open Expo Go on a phone on the same Wi-Fi, or press `a` / `w` for Android / web.

The client rewrites `127.0.0.1` to your machine's LAN IP (from the Expo `hostUri`) so a physical phone can reach Docker. That logic lives in `src/lib/supabase.ts`. If the phone cannot connect, allow **54331** (API) and the Metro port (often **8081**, currently **8083** on this machine) through Windows Firewall.

Ports are offset from Listy so both apps can run at once. Full table in [supabase.md](./supabase.md).

## What the app does

### Screens (`src/app/`)

Expo Router. Every file under `src/app/` is a route. `_layout.tsx` files are navigators.

- `(auth)` — sign in / sign up. Shown when there is no session (`Stack.Protected`).
- `(app)/(tabs)` — Recipes, Import, Friends.
- `recipe/new`, `recipe/[id]`, `recipe/edit/[id]` — create, view, edit.

Non-route code stays outside `src/app/` (`src/components`, `src/hooks`, `src/lib`).

### Auth

Email + password via `supabase.auth`. Session is stored in AsyncStorage. A trigger on `auth.users` creates a `profiles` row (`handle_new_user`). Sign-in and sign-up live in `src/lib/auth.tsx`.

### Data access

TanStack Query hooks in `src/hooks/` call the Supabase JS client. Row Level Security is the real permission layer — the app uses the user's JWT, not the service role. Friends and gifts go through Postgres RPCs (`request_friend`, `respond_friend`, `gift_recipe`, `respond_gift`) because those flows need to write across users.

Realtime is enabled on `recipes`, `friendships`, and `gifts` so a second signed-in device updates without a pull-to-refresh.

### Import (URL)

Import tab → paste a BBC Food (or similar) URL → `import-recipe` Edge Function fetches the HTML, reads schema.org Recipe JSON-LD, downloads the hero image as base64, returns an `ImportedRecipe`. The app maps that onto the recipe form (`importedToDraft`) and you review before save.

If the function fails, the client falls back to fetching the page directly from the device (`importDirectly`). That fallback cannot run on a phone for many sites (CORS / TLS), which is why the function is the primary path. Instagram URLs skip the device fallback and skip JSON-LD: the function reads the caption from Open Graph tags and always calls `gpt-6-luna` (PostHog flag `instagram-import`). If scrape still fails, or the form looks wrong, **Try with AI** re-invokes `import-recipe` with `useAi: true` (compacted HTML → `gpt-6-luna`). Details in [import.md](./import.md).

### Scan (photo)

Import tab → Scan (only if PostHog flag `recipe-scan` is on) → camera or library → compress the page photo → `scan-recipe` Edge Function:

1. `gpt-6-luna` reads the page into the same JSON shape as URL import, plus whether the page has a dish photo and a crop box.
2. If that crop is usable, the app uses the dish shot from the page. Otherwise `gpt-image-2.5-sunburst` generates one.

If generation is needed and fails, the form still opens with a placeholder. Details in [openai.md](./openai.md).

### Saving a recipe

`useSaveRecipe` inserts/updates `recipes`, replaces ingredients/steps/labels, and if you picked or imported an image, uploads it to the public `recipe-images` bucket at `{userId}/{recipeId}/cover.jpg`. `image_path` on the recipe row is that storage path.

### Friends and gifts

- Add a friend by the email they used to sign up (`request_friend`).
- They accept or decline (`respond_friend`).
- Gift a recipe you own to an accepted friend (`gift_recipe`).
- They accept → `clone_recipe` copies title, ingredients, steps, labels, and image path into their account (`respond_gift`). Decline leaves their cookbook unchanged.

## Production shape (when you are ready)

The app code does not change. You point `.env` (or EAS secrets) at the hosted URL and anon/publishable key, push migrations, deploy functions, and set `OPENAI_API_KEY` on the **hosted** project.

Android APK for your phone (`preview` profile, internal distribution):

```bash
npx eas-cli@latest build --platform android --profile preview
```

Expo Go is enough while the backend is local Docker or a hosted project you already created.

## Repo map

| Path | Role |
| --- | --- |
| `src/app/` | Screens and layouts |
| `src/components/` | Recipe form, cards, UI |
| `src/hooks/` | TanStack Query + RPCs |
| `src/lib/` | Supabase client, auth, parsers, scan/import helpers |
| `supabase/config.toml` | Local ports, Auth, Storage |
| `supabase/migrations/` | Source of truth for schema |
| `supabase/seed.sql` | Local test users and recipes only |
| `supabase/functions/` | `import-recipe`, `scan-recipe` |
| `.env` | App-public Supabase URL + key (gitignored) |
| `supabase/functions/.env` | Local function secrets such as `OPENAI_API_KEY` (gitignored) |
