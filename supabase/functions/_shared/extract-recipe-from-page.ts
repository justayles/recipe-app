import {
  isGenericStepLabel,
  looksLikeIngredientHeading,
  looksLikeStepHeading,
  type ImportedRecipe,
  type RecipeLine,
} from './parse-recipe.ts';
import { captureAiGeneration, type AiObservabilityContext } from './posthog-ai.ts';

const EXTRACT_MODEL = Deno.env.get('OPENAI_SCAN_MODEL') || 'gpt-6-luna';
const MAX_PAGE_CHARS = 24_000;

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
};

type ResponsesPayload = {
  output_text?: string;
  output?: { type?: string; content?: { type?: string; text?: string; refusal?: string }[] }[];
  error?: { message?: string };
  status?: string;
  incomplete_details?: { reason?: string } | null;
  usage?: { input_tokens?: number; output_tokens?: number };
};

export function openaiKey(): string {
  const key = Deno.env.get('OPENAI_API_KEY')?.trim();
  if (!key) {
    throw new Error(
      'OPENAI_API_KEY is not set. Add it to supabase/functions/.env and restart local Supabase, or run npx supabase secrets set OPENAI_API_KEY=sk-...',
    );
  }
  return key;
}

export function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&deg;/gi, '°')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/\s+/g, ' ')
    .trim();
}

function stripToText(input: string): string {
  return decodeEntities(
    input
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  );
}

function jsonLdBlocks(html: string): string {
  const blocks: string[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const raw = match[1].trim();
    if (raw) blocks.push(raw.slice(0, 12_000));
  }
  return blocks.join('\n\n');
}

function recipeCardSlice(html: string): string {
  const markers = [
    /<div[^>]*class="[^"]*wprm-recipe\b/i,
    /<div[^>]*class="[^"]*tasty-recipes\b/i,
    /<div[^>]*class="[^"]*mv-create-card\b/i,
    /<div[^>]*class="[^"]*easyrecipe\b/i,
    /<div[^>]*class="[^"]*recipe-card\b/i,
  ];
  let start = -1;
  for (const marker of markers) {
    const match = html.search(marker);
    if (match >= 0 && (start < 0 || match < start)) start = match;
  }
  if (start < 0) return '';
  return html.slice(start, start + 80_000);
}

export function compactRecipePage(html: string, maxChars = MAX_PAGE_CHARS): string {
  const jsonLd = jsonLdBlocks(html);
  const card = recipeCardSlice(html);
  const page = stripToText(
    html
      .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
      .replace(/<header[\s\S]*?<\/header>/gi, ' '),
  );
  const parts = [
    jsonLd ? `JSON-LD:\n${jsonLd}` : '',
    card ? `RECIPE CARD HTML:\n${card}` : '',
    page ? `PAGE TEXT:\n${page}` : '',
  ].filter(Boolean);
  const joined = parts.join('\n\n');
  return joined.length > maxChars ? joined.slice(0, maxChars) : joined;
}

export function ogTagFromHtml(html: string, property: string): string | null {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>|<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
    'i',
  );
  const match = html.match(re);
  const value = match?.[1] ?? match?.[2];
  return value ? decodeEntities(value) : null;
}

export function ogImageFromHtml(html: string): string | null {
  return ogTagFromHtml(html, 'og:image');
}

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
  if (refusal) throw new Error(`The model refused that page: ${refusal}`);
  return chunks.join('\n').trim();
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

