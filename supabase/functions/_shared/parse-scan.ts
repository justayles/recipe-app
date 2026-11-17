import type { ImportedRecipe } from './parse-recipe.ts';

const INGREDIENT_HEADER =
  /^(?:ingredients?|you will need|shopping list|what you(?:'|’)ll need|for the (?:cake|sauce|dressing|filling|base|topping))\b/i;
const STEP_HEADER =
  /^(?:method|methods|instructions?|directions?|preparation|to (?:make|cook|serve)|steps?)\b/i;
const NOTES_HEADER = /^(?:notes?|tips?|cook(?:'|’)s notes?|to serve)\b/i;
const META_LINE =
  /^(?:serves?|servings?|prep(?:aration)?|cook(?:ing)?|ready in|time|hands-on|oven)\b/i;

const UNIT =
  '(?:g|kg|ml|l|tsp|tsps|tbsp|tbsps|teaspoons?|tablespoons?|oz|lb|lbs|cups?|pints?|bunch(?:es)?|cloves?|slices?|sprigs?|handfuls?|pinches?|cans?|tins?|packs?|packets?|eggs?)';

const STEP_VERB =
  '(?:heat|preheat|mix|stir|add|bake|cook|boil|whisk|pour|place|put|tip|beat|fold|serve|line|cream|sift|knead|roll|chill|season|fry|simmer|drain|cool|turn|spread|sprinkle|cover|remove|transfer|blend|roast|grill|chop|slice|melt|bring|reduce|drizzle|poke|leave|allow|meanwhile|spoon|scrape|combine|whisk)';

export type OcrWord = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

function normalizeOcr(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[|]/g, 'I')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/½/g, '1/2')
    .replace(/¼/g, '1/4')
    .replace(/¾/g, '3/4')
    .replace(/⅓/g, '1/3')
    .replace(/⅔/g, '2/3')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.replace(/^\s*[•●◦▪︎‣]\s*/, '- ').trim())
    .join('\n')
    .trim();
}

function isHeader(line: string, pattern: RegExp): boolean {
  const trimmed = line.replace(/[:.]+$/, '').trim();
  if (trimmed.length > 48 || /^\d+[.)]/.test(trimmed)) return false;
  return pattern.test(trimmed);
}

function minutesAfter(label: RegExp, text: string): number | null {
  const match = text.match(
    new RegExp(
      `(?:${label.source})[^\\d]{0,24}(\\d+(?:\\.\\d+)?)\\s*(hours?|hrs?|minutes?|mins?|min)\\b`,
      'i',
    ),
  );
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit.startsWith('hour') || unit.startsWith('hr')) return Math.round(amount * 60);
  return Math.round(amount);
}

function parseServings(text: string): number | null {
  const match = text.match(/\bserves?\s+(\d+)\b/i) ?? text.match(/\bservings?\s*[:=]?\s*(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

function looksLikeIngredient(line: string): boolean {
  if (isHeader(line, INGREDIENT_HEADER) || isHeader(line, STEP_HEADER) || isHeader(line, NOTES_HEADER)) {
    return false;
  }
  if (line.length > 90 && /[.!?]$/.test(line)) return false;
  if (/^\d+[.)]\s+\S/.test(line) && line.length > 40) return false;
  if (new RegExp(`^[-–—]?\\s*\\d[\\d\\/.-]*\\s*${UNIT}\\b`, 'i').test(line)) return true;
  if (/^[-–—]\s+\S/.test(line) && line.length < 80) return true;
  if (/^\d+[.)]\s+\S/.test(line)) return false;
  if (/^\d+[.)]?\s*(?:g|kg|ml|l|tsp|tbsp)\b/i.test(line)) return true;
  if (/^\d+\s+[a-z]/i.test(line) && line.length < 55) return true;
  if (
    /^(?:a few |pinch of |handful of |juice of |zest of |salt|pepper|oil|olive oil|butter|flour|eggs?|onion|garlic)\b/i.test(
      line,
    ) &&
    line.length < 70
  ) {
    return true;
  }
  return /\b\d+\s*(?:g|kg|ml|l|tsp|tbsp|cups?)\b/i.test(line) && line.length < 80;
}

