export type RecipeLine = {
  text: string;
  isHeading: boolean;
};

export type IngredientLine = RecipeLine;
export type StepLine = RecipeLine;

function isGenericIngredientLabel(line: string): boolean {
  return /^(ingredients?|you will need|what you(?:'|’)ll need|shopping list)$/i.test(
    line.trim().replace(/:$/, ''),
  );
}

export function isGenericStepLabel(line: string): boolean {
  return /^(method|methods|instructions?|directions?|preparation|steps?|how to make(?: it)?)$/i.test(
    line.trim().replace(/:$/, ''),
  );
}

export function looksLikeIngredientHeading(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || isGenericIngredientLabel(trimmed)) return false;
  if (/^for\s+/i.test(trimmed)) return true;
  if (/^(to serve|to garnish|for serving|for garnish)\b/i.test(trimmed)) return true;
  if (/:$/.test(trimmed) && !/\d/.test(trimmed) && trimmed.length < 80) return true;
  return false;
}

export function looksLikeStepHeading(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || isGenericStepLabel(trimmed) || trimmed.length > 80) return false;
  if (/:$/.test(trimmed) && !/\d/.test(trimmed)) return true;
  if (/[.!?]/.test(trimmed)) return false;
  if (/^for\s+/i.test(trimmed)) return true;
  if (/^(to serve|to garnish|for serving|for garnish)\b/i.test(trimmed)) return true;
  return false;
}

export function ingredientLinesFromTexts(lines: string[]): IngredientLine[] {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text) => ({ text, isHeading: looksLikeIngredientHeading(text) }));
}

export function stepLinesFromTexts(lines: string[]): StepLine[] {
  return lines
    .map((line) => line.trim())
    .filter((text) => text && !isGenericStepLabel(text))
    .map((text) => ({ text, isHeading: looksLikeStepHeading(text) }));
}

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
  ingredients: IngredientLine[];
  steps: StepLine[];
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
    .replace(/&deg;/gi, '°')
    .replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—')
    .replace(/&frac12;/gi, '½')
    .replace(/&frac14;/gi, '¼')
    .replace(/&frac34;/gi, '¾')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(input: string): string {
  return decodeEntities(input.replace(/<[^>]+>/g, ' '));
}