export function importedRecipeFromExtracted(
  extracted: ExtractedRecipe,
  sourceUrl: string,
  sourceName: string | null,
  imageUrl: string | null,
): ImportedRecipe {
  const category = CATEGORIES.includes(extracted.category as (typeof CATEGORIES)[number])
    ? extracted.category
    : extracted.category
      ? 'other'
      : null;
  return {
    title: extracted.title.trim(),
    description: extracted.description?.trim() || null,
    sourceUrl,
    sourceName,
    imageUrl,
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

const NOT_ENOUGH_CAPTION =
  'Not enough info in this post to capture a recipe. Try copying it in by hand.';

const MIN_CAPTION_CHARS = 40;

const PAGE_INSTRUCTIONS = [
  'Read this recipe web page (JSON-LD, recipe card HTML, and page text).',
  'Extract one recipe into the schema.',
  'Prefer the recipe card / JSON-LD over blog narrative, comments, and related recipes.',
  'Ingredients must be full lines such as "225g unsalted butter, softened", not split objects.',
  'If the ingredient list is punctuated with group headings such as "For the marinade", "Dry Rub", or "Glaze", emit each heading as kind "heading" immediately before the items in that group. Keep the printed heading text. Do not invent headings for a single ungrouped list. Do not emit a heading for the word Ingredients itself.',
  'Steps must be the method, one instruction per item, without leading numbers.',
  'Do not paste the ingredient list into a step. If a step blob concatenates instruction then ingredients, keep only the instruction.',
  'If the method is punctuated with group headings, emit each heading as kind "heading" immediately before the steps in that group. Do not emit a heading for Method or Instructions.',
  'If a field is not on the page, use null or an empty array.',
].join(' ');

const CAPTION_INSTRUCTIONS = [
  'Read this Instagram post caption.',
  'Extract one recipe into the schema if the caption contains ingredients or a method.',
  'Ignore hashtags, emojis, "link in bio", shout-outs, and calls to follow or like.',
  'Ingredients must be full lines such as "225g unsalted butter, softened", not split objects.',
  'If the ingredient list is punctuated with group headings such as "For the marinade", "Dry Rub", or "Glaze", emit each heading as kind "heading" immediately before the items in that group. Keep the printed heading text. Do not invent headings for a single ungrouped list. Do not emit a heading for the word Ingredients itself.',
  'Steps must be the method, one instruction per item, without leading numbers.',
  'Use the ingredients and method as written. Do not invent quantities, times, or steps that are not in the caption.',
  'If the method is punctuated with group headings, emit each heading as kind "heading" immediately before the steps in that group. Do not emit a heading for Method or Instructions.',
  'If this caption is not a recipe, return a short title if you can and empty ingredients and steps arrays.',
  'If a field is not in the caption, use null or an empty array.',
].join(' ');

type ExtractErrors = {
  empty: string;
  noTitle: string;
  noRecipe: string;
};

const PAGE_ERRORS: ExtractErrors = {
  empty: 'The model returned an empty recipe. Try copying it in by hand.',
  noTitle: 'Could not read a recipe title from that page',
  noRecipe: 'Could not find ingredients or method on that page.',
};

const CAPTION_ERRORS: ExtractErrors = {
  empty: NOT_ENOUGH_CAPTION,
  noTitle: NOT_ENOUGH_CAPTION,
  noRecipe: NOT_ENOUGH_CAPTION,
};

async function extractRecipeFromText(
  instructions: string,
  body: string,
  apiKey: string,
  observability: AiObservabilityContext,
  errors: ExtractErrors,
): Promise<ExtractedRecipe> {
  const input = [
    {
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: `${instructions}\n\n${body}`,
        },
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
        ? `The model stopped (${payload.status}: ${reason}). Try again, or copy the recipe in by hand.`
        : `The model did not finish (${payload.status}). Try again.`,
    );
  }

  const raw = textFromResponsesPayload(payload);
  if (!raw) throw new Error(errors.empty);

  let parsed: ExtractedRecipe;
  try {
    parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) as ExtractedRecipe;
  } catch {
    throw new Error('The model returned text that was not a recipe.');
  }
  if (!parsed.title?.trim()) throw new Error(errors.noTitle);
  const ingredientItems = (parsed.ingredients ?? []).filter((line) => line.kind === 'item' && line.text.trim());
  const stepItems = (parsed.steps ?? []).filter((line) => line.kind === 'item' && line.text.trim());
  if (!ingredientItems.length && !stepItems.length) {
    throw new Error(errors.noRecipe);
  }
  return parsed;
}

export async function extractRecipeFromPage(
  pageText: string,
  apiKey: string,
  observability: AiObservabilityContext,
): Promise<ExtractedRecipe> {
  return extractRecipeFromText(PAGE_INSTRUCTIONS, pageText, apiKey, observability, PAGE_ERRORS);
}

export async function extractRecipeFromCaption(
  caption: string,
  author: string | null,
  apiKey: string,
  observability: AiObservabilityContext,
): Promise<ExtractedRecipe> {
  const trimmed = caption.trim();
  if (trimmed.length < MIN_CAPTION_CHARS) {
    throw new Error(NOT_ENOUGH_CAPTION);
  }
  const heading = author ? `Instagram caption from @${author}:` : 'Instagram caption:';
  return extractRecipeFromText(
    CAPTION_INSTRUCTIONS,
    `${heading}\n\n${trimmed}`,
    apiKey,
    observability,
    CAPTION_ERRORS,
  );
}
