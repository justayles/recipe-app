import type { RecipeFormValue } from '@/components/recipe-form';

import { messageFromFunctionError } from './function-error';
import { extractUrlFromShareText, parseRecipeHtml, type ImportedRecipe } from './parse-recipe';
import { supabase } from './supabase';

export type DishPhotoCrop = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type ImportResult = {
  recipe: ImportedRecipe;
  imageBase64: string | null;
  imageContentType: string | null;
  imageGenerationFailed?: boolean;
  useScannedDishPhoto?: boolean;
  dishPhotoCrop?: DishPhotoCrop | null;
};

type FunctionPayload = {
  recipe?: ImportedRecipe;
  imageBase64?: string | null;
  imageContentType?: string | null;
  error?: string;
};

export function canRetryUrlImport(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

async function importViaFunction(url: string, useAi: boolean): Promise<ImportResult> {
  const { data, error } = await supabase.functions.invoke<FunctionPayload>('import-recipe', {
    body: { url, useAi },
  });
  if (error) throw new Error(await messageFromFunctionError(error, 'Could not read that recipe page'));
  if (data?.error) throw new Error(data.error);
  if (!data?.recipe) throw new Error('The import function returned an empty recipe');
  return {
    recipe: data.recipe,
    imageBase64: data.imageBase64 ?? null,
    imageContentType: data.imageContentType ?? null,
  };
}

async function importDirectly(url: string): Promise<ImportResult> {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-GB,en;q=0.9',
    },
  });
  if (!response.ok) {
    throw new Error(`The site returned ${response.status}. Try another recipe URL.`);
  }
  const html = await response.text();
  return {
    recipe: parseRecipeHtml(html, url),
    imageBase64: null,
    imageContentType: null,
  };
}

export async function importRecipeFromUrl(
  raw: string,
  options?: { useAi?: boolean },
): Promise<ImportResult> {
  const trimmed = raw.trim();
  const url = extractUrlFromShareText(trimmed) ?? trimmed;
  try {
    new URL(url);
  } catch {
    throw new Error('Paste a full recipe URL, starting with https://');
  }

  const useAi = options?.useAi === true;
  try {
    return await importViaFunction(url, useAi);
  } catch (functionError) {
    if (useAi) {
      throw functionError instanceof Error
        ? functionError
        : new Error('Could not read that recipe page');
    }
    try {
      return await importDirectly(url);
    } catch {
      throw functionError instanceof Error
        ? functionError
        : new Error('Could not read that recipe page');
    }
  }
}

export function importedToDraft(result: ImportResult): RecipeFormValue {
  return {
    title: result.recipe.title,
    description: result.recipe.description,
    source_url: result.recipe.sourceUrl || null,
    source_name: result.recipe.sourceName,
    servings: result.recipe.servings,
    prep_minutes: result.recipe.prepMinutes,
    cook_minutes: result.recipe.cookMinutes,
    notes: null,
    category: result.recipe.category,
    cuisine: result.recipe.cuisine,
    ingredients: result.recipe.ingredients.length
      ? result.recipe.ingredients
      : [{ text: '', isHeading: false }],
    steps: result.recipe.steps.length ? result.recipe.steps : [{ text: '', isHeading: false }],
    labelIds: [],
    imageUri: result.imageBase64 ? null : result.recipe.imageUrl,
    imageBase64: result.imageBase64,
    imageContentType: result.imageContentType,
    imageNotice: result.imageGenerationFailed
      ? 'We could not generate a photo of this dish, so a placeholder is shown. Tap it to upload your own if you want.'
      : undefined,
  };
}

export { extractUrlFromShareText };
export type { ImportedRecipe };
