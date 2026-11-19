import {
  isGenericStepLabel,
  looksLikeIngredientHeading,
  looksLikeStepHeading,
  type ImportedRecipe,
  type RecipeLine,
} from '../_shared/parse-recipe.ts';
import {
  captureAiGeneration,
  requestDistinctId,
  type AiObservabilityContext,
} from '../_shared/posthog-ai.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXTRACT_MODEL = Deno.env.get('OPENAI_SCAN_MODEL') || 'gpt-6-luna';
const IMAGE_MODEL = Deno.env.get('OPENAI_IMAGE_MODEL') || 'gpt-image-2.5-sunburst';

const CATEGORIES = ['starter', 'main', 'side', 'dessert', 'snack', 'drink', 'other'] as const;

const RECIPE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'title',
    'description',
    'servings',
    'prepMinutes',
    'cookMinutes',
    'category',
    'cuisine',
    'ingredients',
    'steps',
    'visualPrompt',
    'hasDishPhoto',
    'dishPhotoLeft',
    'dishPhotoTop',
    'dishPhotoWidth',
    'dishPhotoHeight',
  ],
  properties: {
    title: { type: 'string' },
    description: { type: ['string', 'null'] },
    servings: { type: ['number', 'null'] },
    prepMinutes: { type: ['number', 'null'] },
    cookMinutes: { type: ['number', 'null'] },
    category: {
      type: ['string', 'null'],
      enum: [...CATEGORIES, null],
    },
    cuisine: { type: ['string', 'null'] },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'text'],
        properties: {
          kind: { type: 'string', enum: ['heading', 'item'] },
          text: { type: 'string' },
        },
      },
    },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'text'],
        properties: {
          kind: { type: 'string', enum: ['heading', 'item'] },
          text: { type: 'string' },
        },
      },
    },
    visualPrompt: {
      type: 'string',
      description: 'A short photorealistic prompt for the finished plated dish, using the title and main ingredients.',
    },
    hasDishPhoto: {
      type: 'boolean',
      description: 'True only if the page includes a real photograph of the finished dish, not a drawing, logo, or ingredient shot.',
    },
    dishPhotoLeft: { type: 'number', description: 'Crop left edge as a fraction of image width, 0 to 1.' },
    dishPhotoTop: { type: 'number', description: 'Crop top edge as a fraction of image height, 0 to 1.' },
    dishPhotoWidth: { type: 'number', description: 'Crop width as a fraction of image width, 0 to 1.' },
    dishPhotoHeight: { type: 'number', description: 'Crop height as a fraction of image height, 0 to 1.' },
  },
} as const;

type ExtractedRecipe = {
  title: string;
  description: string | null;
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  category: string | null;
  cuisine: string | null;
  ingredients: { kind: 'heading' | 'item'; text: string }[];
  steps: { kind: 'heading' | 'item'; text: string }[];
  visualPrompt: string;
  hasDishPhoto: boolean;
  dishPhotoLeft: number;
  dishPhotoTop: number;
  dishPhotoWidth: number;
  dishPhotoHeight: number;
};