function looksLikeStep(line: string): boolean {
  if (looksLikeIngredient(line) && line.length < 50) return false;
  return (
    /^\d+[.)]\s+\S/.test(line) ||
    new RegExp(`^(?:\\d+[.)]\\s+)?${STEP_VERB}\\b`, 'i').test(line) ||
    (line.length > 55 && /\b(?:until|minutes?|oven|bowl|tin|over)\b/i.test(line) && /[.]$/.test(line))
  );
}

function inferCategory(text: string): string | null {
  const raw = text.toLowerCase();
  if (/dessert|cake|pudding|brownie|cookie|biscuit|tart|muffin/.test(raw)) return 'dessert';
  if (/starter|appetizer|soup|mezze/.test(raw)) return 'starter';
  if (/\bside\b|salad/.test(raw)) return 'side';
  if (/snack/.test(raw)) return 'snack';
  if (/drink|cocktail|smoothie/.test(raw)) return 'drink';
  if (/dinner|lunch|breakfast|pasta|curry|stew|roast|lasagne|pie/.test(raw)) return 'main';
  return 'other';
}

function inferCuisine(text: string): string | null {
  const match = text.match(
    /\b(italian|french|indian|thai|chinese|japanese|mexican|spanish|greek|british|middle eastern|korean|vietnamese)\b/i,
  );
  return match ? match[1][0].toUpperCase() + match[1].slice(1).toLowerCase() : null;
}

/** Undo OCR that read a magazine row as "left column + right column" on one line. */
export function splitCrossColumnLine(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  const spaced = trimmed.split(/\s{2,}|\t/).map((part) => part.trim()).filter(Boolean);
  if (spaced.length > 1) return spaced.flatMap(splitCrossColumnLine);

  const numbered = trimmed.match(/^(.*?[A-Za-z].{6,}?)\s+(\d+[.)]\s+\S.*)$/);
  if (numbered && looksLikeIngredient(numbered[1]) && looksLikeStep(numbered[2])) {
    return [numbered[1].trim(), numbered[2].trim()];
  }

  const verbSplit = trimmed.match(
    new RegExp(`^(.*?\\d\\s*${UNIT}\\b.*?)\\s+((?:\\d+[.)]\\s+)?${STEP_VERB}\\b.*)$`, 'i'),
  );
  if (verbSplit && looksLikeIngredient(verbSplit[1].trim())) {
    return [verbSplit[1].trim(), verbSplit[2].trim()];
  }

  const midVerb = trimmed.match(new RegExp(`^(.{8,70}?)\\s+(${STEP_VERB}\\b.+)$`, 'i'));
  if (
    midVerb &&
    looksLikeStep(midVerb[2]) &&
    !looksLikeStep(midVerb[1]) &&
    (looksLikeIngredient(midVerb[1]) || /\d/.test(midVerb[1]))
  ) {
    return [midVerb[1].trim(), midVerb[2].trim()];
  }

  return [trimmed];
}

function joinWrappedLines(lines: string[]): string[] {
  const joined: string[] = [];
  for (const line of lines) {
    const prev = joined[joined.length - 1];
    if (
      prev &&
      !/[:.!?]$/.test(prev) &&
      (line[0] === line[0]?.toLowerCase() || /[,;]$/.test(prev)) &&
      !looksLikeIngredient(line) &&
      !looksLikeIngredient(prev) &&
      !looksLikeStep(line) &&
      !/^\d/.test(line) &&
      !isHeader(line, INGREDIENT_HEADER) &&
      !isHeader(line, STEP_HEADER)
    ) {
      joined[joined.length - 1] = `${prev} ${line}`;
    } else {
      joined.push(line);
    }
  }
  return joined;
}

function linesOf(text: string): string[] {
  return joinWrappedLines(
    normalizeOcr(text)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap(splitCrossColumnLine),
  );
}

function wordCenterX(word: OcrWord): number {
  return word.x + word.width / 2;
}

function groupWordsIntoLines(words: OcrWord[]): OcrWord[][] {
  const sorted = [...words].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: OcrWord[][] = [];
  for (const word of sorted) {
    const prev = lines[lines.length - 1];
    if (!prev) {
      lines.push([word]);
      continue;
    }
    const avgY = prev.reduce((sum, item) => sum + item.y, 0) / prev.length;
    const avgH = prev.reduce((sum, item) => sum + item.height, 0) / prev.length;
    if (Math.abs(word.y - avgY) < Math.max(avgH, word.height) * 0.65) prev.push(word);
    else lines.push([word]);
  }
  return lines.map((line) => [...line].sort((a, b) => a.x - b.x));
}

