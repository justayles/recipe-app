import {
  compactRecipePage,
  extractRecipeFromPage,
  importedRecipeFromExtracted,
  ogImageFromHtml,
  openaiKey,
} from '../_shared/extract-recipe-from-page.ts';
import { parseRecipeHtml, type ImportedRecipe } from '../_shared/parse-recipe.ts';
import { requestDistinctId } from '../_shared/posthog-ai.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function hostName(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

async function fetchPage(url: string): Promise<string> {
  const page = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-GB,en;q=0.9',
    },
    redirect: 'follow',
  });
  if (!page.ok) {
    throw new Error(`The site returned ${page.status}. Try copying the recipe in by hand.`);
  }
  return page.text();
}

async function downloadHeroImage(
  imageUrl: string | null,
  referer: string,
): Promise<{ imageBase64: string | null; imageContentType: string | null }> {
  if (!imageUrl) return { imageBase64: null, imageContentType: null };
  try {
    const image = await fetch(imageUrl, {
      headers: { 'User-Agent': UA, Accept: 'image/*', Referer: referer },
    });
    if (!image.ok) return { imageBase64: null, imageContentType: null };
    const buffer = new Uint8Array(await image.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > 4_000_000) {
      return { imageBase64: null, imageContentType: null };
    }
    return {
      imageBase64: bytesToBase64(buffer),
      imageContentType: image.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg',
    };
  } catch {
    return { imageBase64: null, imageContentType: null };
  }
}

async function scrapeRecipe(html: string, sourceUrl: string): Promise<ImportedRecipe | null> {
  try {
    return parseRecipeHtml(html, sourceUrl);
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = req.headers.get('Authorization');
  if (!auth) return json({ error: 'Unauthorized' }, 401);

  let url: string;
  let useAi = false;
  try {
    const body = (await req.json()) as { url?: string; useAi?: boolean };
    url = typeof body.url === 'string' ? body.url.trim() : '';
    useAi = body.useAi === true;
  } catch {
    return json({ error: 'Expected JSON body with a url' }, 400);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return json({ error: 'That does not look like a valid URL' }, 400);
  }
  if (!/^https?:$/.test(parsedUrl.protocol)) {
    return json({ error: 'Only http(s) recipe URLs are supported' }, 400);
  }

  try {
    const html = await fetchPage(parsedUrl.toString());

    let recipe: ImportedRecipe;
    if (useAi) {
      const scraped = await scrapeRecipe(html, parsedUrl.toString());
      const extracted = await extractRecipeFromPage(compactRecipePage(html), openaiKey(), {
        distinctId: requestDistinctId(auth),
        traceId: crypto.randomUUID(),
      });
      recipe = importedRecipeFromExtracted(
        extracted,
        parsedUrl.toString(),
        hostName(parsedUrl.toString()),
        scraped?.imageUrl ?? ogImageFromHtml(html),
      );
    } else {
      recipe = parseRecipeHtml(html, parsedUrl.toString());
    }

    const { imageBase64, imageContentType } = await downloadHeroImage(
      recipe.imageUrl,
      parsedUrl.toString(),
    );
    return json({ recipe, imageBase64, imageContentType, usedAi: useAi });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not read that recipe page';
    return json({ error: message }, 422);
  }
});