type DishPhotoCrop = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function usableDishCrop(extracted: ExtractedRecipe): DishPhotoCrop | null {
  if (!extracted.hasDishPhoto) return null;
  const left = clamp01(extracted.dishPhotoLeft);
  const top = clamp01(extracted.dishPhotoTop);
  const width = Math.min(clamp01(extracted.dishPhotoWidth), 1 - left);
  const height = Math.min(clamp01(extracted.dishPhotoHeight), 1 - top);
  if (width < 0.15 || height < 0.15) return null;
  if (width * height < 0.05) return null;
  return { left, top, width, height };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function openaiKey(): string {
  const key = Deno.env.get('OPENAI_API_KEY')?.trim();
  if (!key) {
    throw new Error(
      'OPENAI_API_KEY is not set. Add it to supabase/.env and restart local Supabase, or run npx supabase secrets set OPENAI_API_KEY=sk-... --local',
    );
  }
  return key;
}

type ResponseContent = {
  type?: string;
  text?: string;
  refusal?: string;
};

type ResponseOutputItem = {
  type?: string;
  status?: string;
  content?: ResponseContent[];
};

type ResponsesPayload = {
  output_text?: string;
  output?: ResponseOutputItem[];
  error?: { message?: string };
  status?: string;
  incomplete_details?: { reason?: string } | null;
  usage?: { input_tokens?: number; output_tokens?: number };
};

function textFromResponsesPayload(payload: ResponsesPayload): string {
  if (payload.output_text?.trim()) return payload.output_text.trim();

  const chunks: string[] = [];
  let refusal: string | null = null;
  for (const item of payload.output ?? []) {
    for (const part of item.content ?? []) {
      if (part.type === 'refusal' && part.refusal) refusal = part.refusal;
      if (typeof part.text === 'string' && part.text.trim()) chunks.push(part.text.trim());
    }
  }
  if (refusal) throw new Error(`The scan model refused that photo: ${refusal}`);
  return chunks.join('\n').trim();
}

function parseRecipeJson(raw: string): ExtractedRecipe {
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(stripped) as ExtractedRecipe;
}

async function extractRecipe(
  imageBase64: string,
  contentType: string,
  apiKey: string,
  observability: AiObservabilityContext,
): Promise<ExtractedRecipe> {
  const input = [
    {
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: [
            'Read this cookbook or magazine recipe page.',
            'Extract the recipe into the schema.',
            'Ingredients must be full lines such as "225g unsalted butter, softened", not split objects.',
            'If the ingredient list is punctuated with group headings such as "For the marinade", "For the stew", "For the dressing", emit each heading as kind "heading" immediately before the items in that group. Keep the printed heading text. Do not invent headings for a single ungrouped list. Do not emit a heading for the word Ingredients itself. Do not merge a heading onto the same line as an ingredient.',
            'Steps must be the method, one instruction per item, without leading numbers.',
            'If the method is punctuated with group headings such as "For the marinade" or "For the stew", emit each heading as kind "heading" immediately before the steps in that group. Keep the printed heading text. Do not invent headings for a single ungrouped method. Do not emit a heading for the word Method or Instructions itself. Do not merge a heading onto the same line as a step.',
            'If a field is not on the page, use null or an empty array.',
            'If the page includes a photograph of the finished dish, set hasDishPhoto true and give a tight crop box as fractions of the image (0 to 1) for left, top, width, and height. Crop the food photo only, not the whole page or the text.',
            'If there is no usable dish photograph, set hasDishPhoto false and set the crop numbers to 0.',
            'visualPrompt should describe the finished dish for a photorealistic food photo, used only when there is no dish photograph on the page.',
          ].join(' '),
        },
        { type: 'input_image', image_url: `data:${contentType};base64,${imageBase64}`, detail: 'high' },
      ],
    },
  ];
  const startedAt = performance.now();
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: EXTRACT_MODEL,
      reasoning: { effort: 'low' },
      text: {
        format: {
          type: 'json_schema',
          name: 'recipeek_recipe',
          strict: true,
          schema: RECIPE_SCHEMA,
        },
      },
      input,
    }),
  });

  const payload = (await response.json()) as ResponsesPayload;
  await captureAiGeneration({
    ...observability,
    error: payload.error?.message ?? payload.incomplete_details?.reason,
    httpStatus: response.status,
    input,
    inputTokens: payload.usage?.input_tokens,
    isError: !response.ok || (payload.status != null && payload.status !== 'completed'),
    latency: (performance.now() - startedAt) / 1_000,
    model: EXTRACT_MODEL,
    outputChoices: payload.output_text
      ? [{ role: 'assistant', content: payload.output_text }]
      : undefined,
    outputTokens: payload.usage?.output_tokens,
    provider: 'openai',
  });
  if (!response.ok) {
    throw new Error(payload.error?.message || `OpenAI extract failed (${response.status})`);
  }
  if (payload.status && payload.status !== 'completed') {
    const reason = payload.incomplete_details?.reason;
    throw new Error(
      reason
        ? `The scan model stopped (${payload.status}: ${reason}). Try a closer, well-lit photo.`
        : `The scan model did not finish (${payload.status}). Try again.`,
    );
  }

  const raw = textFromResponsesPayload(payload);
  if (!raw) {
    const kinds = (payload.output ?? []).map((item) => item.type ?? 'unknown').join(', ') || 'none';
    console.error('scan extract empty; output types:', kinds, 'status:', payload.status);
    throw new Error('The scan model returned an empty recipe. Try a closer, well-lit photo of a single recipe.');
  }

  let parsed: ExtractedRecipe;
  try {
    parsed = parseRecipeJson(raw);
  } catch {
    throw new Error('The scan model returned text that was not a recipe. Try a closer photo of the page.');
  }
  if (!parsed.title?.trim()) throw new Error('Could not read a recipe title from that page');
  const ingredientItems = (parsed.ingredients ?? []).filter(
    (line) => line.kind === 'item' && line.text.trim(),
  );
  const stepItems = (parsed.steps ?? []).filter((line) => line.kind === 'item' && line.text.trim());
  if (!ingredientItems.length && !stepItems.length) {
    throw new Error('Could not find ingredients or method on that page. Try a closer, well-lit photo.');
  }
  return parsed;
}

