# OpenAI: scanning a cookbook page

OpenAI is used by `scan-recipe` (always), by Instagram imports (always, caption → `gpt-6-luna`), and by `import-recipe` when the client sends `{ url, useAi: true }` after a scrape the user rejected or that failed. The Expo app never holds an OpenAI key. The default URL import for recipe websites does not call OpenAI. On the recipe form that website retry is labelled **Not right? Try again** (not “AI”) so it is not treated as a feature to tap on every import. Details in [import.md](./import.md).

See also [overview.md](./overview.md) and [supabase.md](./supabase.md) for how secrets are loaded.

## Feature flag (`recipe-scan`)

The Scan button and the `scan-recipe` function are off unless the PostHog boolean flag **`recipe-scan`** is true for the signed-in user. Website URL import is not gated. Instagram import is a separate flag, **`instagram-import`** (same PostHog project; create it the same way).

While flags are loading, or if PostHog is not configured, Scan stays hidden. The Edge Function also checks the same flag and returns 403 if it is off, so the camera path cannot be invoked around the UI.

1. In PostHog: **Feature flags → New** → key `recipe-scan` (boolean). Enable it for the people who should see Scan (or 100% when you are ready).
2. App `.env`: `EXPO_PUBLIC_POSTHOG_KEY` (project `phc_…` key) and `EXPO_PUBLIC_POSTHOG_HOST` (`https://us.i.posthog.com` or `https://eu.i.posthog.com`). Restart Metro.
3. Functions already use `POSTHOG_API_KEY` / `POSTHOG_HOST` in `supabase/functions/.env` (same project). After changing `scan-recipe`, deploy it.

The app identifies as the Supabase user id so you can target that person in PostHog. Autocapture of screens and touches is off; this provider exists for flags.

## Why two models

A single OpenAI call cannot return both strict JSON and a generated image file. Scan is therefore:

1. **Extract** — vision model reads the page photo and returns structured recipe JSON (`gpt-6-luna` by default), including whether the page has a usable dish photograph and a crop box (fractions 0–1).
2. **Photo** — if that crop is large enough, the app crops the dish out of the page you photographed. Only if there is no usable dish shot does it call `gpt-image-2.5-sunburst` with `visualPrompt`.

If generation is needed and fails, the recipe still opens with a placeholder.

## JSON shape (must match URL import)

The extractor is constrained with Structured Outputs (`text.format` json_schema, `strict: true`). Fields match `ImportedRecipe` in `src/lib/parse-recipe.ts`, plus `visualPrompt` which is stripped before the form:

| Field | Type | Notes |
| --- | --- | --- |
| `title` | string | Required |
| `description` | string \| null | |
| `servings`, `prepMinutes`, `cookMinutes` | number \| null | |
| `category` | enum \| null | `starter` `main` `side` `dessert` `snack` `drink` `other` |
| `cuisine` | string \| null | |
| `ingredients` | `{ kind, text }[]` | `item` lines, plus `heading` rows when the page groups them (e.g. For the marinade) |
| `steps` | `{ kind, text }[]` | `item` lines, plus `heading` rows when the method is grouped (e.g. For the stew) |
| `visualPrompt` | string | Photorealistic dish description, used only when there is no page photo |
| `hasDishPhoto` | boolean | True when the page includes a photo of the finished dish |
| `dishPhotoLeft/Top/Width/Height` | number 0–1 | Tight crop of that photo |

The function then maps that to:

```ts
{
  title, description, servings, prepMinutes, cookMinutes,
  category, cuisine, ingredients, steps,
  sourceUrl: '',
  sourceName: 'Scanned page',
  imageUrl: null,
}
```

plus either a crop of the page photo, or `imageBase64` from image generation (`imageGenerationFailed: true` only if generation was attempted and failed).

`importedToDraft()` turns that into the same `RecipeFormValue` as URL import. On failure it also sets `imageNotice` so the form can show the placeholder copy.

## Cost (budget models)

Roughly **$0.0053 per scan** (about 185 recipes per $1), almost all of it the image:

| Step | Default model | Role |
| --- | --- | --- |
| Extract | `gpt-6-luna` | Cheap multimodal JSON. `gpt-5-nano` is cheaper still; `gpt-5.4-nano` is better on messy/handwritten pages. |
| Image | `gpt-image-2.5-sunburst` | `quality=low`, `1024x1024`, JPEG. `gpt-image-1-mini` is similar price but scheduled to shut down **1 Dec 2026**. |

