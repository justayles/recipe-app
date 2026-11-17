import { parseScanText } from '../_shared/parse-scan.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function ocrSpace(base64: string, apiKey: string): Promise<string> {
  const body = new URLSearchParams({
    apikey: apiKey,
    language: 'eng',
    isOverlayRequired: 'false',
    OCREngine: '2',
    scale: 'true',
    base64Image: `data:image/jpeg;base64,${base64}`,
  });

  const response = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(40_000),
  });
  if (!response.ok) {
    throw new Error(`OCR service returned ${response.status}`);
  }
  const payload = (await response.json()) as {
    IsErroredOnProcessing?: boolean;
    ErrorMessage?: string | string[];
    ErrorDetails?: string | string[];
    ParsedResults?: { ParsedText?: string }[];
  };
  if (payload.IsErroredOnProcessing) {
    const raw = payload.ErrorMessage ?? payload.ErrorDetails;
    const message = Array.isArray(raw) ? raw.join(' ') : raw;
    throw new Error(message || 'OCR could not read that photo');
  }
  const text = (payload.ParsedResults ?? []).map((row) => row.ParsedText ?? '').join('\n').trim();
  if (!text) throw new Error('OCR did not find any text on that page');
  return text;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = req.headers.get('Authorization');
  if (!auth) return json({ error: 'Unauthorized' }, 401);

  let imageBase64 = '';
  let imageContentType = 'image/jpeg';
  let ocrText = '';
  let ocrApiKey = '';
  try {
    const body = (await req.json()) as {
      imageBase64?: string;
      imageContentType?: string;
      ocrText?: string;
      ocrApiKey?: string;
    };
    imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64.replace(/^data:[^;]+;base64,/, '') : '';
    imageContentType = body.imageContentType?.split(';')[0] || 'image/jpeg';
    ocrText = typeof body.ocrText === 'string' ? body.ocrText.trim() : '';
    ocrApiKey = typeof body.ocrApiKey === 'string' ? body.ocrApiKey.trim() : '';
  } catch {
    return json({ error: 'Expected JSON with imageBase64 or ocrText' }, 400);
  }

  if (!ocrText && !imageBase64) {
    return json({ error: 'Send a photo of the recipe page' }, 400);
  }

  try {
    if (!ocrText) {
      const apiKey = Deno.env.get('OCR_SPACE_API_KEY') || ocrApiKey || 'helloworld';
      ocrText = await ocrSpace(imageBase64, apiKey);
    }
    const recipe = parseScanText(ocrText);
    if (!recipe.ingredients.length && !recipe.steps.length) {
      recipe.notes = [recipe.notes, ocrText].filter(Boolean).join('\n\n');
    }
    return json({ recipe, ocrText, imageBase64: null, imageContentType });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not read that recipe page';
    console.error('scan-recipe failed:', message);
    return json({ error: message }, 422);
  }
});