async function generateDishImage(
  visualPrompt: string,
  apiKey: string,
  observability: AiObservabilityContext,
): Promise<string | null> {
  const prompt =
    visualPrompt.trim() ||
    'Photorealistic overhead photo of a homemade plated dish, natural kitchen light, no text.';
  const startedAt = performance.now();
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      prompt,
      quality: 'low',
      size: '1024x1024',
      output_format: 'jpeg',
      n: 1,
    }),
  });
  const payload = (await response.json()) as {
    data?: { b64_json?: string }[];
    error?: { message?: string };
  };
  await captureAiGeneration({
    ...observability,
    error: payload.error?.message,
    httpStatus: response.status,
    input: [{ role: 'user', content: prompt }],
    isError: !response.ok,
    latency: (performance.now() - startedAt) / 1_000,
    model: IMAGE_MODEL,
    provider: 'openai',
  });
  if (!response.ok) {
    console.error('image generation failed:', payload.error?.message || response.status);
    return null;
  }
  return payload.data?.[0]?.b64_json ?? null;
}

function mappedLines(
  lines: { kind: 'heading' | 'item'; text: string }[] | undefined,
  looksLike: (text: string) => boolean,
  skip: (text: string) => boolean,
): RecipeLine[] {
  return (lines ?? [])
    .map((line) => {
      const text = line.text.trim();
      return {
        text,
        isHeading: line.kind === 'heading' || looksLike(text),
      };
    })
    .filter((line) => line.text && !skip(line.text));
}

function toImportedRecipe(extracted: ExtractedRecipe): ImportedRecipe {
  const category = CATEGORIES.includes(extracted.category as (typeof CATEGORIES)[number])
    ? extracted.category
    : extracted.category
      ? 'other'
      : null;
  return {
    title: extracted.title.trim(),
    description: extracted.description?.trim() || null,
    sourceUrl: '',
    sourceName: 'Scanned page',
    imageUrl: null,
    servings: typeof extracted.servings === 'number' ? extracted.servings : null,
    prepMinutes: typeof extracted.prepMinutes === 'number' ? extracted.prepMinutes : null,
    cookMinutes: typeof extracted.cookMinutes === 'number' ? extracted.cookMinutes : null,
    category,
    cuisine: extracted.cuisine?.trim() || null,
    ingredients: mappedLines(
      extracted.ingredients,
      looksLikeIngredientHeading,
      (text) => /^ingredients?:?$/i.test(text),
    ),
    steps: mappedLines(extracted.steps, looksLikeStepHeading, isGenericStepLabel),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = req.headers.get('Authorization');
  if (!auth) return json({ error: 'Unauthorized' }, 401);

  let imageBase64 = '';
  let imageContentType = 'image/jpeg';
  try {
    const body = (await req.json()) as { imageBase64?: string; imageContentType?: string };
    imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64.replace(/^data:[^;]+;base64,/, '') : '';
    imageContentType = body.imageContentType?.split(';')[0] || 'image/jpeg';
  } catch {
    return json({ error: 'Expected JSON with imageBase64' }, 400);
  }
  if (!imageBase64) return json({ error: 'Send a photo of the recipe page' }, 400);

  try {
    const apiKey = openaiKey();
    const observability = {
      distinctId: requestDistinctId(auth),
      traceId: crypto.randomUUID(),
    };
    const extracted = await extractRecipe(imageBase64, imageContentType, apiKey, observability);
    const recipe = toImportedRecipe(extracted);
    const dishPhotoCrop = usableDishCrop(extracted);
    if (dishPhotoCrop) {
      return json({
        recipe,
        imageBase64: null,
        imageContentType: null,
        imageGenerationFailed: false,
        useScannedDishPhoto: true,
        dishPhotoCrop,
      });
    }

    const generated = await generateDishImage(extracted.visualPrompt, apiKey, observability);
    return json({
      recipe,
      imageBase64: generated,
      imageContentType: generated ? 'image/jpeg' : null,
      imageGenerationFailed: !generated,
      useScannedDishPhoto: false,
      dishPhotoCrop: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not read that recipe page';
    console.error('scan-recipe failed:', message);
    return json({ error: message }, 422);
  }
});
