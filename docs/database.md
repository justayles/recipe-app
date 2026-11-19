# Database

Postgres 17, schema owned as SQL files in `supabase/migrations/`. The TypeScript types in `src/lib/database.types.ts` are generated from whatever is currently running locally. Do not hand-edit that types file.

See also [overview.md](./overview.md) and [supabase.md](./supabase.md).

## What exists

### Tables

| Table | Purpose |
| --- | --- |
| `profiles` | One row per `auth.users` row (`id` matches). Email + display name. Created by trigger `on_auth_user_created`. |
| `friendships` | Pair of profile ids, `pending` or `accepted`. Unique on the unordered pair. |
| `recipes` | Title, description, source, `image_path`, timings, category, cuisine, notes, optional gift provenance (`gifted_from_*`). |
| `recipe_ingredients` | Ordered `item` strings (`position`), plus `is_heading` for section titles such as “For the marinade”. |
| `recipe_steps` | Ordered `body` strings (`position`), plus `is_heading` for method section titles such as “For the stew”. |
| `labels` | Per-owner tags (name + colour). Unique per owner, case-insensitive. |
| `recipe_labels` | Many-to-many recipe ↔ label. |
| `gifts` | Pending / accepted / declined gift of a recipe from one user to another. |

Categories allowed on `recipes.category`: `starter`, `main`, `side`, `dessert`, `snack`, `drink`, `other`.

### RPCs the app calls

These are `SECURITY DEFINER` so they can insert across users without opening broad RLS writes.

| Function | Called from | Does |
| --- | --- | --- |
| `request_friend(p_email)` | Friends tab | Looks up a profile by email, inserts `pending`, or auto-accepts if they already requested you. |
| `respond_friend(p_friendship_id, p_accept)` | Friends tab | Addressee only: accept or delete. |
| `gift_recipe(p_recipe_id, p_to_user_id, p_message)` | Recipe detail | Owner + accepted friend only; one pending gift per pair/recipe. |
| `respond_gift(p_gift_id, p_accept)` | Friends / gifts | Recipient: decline, or `clone_recipe` into their account. |
| `clone_recipe(...)` | Internal | Copies recipe, ingredients, steps, and recreates labels by name for the new owner. |

Helpers used inside policies (not called from the app): `are_friends`, `can_see_profile`, `can_view_recipe`, `is_recipe_owner`.

### Storage

Bucket `recipe-images` (public read, 10 MB, jpeg/png/webp/gif/heic). Upload path must start with the current user's id:

```
{auth.uid()}/{recipeId}/cover.jpg
```

`recipes.image_path` stores that object path. `recipeImageUrl()` in `src/lib/images.ts` turns it into a public URL.

### Realtime

Publication includes `recipes`, `friendships`, `gifts` so list screens update live.

## Row Level Security (how permission actually works)

Anon has no grants on app tables. Authenticated users get CRUD only where a policy allows it.

- **Recipes:** owner can select/insert/update/delete. Select also if `can_view_recipe` (you own it, or there is a gift of that recipe **to you**). Gift recipients can read the source recipe while the gift exists; they do not become co-owners.
- **INSERT … RETURNING:** Postgres applies the SELECT policy to the new row in the same statement. `can_view_recipe` is `STABLE` and cannot see an in-flight insert, so `recipes_select` also allows `owner_id = auth.uid()` directly (`20261030140000_fix_recipes_select_rls.sql`). Always set `owner_id` to the current user on insert (the hooks do this).
- **Ingredients / steps / recipe_labels:** readable if you can view the parent recipe; writable only if you own it.
- **Profiles:** visible if you are them, you share a friendship (pending or accepted), or you share a gift. That is why a pending request still shows a name.
- **Friendships / gifts:** you only see rows you are on. Writes go through RPCs, not client inserts.

If a save fails with “new row violates row-level security”, sign out and in after a `db:reset` (stale JWT) and confirm the insert includes `owner_id`.

## Local data: seed users

`supabase/seed.sql` runs on `supabase start` and `supabase db reset` **locally only**. Password for all: `password123`.

