# URL import

Paste a recipe page URL on the Import tab. The app tries to turn schema.org Recipe JSON-LD into the same form as a hand-entered recipe. Scanning a photo is a different pipeline ([openai.md](./openai.md)).

The first import is always a scrape (no OpenAI). If that fails, or the form looks wrong, **Try with AI** / **Not right? Try again** sends a compacted copy of the page HTML to `gpt-6-luna`. OpenAI does not fetch the URL itself. The form label is deliberately not “AI” — it is a fallback, not something to tap on every import.

## What “a recipe URL” means

The parser looks for `<script type="application/ld+json">` blocks, walks `@graph` / arrays, and takes the first node with `@type` Recipe (including `"Recipe"` inside an array of types).

Sites that usually work: BBC Food, BBC Good Food, and most publishers that ship a Recipe schema (NYT Cooking, many blogs).

A page with only a blog post and no Recipe JSON-LD fails with “Could not find a recipe on that page.”

Fallback if JSON-LD is missing a field: `og:title`, `og:description`, `og:image` / `twitter:image`.

## Client flow

`src/app/(app)/(tabs)/import.tsx`

1. Paste (clipboard) or type a URL. Share text is OK — `extractUrlFromShareText` pulls the first `http(s)://…`.
2. **Import** calls `importRecipeFromUrl` (`src/lib/import-recipe.ts`).
3. That invokes the `import-recipe` Edge Function with `{ url }` (scrape only).
4. If the function throws, the client fetches the HTML **from the device** and runs the same parser (`importDirectly`). That fallback is useful on web; phones often cannot fetch third-party recipe sites (CORS / TLS). Prefer a working function. Device fallback is scrape-only — it cannot call OpenAI.
5. `importedToDraft` maps `ImportedRecipe` onto `RecipeFormValue` and `setRecipeDraft`.
6. Navigate to `/recipe/new`. You still have to tap Save.

The hero image is downloaded **inside the function** (base64, max 4 MB) so the phone does not have to fetch a hotlinked CDN that blocks mobile clients. If that download fails, the recipe still opens without a photo.

## Function flow

`supabase/functions/import-recipe/index.ts`

1. Require `Authorization`.
2. Validate `https?` URL.
3. `fetch` the page with a Chrome-like User-Agent (some sites 403 bots).
4. `parseRecipeHtml` (`supabase/functions/_shared/parse-recipe.ts` — keep in sync with `src/lib/parse-recipe.ts`). See below for headings and step cleanup.
5. If the body included `useAi: true`, compact the HTML and extract with `gpt-6-luna` instead (see **Try with AI**). The site hero image still comes from scrape / `og:image`, not from the model.
6. Optionally fetch `recipe.imageUrl` → base64.
7. Return `{ recipe, imageBase64, imageContentType }`.

Parser mapping:

| JSON-LD | Form field |
| --- | --- |
| `name` | title |
| `description` | description |
| `recipeIngredient` | ingredients (fallback when the page has no grouped recipe card) |
| `recipeInstructions` HowToStep / HowToSection / strings | steps (`HowToSection` names become headings) |
| `recipeYield` | servings |
| `prepTime` / `cookTime` ISO-8601 durations | minutes |
| `recipeCategory` (heuristic) | category enum |
| `recipeCuisine` | cuisine |
| `image` | imageUrl, then downloaded |

`sourceName` is the page hostname. `sourceUrl` is the URL you pasted.

## Try with AI

Do not send every URL through OpenAI. Scrape first; spend tokens only when the user asks. Do not advertise this as an AI feature on the form — people will tap it on every import if the button says “AI”.

| Surface | When it shows | Button |
| --- | --- | --- |
| Import tab | After scrape (and device fallback) fails | **Try with AI** |
| Recipe form (new and edit) | `source_url` is `http(s)://…` | **Not right? Try again** |

The form label is **Not right? Try again**, not “Try with AI”. There is no helper copy under it. It is a quiet fallback for a bad scrape (missing headings, ingredients glued onto steps, empty method), not a second import mode to try first.

The Import tab may say **Try with AI** because that control only appears after scrape has already failed — there is no cheaper retry left.

Scanned pages have an empty `source_url`, so they do not get the form button. Notes and labels on the form are kept; title, ingredients, steps, times, and the site photo are replaced.

`importRecipeFromUrl(url, { useAi: true })` calls the same `import-recipe` function with `{ url, useAi: true }`. There is no client-side GPT path.

The function:

1. Fetches the page (same as scrape).
2. Compacts it (`compactRecipePage` in `supabase/functions/_shared/extract-recipe-from-page.ts`): JSON-LD, a recipe-card HTML slice (WPRM / Tasty / etc. if present), then stripped page text, capped at 24k characters. Full blog HTML is not sent.
3. `gpt-6-luna` (`OPENAI_SCAN_MODEL`) returns the same recipe JSON as scan, without dish-photo / `visualPrompt` fields. No image is generated.
4. Hero image is the scraped / `og:image` URL downloaded as base64.

