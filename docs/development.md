# Local development

Two processes, two terminals, Docker Desktop already running.

```bash
npm run db:start    # terminal A — Postgres, Auth, Functions, Studio
npm start           # terminal B — Expo Metro
```

Open Expo Go on a phone on the same Wi-Fi, or press `a` / `w` in Metro for Android / web.

First-time machine setup is in the root [README](../README.md). Backend details: [supabase.md](./supabase.md).

## Commands

| Command | What it does |
| --- | --- |
| `npm start` | Expo dev server |
| `npm run db:start` / `db:stop` | Start / stop local Supabase in Docker |
| `npm run db:reset` | Wipe local DB, replay migrations, re-seed Alice/Bob/Cara |
| `npm run db:types` | Regenerate `src/lib/database.types.ts` from local Postgres |
| `npm run typecheck` | `tsc --noEmit` |
| `npx expo lint` | ESLint on `src/` |
| `npx supabase status` | Local URLs and keys |
| `npx expo install <pkg>` | Add a native module at the SDK 58-compatible version — **not** `npm add` |
| `npx expo install --fix` | Align Expo package versions to this SDK |
| `npx expo-doctor` | Dependency / config health |

Expo ships breaking changes every SDK. Before touching an Expo API, read `package.json` (`expo` is `~58`) and the v58 docs — not training-data memories. Project rule: [AGENTS.md](../AGENTS.md).

This repo uses **npm** (`package-lock.json`), not bun. Use `npx`, not `bunx`.

## Expo Go vs a development build

Expo Go includes only the native modules it ships. Recipeek currently stays inside that set (Router, Image, ImagePicker, ImageManipulator, IntentLauncher, Clipboard, Font, Linking, Localization). **Scan and camera work in Expo Go.** `posthog-react-native` uses those Expo packages; it does not need a development build.

Add a library with extra native code and Expo Go will not load it. Then you need:

```bash
npx expo run:android
# or
npx eas-cli build --profile development --platform android
```

There is no `ios/` or `android/` folder on purpose (Continuous Native Generation). Do not create them by hand. Configure permissions and plugins in `app.json`.

Share-from-browser (`recipeek://import?url=`) is the feature most likely to need a dev build first.

## Environment files (do not mix them up)

| File | Loaded by | Contains |
| --- | --- | --- |
| `.env` (repo root) | Expo / Metro | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_KEY`, `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_HOST` |
| `supabase/functions/.env` | Local Edge Functions on `supabase start` | `OPENAI_API_KEY`, `POSTHOG_API_KEY`, `POSTHOG_HOST` |
| `supabase/.env` | Not the functions runtime (easy to confuse) | Prefer `functions/.env` |
| `*.example` | Humans | Placeholders only — never a real `sk-proj-` key |

Change `.env` → restart Metro. Change `supabase/functions/.env` → `npm run db:stop && npm run db:start`.

`EXPO_PUBLIC_*` is compiled into the bundle. Service role and OpenAI keys never go there.

## Phone on Wi-Fi

`src/lib/supabase.ts` rewrites `127.0.0.1` to the host in Expo’s `hostUri` (for example `192.168.1.229`). The phone then calls `http://192.168.1.229:54331`.

If that fails:

1. Phone and PC on the same LAN (not guest Wi-Fi isolation).
2. Windows Firewall inbound for **54331** (API) and Metro (**8081** or whatever `npm start` printed, e.g. **8083**).
3. Docker Desktop running; `npx supabase status` shows API on 54331.
4. `.env` still uses `127.0.0.1`, not a stale laptop IP from last week.

## Native permissions

`app.json` → `expo-image-picker` plugin:

- Photos: recipes and scanning a saved page
- Camera: scanning a magazine page

Expo Go already contains those permissions. A future dev/production build will pick them up from `app.json` at prebuild time.

## Task: add an Expo / native package

```bash
npx expo install expo-something
```

Then read https://docs.expo.dev/versions/v58.0.0/sdk/something/ (SDK 58). If the package needs a config plugin, add it under `expo.plugins` in `app.json`. If it is not in Expo Go, switch to a development build.

## Task: run lint and types before you call a change done

```bash
npx tsc --noEmit
npx expo lint
```

`supabase/functions` is excluded from the app `tsc` (`tsconfig.json`) because it is Deno. The editor uses `supabase/functions/tsconfig.json` instead (`npx tsc --noEmit -p supabase/functions`).

## Task: switch the app from local Docker to hosted (or back)

Edit `.env` URL + publishable key only. Restart Expo. Do not change function code. Hosted also needs migrations pushed, functions deployed, and `OPENAI_API_KEY` set — [supabase.md](./supabase.md).

After `db:reset` on local, **sign out and sign in** so the JWT matches the new `auth.users` ids.

## Production app binary

`eas.json` has a `preview` profile that builds an installable Android APK (internal distribution, no Metro).

```bash
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview
```

Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_KEY` on the Expo **preview** environment (hosted RecipeApp). Keep `OPENAI_API_KEY` on the hosted Supabase project, not in EAS public env. When the build finishes, open the Expo build page and tap **Install**.