| Email | State |
| --- | --- |
| `alice@example.com` | Two recipes, friends with Bob, pending request from Cara |
| `bob@example.com` | Pending gift of Alice's tomato pasta |
| `cara@example.com` | Waiting for Alice to accept |

Hosted projects do not get this seed unless you run the SQL yourself in the Dashboard (usually you should not; create real accounts in the app).

## How schema changes reach a database

Migrations are the source of truth. Filename:

```
supabase/migrations/YYYYMMDDHHMMSS_short_name.sql
```

Never edit a migration that has already been applied to a database you care about (local volume or hosted). Add a new file instead.

`supabase start` / `db reset` apply files in timestamp order. Hosted applies them when you `db push`.

## Task: add a column (example)

Suppose recipes need `difficulty text`.

1. Create a new migration. Use a timestamp after the latest existing file:

   ```bash
   npx supabase migration new add_recipe_difficulty
   ```

2. Put SQL in the generated file:

   ```sql
   alter table public.recipes
     add column difficulty text
     check (difficulty is null or difficulty in ('easy', 'medium', 'hard'));
   ```

3. Apply it **locally** (keeps existing rows):

   ```bash
   npx supabase migration up
   ```

   Or, if you are fine wiping local data and re-seeding:

   ```bash
   npm run db:reset
   ```

4. Regenerate TypeScript types from the local DB:

   ```bash
   npm run db:types
   ```

5. Use the new field in `src/lib/database.types.ts` consumers (form, hooks). Do not type it by hand in that file — regenerate.

6. When you want it on hosted:

   ```bash
   npx supabase db push
   ```

   `db push` applies pending migrations only. It does not copy local seed recipes.

## Task: add a table, policy, or RPC

Same as a column: new migration file, `migration up` or `db reset`, `npm run db:types`, then `db push` for hosted.

Checklist for a new table the app will query:

- `enable row level security`
- policies for `authenticated` (almost never `anon`)
- `grant` the needed privileges to `authenticated`
- `revoke` from `anon` if you added grants at schema level
- if it should appear in realtime: `replica identity full` and `alter publication supabase_realtime add table ...`

For writes that span users (invite, gift, share), prefer a `security definer` RPC with `auth.uid()` checks, like `gift_recipe`.

## Task: inspect or tweak data locally

Studio SQL editor: http://127.0.0.1:54333

Or `psql` (port **54332**, not 5432):

```bash
npx supabase status           # shows DB URL
# or
psql postgresql://postgres:postgres@127.0.0.1:54332/postgres
```

Local Studio is fine for looking at rows. If you change **schema** in Studio, capture it as a migration (`npx supabase db diff -f some_name`) so hosted can get the same change. Do not rely on Studio-only schema edits.

## Task: reset local DB

```bash
npm run db:reset
```

This drops local schemas, replays all migrations, runs `seed.sql`. Sign out of the app afterwards — old JWTs refer to user ids that no longer exist, which shows up as mysterious RLS failures.

## Task: update hosted DB

```bash
npx supabase link --project-ref YOUR_PROJECT_REF   # once
npx supabase db push
```

To see what would apply:

```bash
npx supabase db push --dry-run
```

Pull remote schema into types only if you are generating from hosted (this project uses `--local`):

```bash
npm run db:types    # supabase gen types typescript --local
```

## Task: add an index or tighten a check

New migration, same as a column. Example:

```sql
create index recipes_category_idx on public.recipes (owner_id, category);
```

Apply locally, then `db push`.

## Migrations already in the repo

| File | What it did |
| --- | --- |
| `20261030000000_init.sql` | Full schema, RPCs, RLS, storage bucket, realtime |
| `20261030140000_fix_recipes_select_rls.sql` | Owner can SELECT their own row on INSERT … RETURNING |

## App mapping

| Concern | Code |
| --- | --- |
| Generated types | `src/lib/database.types.ts` |
| Recipes CRUD + image upload | `src/hooks/use-recipes.ts`, `src/lib/images.ts` |
| Labels | `src/hooks/use-labels.ts` |
| Friends RPCs | `src/hooks/use-friends.ts` |
| Gifts RPCs | `src/hooks/use-gifts.ts` |
| Form fields | `src/components/recipe-form.tsx` (`RecipeInput`) |