Needs `OPENAI_API_KEY` on the function host, same secret as scan.

## Ingredient headings and leftover ingredients in steps

The default URL import is still a scraper. OpenAI is only for scan, or for **Try with AI** after the scrape is wrong or missing. A recipe URL already has a card and/or schema.org JSON-LD, so the model is a fallback, not the first pass.

The parser is not special-cased to one site. Two rules run on every scrape.

### Ingredient headings

If the HTML contains WP Recipe Maker groups (`wprm-recipe-ingredient-group`), those are used instead of JSON-LD `recipeIngredient`.

Each group becomes:

- a heading from `wprm-recipe-ingredient-group-name` (skipped if it is just “Ingredients”)
- then the amount / unit / name / notes lines in that group

That plugin is what a lot of WordPress blogs use. Any WPRM page with groups such as “Dry Rub”, “For the marinade”, or “Sauce” gets the same heading treatment as a scan.

If there is no WPRM card, JSON-LD is used, then the same heading heuristic as scan (`looksLikeIngredientHeading`):

- starts with `For …`
- `To serve` / `To garnish`
- ends with `:` and has no digits

BBC-style sites keep working. They usually import as a flat list, because schema.org does not model ingredient groups.

Tasty, NYT Cooking, and similar sites that only publish a flat `recipeIngredient` array also stay flat, unless the strings themselves look like headings. There is no scraper for every other recipe plugin.

### Ingredient dumps glued onto steps

JSON-LD `HowToStep.text` is often one blob: the instruction, then every ingredient, with no space (`ribs.2½ pounds…`). That is a plugin bug, not unique to one publisher.

For each non-heading step, `stripTrailingIngredientDump` looks for `.` `!` or `?` immediately followed by a number or fraction. The remainder is dropped only if **either**:

- it looks like a list of quantities (`2+` matches of number + unit, and no cooking verbs such as bake / stir / until), **or**
- at least two of the already-parsed ingredient names appear in that remainder

The cut is skipped unless the instruction before that point is longer than 40 characters, so a step that *is* “2½ pounds pork ribs” is not emptied.

## Deep link / bookmarklet

Scheme: `recipeek`.

```
recipeek://import?url=https%3A%2F%2Fwww.bbc.co.uk%2Ffood%2Frecipes%2F...
```

`import.tsx` listens to `Linking` and fills the text field. It does not auto-import.

A development build is required before “Share to Recipeek” from Chrome is reliable. Expo Go may open the app but drop the query string. There is no share-intent plugin installed yet.

## Task: import a BBC Food recipe

1. Local stack + Expo running, signed in.
2. On the phone or PC browser, copy the recipe URL.
3. Import tab → Paste → Import.
4. Check title, ingredients, steps, photo on the form.
5. Save.

If the function returns 422, read the `error` string (the client unwraps `FunctionsHttpError` via `src/lib/function-error.ts`). Typical causes: site returned 403/404, or no Recipe JSON-LD. The Import tab then offers **Try with AI**.

## Task: support another site that uses JSON-LD

Usually nothing to do — the walker already accepts `@graph` and multi-type nodes.

If a site wraps instructions oddly, or uses another grouped HTML card (not WPRM), extend `collectSteps` / `collectWprmIngredients` in **both**:

- `src/lib/parse-recipe.ts` (client fallback)
- `supabase/functions/_shared/parse-recipe.ts` (function)

Keep those files the same. After changing the function copy, restart local functions (`db:stop` / `db:start` or the functions container hot-reload) and, for hosted, `npx supabase functions deploy import-recipe`.

## Task: test the parser without the app

There is no CLI fixture for URL import (scan used to have one; it was removed). Fastest check:

```bash
curl -sL "https://www.bbc.co.uk/food/recipes/..." | head
```

Then invoke the local function with a user JWT, or temporarily call `parseRecipeHtml` from a Deno/Node snippet against saved HTML. Leave `useAi` off unless you are testing the rescue path (that one needs `OPENAI_API_KEY`).

## Scan vs import (same form, different backends)

| | Import (scrape) | Import (Try with AI) | Scan |
| --- | --- | --- | --- |
| Input | Page URL | Same URL, user tapped retry | Camera / library photo of a printed page |
| Function | `import-recipe` `{ url }` | `import-recipe` `{ url, useAi: true }` | `scan-recipe` |
| Extraction | schema.org JSON-LD + WP Recipe Maker groups | Compacted HTML → `gpt-6-luna` | `gpt-6-luna` vision + JSON schema |
| Photo | Site’s hero image | Site’s hero image | Crop of page dish, else generated (`gpt-image-2.5-sunburst`) |
| `sourceName` | Hostname | Hostname | `Scanned page` |
| Needs `OPENAI_API_KEY` | No | Yes | Yes |

Both import modes and scan end at `/recipe/new` through `importedToDraft`.
