# The Expo app

Recipeek is an Expo SDK 58 / React Native app. Routes live under `src/app/` (Expo Router). Everything else — components, hooks, parsers — stays outside that folder.

Navigation, auth, and data fetching all run on the device. Postgres and Edge Functions do not.

See also [overview.md](./overview.md), [import.md](./import.md), [development.md](./development.md).

## Navigation

`src/app/_layout.tsx` wraps the tree in Auth + TanStack Query, then uses `Stack.Protected`:

- Signed in → `(app)`
- Signed out → `(auth)`
- `/` (`src/app/index.tsx`) redirects to `/recipes` or `/sign-in`

`(app)/_layout.tsx` is a stack: tabs plus recipe screens. It also starts Realtime (`useRealtimeSync`).

`(app)/(tabs)/_layout.tsx` is the tab bar:

| Tab | File | Role |
| --- | --- | --- |
| Recipes | `recipes.tsx` | Searchable list, add button, sign out |
| Import | `import.tsx` | Paste URL, Import, Scan (Scan only if PostHog flag `recipe-scan` is on) |
| Friends | `friends.tsx` | Requests, gifts, add-by-email |

Recipe routes (pushed on the stack, headers visible):

| Route | File |
| --- | --- |
| `/recipe/new` | `recipe/new.tsx` |
| `/recipe/[id]` | `recipe/[id].tsx` |
| `/recipe/edit/[id]` | `recipe/edit/[id].tsx` |

Deep link scheme is `recipeek` (`app.json`). Expo Go handles `recipeek://…` only loosely; a development build is the reliable target for share-from-browser later.

## Auth on the client

`src/lib/auth.tsx` holds the session in React context and AsyncStorage.

| Action | API |
| --- | --- |
| Sign in | `supabase.auth.signInWithPassword` |
| Sign up | `supabase.auth.signUp` with optional `display_name` in user metadata |
| Sign out | `supabase.auth.signOut` |

A DB trigger creates `profiles` from `auth.users`. Locally, confirmation is off so sign-up returns a session immediately. Hosted confirmation is on by default — the client throws “Check your email…” when `data.session` is null.

Query cache is cleared when `userId` changes so Alice’s recipes cannot flash on Bob’s login on the same device.

## Data on the client

Hooks in `src/hooks/` wrap Supabase + TanStack Query.

| Hook file | Reads / writes |
| --- | --- |
| `use-recipes.ts` | List, detail, save, delete, image upload |
| `use-labels.ts` | Per-user labels |
| `use-friends.ts` | `request_friend` / `respond_friend` RPCs |
| `use-gifts.ts` | `gift_recipe` / `respond_gift` RPCs |
| `use-realtime-sync.ts` | Invalidates queries on `recipes`, `friendships`, `gifts` changes |

The Supabase JS client uses the **user JWT**, never the service role. If a query returns empty or insert fails, it is almost always RLS, not a missing “admin” key. See [database.md](./database.md).

`src/lib/supabase.ts` builds the client from `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_KEY` and rewrites `127.0.0.1` to the Expo LAN host so a phone can reach Docker.

## Saving a recipe

`RecipeForm` (`src/components/recipe-form.tsx`) is shared by new and edit.

On submit, `useSaveRecipe`:

1. `insert` or `update` `recipes` (insert always sets `owner_id` to the signed-in user).
2. Delete and re-insert ingredients, steps, and `recipe_labels` (`replaceChildren`).
3. If `imageUri` or `imageBase64` is set, upload to `recipe-images` at `{userId}/{recipeId}/cover.jpg` and store that path on the row.

Empty ingredient/step lines are dropped. Labels are ids of rows in `labels` (created from the form’s “New label” modal).

Import and scan do **not** write the database themselves. They call `setRecipeDraft` then `router.push('/recipe/new')`. `takeRecipeDraft()` runs once when the new-recipe screen mounts.

If the form was filled from a URL (`source_url` starts with `http`), **Not right? Try again** at the bottom re-imports that URL with `useAi: true` and replaces the extracted fields. Notes and labels stay. The label is not “Try with AI” and there is no helper text — it is a fallback, not something to tap on every import. See [import.md](./import.md).

## Images in the UI

Priority in the form preview:

1. A photo you just picked (`imageUri`)
2. Base64 from import or scan (`imageBase64`)
3. Existing storage path (`existingImagePath`)
4. Placeholder (scan generation failed, or no photo)

Tapping the image asks for **Take photo** or **Photo library**. On Android, library opens the Gallery/Photos app (`ACTION_PICK`), not Drive or Files. That pick clears base64 and any scan notice so your photo is what gets uploaded.

List cards (`recipe-card.tsx`) show the storage public URL, or the first letter of the title on the badge colour.

## Friends and gifts in the UI

Friends tab:

- Type an email that already has a Recipeek account → `request_friend`
- Incoming pending rows: accept / decline
- Incoming gifts: accept (clones the recipe into your cookbook) / decline
- Tab badge = pending friend requests to you + pending gifts to you

Recipe detail: gift icon opens `gift-modal.tsx` (accepted friends only). You cannot gift to yourself or to a non-friend; the RPC enforces that even if the UI is wrong.

## Task: add a screen

1. Add a file under `src/app/` so Expo Router owns the URL. Example: `src/app/(app)/recipe/print/[id].tsx` → `/recipe/print/123`.
2. Register a `Stack.Screen` in `(app)/_layout.tsx` if you need a custom title.
3. Keep fetch logic in `src/hooks/`, not in the route file, if another screen will reuse it.
4. Do not put helper components in `src/app/`.

## Task: add a field to the recipe form

1. Migration + types first ([database.md](./database.md)).
2. Add it to `RecipeInput` in `use-recipes.ts` and to the save `payload`.
3. Add state + input in `recipe-form.tsx`.
4. Map it in `importedToDraft` if import/scan should fill it.

## Task: change colours or type

Theme tokens: `src/lib/theme.ts` (light / dark).
Fonts: Fraunces (display) and Nunito Sans (UI) via `src/lib/fonts.ts`.
Categories/colours for chips: `src/lib/categories.ts`.
