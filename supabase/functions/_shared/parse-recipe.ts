export type ImportedRecipe = {
  title: string;
  description: string | null;
  sourceUrl: string;
  sourceName: string | null;
  imageUrl: string | null;
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  category: string | null;
  cuisine: string | null;
  ingredients: string[];
  steps: string[];
  notes?: string | null;
};

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/\s+/g, ' ')
    .trim();
}

function textOf(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return decodeEntities(value) || null;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.text === 'string') return decodeEntities(obj.text) || null;
    if (typeof obj.name === 'string') return decodeEntities(obj.name) || null;
    if (typeof obj['@value'] === 'string') return decodeEntities(obj['@value']) || null;
  }
  return null;
}

function isRecipeNode(node: unknown): node is Record<string, unknown> {
  if (!node || typeof node !== 'object') return false;
  const type = (node as { ['@type']?: unknown })['@type'];
  const types = asArray(type).map((t) => String(t).toLowerCase());
  return types.includes('recipe');
}

function walk(node: unknown, found: Record<string, unknown>[]): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, found);
    return;
  }
  if (typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  if (isRecipeNode(obj)) found.push(obj);
  if (obj['@graph']) walk(obj['@graph'], found);
  if (obj.mainEntity) walk(obj.mainEntity, found);
}

function extractJsonLdBlocks(html: string): string[] {
  const blocks: string[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const raw = match[1]
      .replace(/^\s*\/\/<!\[CDATA\[/, '')
      .replace(/\/\/\]\]>\s*$/, '')
      .trim();
    if (raw) blocks.push(raw);
  }
  return blocks;
}

function parseDurationMinutes(value: unknown): number | null {
  const raw = textOf(value);
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Number(raw);
  const iso = raw.toUpperCase();
  const match = iso.match(/^P(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
  if (!match) return null;
  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  const seconds = Number(match[4] ?? 0);
  const total = days * 24 * 60 + hours * 60 + minutes + Math.round(seconds / 60);
  return total > 0 ? Math.round(total) : null;
}

function parseServings(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number' && value > 0) return Math.round(value);
  if (typeof value === 'object' && value && 'value' in value) {
    return parseServings((value as { value: unknown }).value);
  }
  const text = textOf(value);
  if (!text) return null;
  const match = text.match(/(\d+(?:\.\d+)?)/);
  return match ? Math.round(Number(match[1])) : null;
}

function imageUrlOf(value: unknown): string | null {
  for (const entry of asArray(value)) {
    if (typeof entry === 'string' && /^https?:\/\//i.test(entry)) return entry;
    if (entry && typeof entry === 'object') {
      const obj = entry as Record<string, unknown>;
      const url = obj.url ?? obj.contentUrl;
      if (typeof url === 'string' && /^https?:\/\//i.test(url)) return url;
    }
  }
  return null;
}

function collectSteps(value: unknown, out: string[]): void {
  for (const entry of asArray(value)) {
    if (typeof entry === 'string') {
      const text = decodeEntities(entry);
      if (text) out.push(text);
      continue;
    }
    if (!entry || typeof entry !== 'object') continue;
    const obj = entry as Record<string, unknown>;
    const type = asArray(obj['@type']).map((t) => String(t).toLowerCase());
    if (type.includes('howtosection')) {
      const heading = textOf(obj.name);
      if (heading) out.push(heading);
      collectSteps(obj.itemListElement ?? obj.steps, out);
      continue;
    }
    const text = textOf(obj.text) ?? textOf(obj.name);
    if (text) out.push(text);
    if (obj.itemListElement) collectSteps(obj.itemListElement, out);
  }
}

function metaContent(html: string, key: string): string | null {
  const prop = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["'][^>]*>|<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["'][^>]*>`,
    'i',
  );
  const match = html.match(re);
  const value = match?.[1] ?? match?.[2];
  return value ? decodeEntities(value) : null;
}

function hostName(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function titleFromHtml(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeEntities(match[1].replace(/\s*\|.*$/, '').replace(/\s*-.*$/, '')) : null;
}

function categoryFromRecipe(node: Record<string, unknown>): string | null {
  const raw = (textOf(node.recipeCategory) ?? '').toLowerCase();
  if (!raw) return null;
  if (/dessert|cake|pudding|sweet/.test(raw)) return 'dessert';
  if (/starter|appetizer|soup/.test(raw)) return 'starter';
  if (/side/.test(raw)) return 'side';
  if (/snack/.test(raw)) return 'snack';
  if (/drink|cocktail|beverage/.test(raw)) return 'drink';
  if (/main|dinner|lunch|breakfast/.test(raw)) return 'main';
  return 'other';
}

export function parseRecipeHtml(html: string, sourceUrl: string): ImportedRecipe {
  const found: Record<string, unknown>[] = [];
  for (const block of extractJsonLdBlocks(html)) {
    try {
      walk(JSON.parse(block) as Json, found);
    } catch {
      // Some publishers emit trailing commas or comments; skip that block.
    }
  }

  const node = found[0];
  const ingredients = node
    ? asArray(node.recipeIngredient)
        .map((item) => textOf(item))
        .filter((item): item is string => !!item)
    : [];

  const steps: string[] = [];
  if (node) collectSteps(node.recipeInstructions, steps);

  const title =
    (node ? textOf(node.name) : null) ?? metaContent(html, 'og:title') ?? titleFromHtml(html);
  if (!title) {
    throw new Error('Could not find a recipe on that page. Try a BBC Food or similar recipe URL.');
  }

  const description =
    (node ? textOf(node.description) : null) ?? metaContent(html, 'og:description');

  return {
    title,
    description,
    sourceUrl,
    sourceName: hostName(sourceUrl),
    imageUrl:
      (node ? imageUrlOf(node.image) : null) ??
      metaContent(html, 'og:image') ??
      metaContent(html, 'twitter:image'),
    servings: node ? parseServings(node.recipeYield) : null,
    prepMinutes: node ? parseDurationMinutes(node.prepTime) : null,
    cookMinutes: node ? parseDurationMinutes(node.cookTime) ?? parseDurationMinutes(node.totalTime) : null,
    category: node ? categoryFromRecipe(node) : null,
    cuisine: node ? textOf(node.recipeCuisine) : null,
    ingredients,
    steps,
  };
}

export function extractUrlFromShareText(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s]+/i);
  if (!match) return null;
  return match[0].replace(/[),.;]+$/, '');
}
