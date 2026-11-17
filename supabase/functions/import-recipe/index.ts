import { parseRecipeHtml } from '../_shared/parse-recipe.ts';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = req.headers.get('Authorization');
  if (!auth) return json({ error: 'Unauthorized' }, 401);

  let url: string;
  try {
    const body = (await req.json()) as { url?: string };
    url = typeof body.url === 'string' ? body.url.trim() : '';
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
    const page = await fetch(parsedUrl.toString(), {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
      redirect: 'follow',
    });
    if (!page.ok) {
      return json({ error: `The site returned ${page.status}. Try copying the recipe in by hand.` }, 422);
    }
    const html = await page.text();
    const recipe = parseRecipeHtml(html, parsedUrl.toString());

    let imageBase64: string | null = null;
    let imageContentType: string | null = null;
    if (recipe.imageUrl) {
      try {
        const image = await fetch(recipe.imageUrl, {
          headers: { 'User-Agent': UA, Accept: 'image/*', Referer: parsedUrl.toString() },
        });
        if (image.ok) {
          const buffer = new Uint8Array(await image.arrayBuffer());
          if (buffer.byteLength > 0 && buffer.byteLength <= 4_000_000) {
            imageBase64 = bytesToBase64(buffer);
            imageContentType = image.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg';
          }
        }
      } catch {
        // Image is optional — keep the recipe even if the photo cannot be fetched.
      }
    }

    return json({ recipe, imageBase64, imageContentType });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not read that recipe page';
    return json({ error: message }, 422);
  }
});