function joinWords(words: OcrWord[]): string {
  return words
    .map((word) => word.text.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreBlob(lines: string[], kind: 'ingredients' | 'steps'): number {
  let score = 0;
  for (const line of lines) {
    if (kind === 'ingredients') {
      if (isHeader(line, INGREDIENT_HEADER) || looksLikeIngredient(line)) score += 2;
      if (looksLikeStep(line)) score -= 1;
    } else {
      if (isHeader(line, STEP_HEADER) || looksLikeStep(line)) score += 2;
      if (looksLikeIngredient(line)) score -= 1;
    }
  }
  return score;
}

/**
 * Rebuild magazine-style two-column OCR using word boxes, then label the
 * columns as ingredients / method so parseScanText sees a normal recipe.
 */
export function reconstructOcrLayout(words: OcrWord[]): string {
  const cleaned = words.filter((word) => word.text.trim() && word.width > 0 && word.height > 0);
  if (cleaned.length < 8) return joinWords(cleaned);

  const minX = Math.min(...cleaned.map((word) => word.x));
  const maxX = Math.max(...cleaned.map((word) => word.x + word.width));
  const pageWidth = maxX - minX;
  const lineGroups = groupWordsIntoLines(cleaned);
  if (pageWidth < 120) {
    return lineGroups.map(joinWords).filter(Boolean).join('\n');
  }

  const bins = 24;
  const counts = Array.from({ length: bins }, () => 0);
  for (const word of cleaned) {
    const t = (wordCenterX(word) - minX) / pageWidth;
    counts[Math.min(bins - 1, Math.max(0, Math.floor(t * bins)))] += Math.max(1, word.text.length);
  }
  const from = Math.floor(bins * 0.28);
  const to = Math.ceil(bins * 0.72);
  let valley = from;
  let valleyVal = counts[from];
  for (let i = from; i < to; i += 1) {
    if (counts[i] < valleyVal) {
      valleyVal = counts[i];
      valley = i;
    }
  }
  const peakL = Math.max(...counts.slice(0, from));
  const peakR = Math.max(...counts.slice(to));
  const twoCol = peakL > 8 && peakR > 8 && valleyVal < Math.min(peakL, peakR) * 0.5;
  if (!twoCol) {
    return lineGroups.map(joinWords).filter(Boolean).join('\n');
  }

  const splitX = minX + ((valley + 0.5) / bins) * pageWidth;
  const lead: string[] = [];
  const left: string[] = [];
  const right: string[] = [];

  for (const lineWords of lineGroups) {
    const text = joinWords(lineWords);
    if (!text) continue;
    const lineMin = Math.min(...lineWords.map((word) => word.x));
    const lineMax = Math.max(...lineWords.map((word) => word.x + word.width));
    const span = (lineMax - lineMin) / pageWidth;
    const leftPart = lineWords.filter((word) => wordCenterX(word) < splitX);
    const rightPart = lineWords.filter((word) => wordCenterX(word) >= splitX);

    if (leftPart.length && rightPart.length && span > 0.45) {
      if (span > 0.78 && leftPart.length <= 3) {
        lead.push(text);
      } else {
        const l = joinWords(leftPart);
        const r = joinWords(rightPart);
        if (l) left.push(l);
        if (r) right.push(r);
      }
      continue;
    }

    if (span > 0.7 || META_LINE.test(text) || isHeader(text, INGREDIENT_HEADER) || isHeader(text, STEP_HEADER)) {
      if (!left.length && !right.length) lead.push(text);
      else if (wordCenterX(lineWords[0]) < splitX) left.push(text);
      else right.push(text);
      continue;
    }

    if (wordCenterX(lineWords[0]) < splitX) left.push(text);
    else right.push(text);
  }

  const leftIsIngredients = scoreBlob(left, 'ingredients') - scoreBlob(left, 'steps') >= scoreBlob(right, 'ingredients') - scoreBlob(right, 'steps');
  const ingredientsCol = leftIsIngredients ? left : right;
  const methodCol = leftIsIngredients ? right : left;

  return [
    ...lead,
    'INGREDIENTS',
    ...ingredientsCol.filter((line) => !isHeader(line, INGREDIENT_HEADER) && !isHeader(line, STEP_HEADER)),
    'METHOD',
    ...methodCol.filter((line) => !isHeader(line, INGREDIENT_HEADER) && !isHeader(line, STEP_HEADER)),
  ].join('\n');
}

export function ocrSpaceWords(overlay: {
  Lines?: { Words?: { WordText?: string; Left?: number; Top?: number; Width?: number; Height?: number }[] }[];
} | null | undefined): OcrWord[] {
  const words: OcrWord[] = [];
  for (const line of overlay?.Lines ?? []) {
    for (const word of line.Words ?? []) {
      const text = word.WordText?.trim();
      if (!text) continue;
      words.push({
        text,
        x: word.Left ?? 0,
        y: word.Top ?? 0,
        width: word.Width ?? 0,
        height: word.Height ?? 0,
      });
    }
  }
  return words;
}

/**
 * Turn messy magazine / cookbook OCR into a structured recipe.
 * Missing pieces stay empty so the user can tidy them on the edit screen.
 */
export function parseScanText(rawText: string): ImportedRecipe {
  const lines = linesOf(rawText);
  const full = lines.join('\n');

  let title = 'Scanned recipe';
  let description: string | null = null;
  const ingredients: string[] = [];
  const steps: string[] = [];
  const notes: string[] = [];

  let section: 'lead' | 'ingredients' | 'steps' | 'notes' = 'lead';
  const lead: string[] = [];

  for (const line of lines) {
    if (isHeader(line, INGREDIENT_HEADER)) {
      section = 'ingredients';
      continue;
    }
    if (isHeader(line, STEP_HEADER)) {
      section = 'steps';
      continue;
    }
    if (isHeader(line, NOTES_HEADER)) {
      section = 'notes';
      continue;
    }

    if (section === 'lead') {
      if (META_LINE.test(line)) continue;
      if (looksLikeIngredient(line)) {
        section = 'ingredients';
        ingredients.push(line.replace(/^[-–—]\s*/, ''));
        continue;
      }
      if (looksLikeStep(line)) {
        section = 'steps';
        steps.push(line.replace(/^\d+[.)]\s*/, ''));
        continue;
      }
      lead.push(line);
      continue;
    }
    if (section === 'ingredients') {
      if (META_LINE.test(line)) continue;
      if (looksLikeStep(line) && !looksLikeIngredient(line)) {
        section = 'steps';
        steps.push(line.replace(/^\d+[.)]\s*/, ''));
        continue;
      }
      if (looksLikeStep(line) && looksLikeIngredient(line) && line.length > 55) {
        const [ing, ...rest] = splitCrossColumnLine(line);
        if (rest.length) {
          ingredients.push(ing.replace(/^[-–—]\s*/, ''));
          section = 'steps';
          steps.push(rest.join(' ').replace(/^\d+[.)]\s*/, ''));
          continue;
        }
      }
      ingredients.push(line.replace(/^[-–—]\s*/, ''));
      continue;
    }
    if (section === 'steps') {
      if (looksLikeIngredient(line) && !looksLikeStep(line)) {
        ingredients.push(line.replace(/^[-–—]\s*/, ''));
        continue;
      }
      steps.push(line.replace(/^\d+[.)]\s*/, ''));
      continue;
    }
    notes.push(line);
  }

  const titleCandidate = lead.find((line) => line.length > 3 && line.length < 80 && !META_LINE.test(line));
  if (titleCandidate) title = titleCandidate;
  const restLead = lead.filter((line) => line !== titleCandidate && !META_LINE.test(line));
  if (restLead.length) description = restLead.join(' ');

  const prepMinutes = minutesAfter(/prep(?:aration)?/i, full);
  const cookMinutes = minutesAfter(/cook(?:ing)?|bake/i, full);

  if (ingredients.length === 0) {
    for (const line of lines) {
      if (looksLikeIngredient(line) && !looksLikeStep(line)) ingredients.push(line.replace(/^[-–—]\s*/, ''));
    }
  }
  if (steps.length === 0) {
    for (const line of lines) {
      if (looksLikeStep(line) && !looksLikeIngredient(line)) steps.push(line.replace(/^\d+[.)]\s*/, ''));
    }
  }

  return {
    title,
    description,
    sourceUrl: '',
    sourceName: 'Scanned page',
    imageUrl: null,
    servings: parseServings(full),
    prepMinutes,
    cookMinutes,
    category: inferCategory(full),
    cuisine: inferCuisine(full),
    ingredients,
    steps,
    notes: notes.length ? notes.join('\n') : null,
  };
}

export { normalizeOcr };