Override locally or on hosted without code changes:

```
OPENAI_SCAN_MODEL=gpt-5-nano
OPENAI_IMAGE_MODEL=gpt-image-2.5-sunburst
```

## Task: create an OpenAI API key

ChatGPT Plus is **not** an API key. Billing is on the API platform.

1. Open [platform.openai.com](https://platform.openai.com/) and sign in.
2. Add a payment method and a few dollars of credit under Billing. Scan will fail with a quota error if the project has $0.
3. [platform.openai.com/api-keys](https://platform.openai.com/api-keys) → **Create new secret key**.
4. Name it `recipeek-local` (or `recipeek-hosted`). Permissions **All** is enough.
5. Copy the `sk-proj-...` value immediately. You cannot view it again.
6. First key on a new account may require phone verification.

Do not commit the key, put it in the Expo `.env`, or paste it into `supabase/.env.example`.

## Task: give the local function the key

`npx supabase secrets set` does **not** configure Docker. That command uploads to a **linked hosted** project (this CLI has no `--local` flag).

```bash
cp supabase/.env.example supabase/functions/.env
```

Edit `supabase/functions/.env`:

```
OPENAI_API_KEY=sk-proj-your-real-key
```

Restart so the Edge Runtime reloads env:

```bash
npm run db:stop && npm run db:start
```

Docker Desktop must already be running. Details: [supabase.md](./supabase.md).

## Task: give the hosted function the key

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase secrets set OPENAI_API_KEY=sk-proj-your-real-key
```

Or from the same gitignored file you use locally:

```bash
npx supabase secrets set --env-file supabase/functions/.env
```

Confirm the name exists:

```bash
npx supabase secrets list
```

Hosted functions pick up a new secret without a redeploy. Redeploy only after you change `scan-recipe` **code**:

```bash
npx supabase functions deploy scan-recipe
```

## Task: scan a page in the app

1. Local stack running, OpenAI key loaded, Expo running, signed in.
2. PostHog flag `recipe-scan` on for that user. Import tab → **Scan**.
3. Camera or photo library. Crop to the recipe if you can.
4. The client (`src/lib/scan-recipe.ts`) compresses to ~1280px JPEG, then `functions.invoke('scan-recipe')`.
5. Wait — two OpenAI calls, often 10–30 seconds.
6. Review the form. Save uploads the generated (or your) photo to `recipe-images`.

If generation failed: restaurant placeholder in the image slot and a notice under it. Tap to take a photo or pick one from your gallery, or save with no image (list cards already show a letter placeholder).

## What the function sends to OpenAI

**Extract** — `POST https://api.openai.com/v1/responses`

- Model: `OPENAI_SCAN_MODEL` or `gpt-6-luna`
- `reasoning.effort: low`
- Input: instruction text + `input_image` as a `data:image/jpeg;base64,...` URL, `detail: high`
- Output: JSON matching `RECIPE_SCHEMA`

**Generate** — `POST https://api.openai.com/v1/images/generations`

- Model: `OPENAI_IMAGE_MODEL` or `gpt-image-2.5-sunburst`
- `prompt`: `visualPrompt` from step 1
- `quality: low`, `size: 1024x1024`, `output_format: jpeg`, `n: 1`
- Reads `data[0].b64_json`

The cookbook page itself is **not** cropped into the recipe image; the dish photo is generated.

## Failures and what they mean

| Message / behaviour | What to do |
| --- | --- |
| `OPENAI_API_KEY is not set` | Local: file path + restart. Hosted: `secrets set` on the right project. |
| Quota / insufficient credits | Add credit on platform.openai.com Billing. |
| Model not found | Project may not have that model enabled; try `OPENAI_SCAN_MODEL=gpt-5-nano` or check the dashboard. |
| Could not read a recipe title / empty ingredients | Closer, well-lit photo; crop to one recipe; messy handwriting may need `gpt-5.4-nano`. |
| Placeholder + notice on the form | Image API failed; recipe JSON is still there. Upload your own photo if you want. |
| Function non-2xx / timeout | Image + JSON payload is large; compression should keep it down. Check Docker function logs. Phone DNS is not involved — OpenAI is called from the function host (your PC locally, Supabase in prod). |

## Security

- Rotate a key from the OpenAI dashboard if it was committed, pasted into chat, or put in `.env.example`.
- `.gitignore` covers `supabase/.env` and `supabase/functions/.env`.
- Example files must keep `OPENAI_API_KEY=sk-...` as a placeholder only.