function classSpan(html: string, className: string): string | null {
  const re = new RegExp(`<span[^>]*class="[^"]*${className}[^"]*"[^>]*>([\\s\\S]*?)</span>`, 'i');
  const match = html.match(re);
  return match ? stripTags(match[1]) || null : null;
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

function collectSteps(value: unknown, out: StepLine[]): void {
  for (const entry of asArray(value)) {
    if (typeof entry === 'string') {
      const text = decodeEntities(entry);
      if (text && !isGenericStepLabel(text)) {
        out.push({ text, isHeading: looksLikeStepHeading(text) });
      }
      continue;
    }
    if (!entry || typeof entry !== 'object') continue;
    const obj = entry as Record<string, unknown>;
    const type = asArray(obj['@type']).map((t) => String(t).toLowerCase());
    if (type.includes('howtosection')) {
      const heading = textOf(obj.name);
      if (heading && !isGenericStepLabel(heading)) {
        out.push({ text: heading, isHeading: true });
      }
      collectSteps(obj.itemListElement ?? obj.steps, out);
      continue;
    }
    const text = textOf(obj.text) ?? textOf(obj.name);
    if (text && !isGenericStepLabel(text)) {
      out.push({ text, isHeading: looksLikeStepHeading(text) });
    }
    if (obj.itemListElement) collectSteps(obj.itemListElement, out);
  }
}

const QTY_UNIT =
  /(?:\d+\s*)?(?:\d+\/\d+|[½¼¾⅓⅔]|[0-9]+)(?:\s*[-–]\s*(?:\d+\/\d+|[½¼¾⅓⅔]|[0-9]+))?(?:\s*(?:pounds?|lbs?|tablespoons?|tbsp\.?|teaspoons?|tsp\.?|cups?|cloves?|grams?|kg|ml|ounces?|oz\.?)\b)/i;

function looksLikeIngredientDump(rest: string): boolean {
  if (rest.length < 10) return false;
  if (
    /\b(preheat|oven|bake|baking|stir|whisk|sauté|saute|cook|heat|remove|place|wrap|brush|season|bring|continue|until|minutes?|hours?)\b/i.test(
      rest,
    )
  ) {
    return false;
  }
  return (rest.match(new RegExp(QTY_UNIT.source, 'gi')) ?? []).length >= 2;
}

function remainderRepeatsIngredients(rest: string, ingredients: string[]): boolean {
  const hay = rest.toLowerCase();
  let hits = 0;
  for (const ingredient of ingredients) {
    const name = ingredient
      .replace(/^[\d/½¼¾⅓⅔.\s-]+/, '')
      .replace(/^\s*(pounds?|lbs?|tablespoons?|tbsp\.?|teaspoons?|tsp\.?|cups?|cloves?)\s+/i, '')
      .slice(0, 24)
      .toLowerCase()
      .trim();
    if (name.length >= 6 && hay.includes(name)) hits += 1;
  }
  return hits >= 2;
}

export function stripTrailingIngredientDump(step: string, ingredients: string[] = []): string {
  const text = step.replace(/\s+/g, ' ').trim();
  const boundary = /[.!?](?=\s*(?:\d|[½¼¾⅓⅔]))/g;
  let cut = -1;
  let match: RegExpExecArray | null;
  while ((match = boundary.exec(text))) {
    const rest = text.slice(match.index + 1).trim();
    if (looksLikeIngredientDump(rest) || remainderRepeatsIngredients(rest, ingredients)) {
      cut = match.index + 1;
      break;
    }
  }
  if (cut > 40) return text.slice(0, cut).trim();
  return text;
}

function wprmIngredientLine(li: string): string | null {
  const amount = classSpan(li, 'wprm-recipe-ingredient-amount');
  const unit = classSpan(li, 'wprm-recipe-ingredient-unit');
  const name = classSpan(li, 'wprm-recipe-ingredient-name');
  const notes = classSpan(li, 'wprm-recipe-ingredient-notes');
  const text = [amount, unit, name, notes ? `(${notes})` : null].filter(Boolean).join(' ');
  return text || null;
}

function collectWprmIngredients(html: string): IngredientLine[] | null {
  const start = html.search(/<div[^>]*class="[^"]*wprm-recipe-ingredients-container/);
  if (start < 0) return null;
  const instructions = html.search(/<div[^>]*class="[^"]*wprm-recipe-instructions-container/);
  const slice = html.slice(start, instructions > start ? instructions : start + 80_000);
  const groups = [...slice.matchAll(/<div class="wprm-recipe-ingredient-group">([\s\S]*?)<\/div>/g)];
  if (!groups.length) return null;

  const lines: IngredientLine[] = [];
  for (const [, body] of groups) {
    const headingMatch = body.match(/wprm-recipe-ingredient-group-name[^>]*>([\s\S]*?)<\/h[1-6]>/i);
    const heading = headingMatch ? stripTags(headingMatch[1]) : '';
    if (heading && !isGenericIngredientLabel(heading)) {
      lines.push({ text: heading, isHeading: true });
    }
    for (const item of body.matchAll(/<li class="wprm-recipe-ingredient"[^>]*>([\s\S]*?)<\/li>/g)) {
      const text = wprmIngredientLine(item[1]);
      if (text) lines.push({ text, isHeading: false });
    }
  }
  return lines.some((line) => !line.isHeading) ? lines : null;
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
  const jsonLdIngredients = node
    ? asArray(node.recipeIngredient)
        .map((item) => textOf(item))
        .filter((item): item is string => !!item)
    : [];

  const ingredients = collectWprmIngredients(html) ?? ingredientLinesFromTexts(jsonLdIngredients);
  const ingredientTexts = ingredients.filter((line) => !line.isHeading).map((line) => line.text);

  const steps: StepLine[] = [];
  if (node) collectSteps(node.recipeInstructions, steps);
  for (const step of steps) {
    if (!step.isHeading) step.text = stripTrailingIngredientDump(step.text, ingredientTexts);
  }

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
