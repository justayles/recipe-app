import type { RecipeFormValue } from '@/components/recipe-form';

let draft: RecipeFormValue | null = null;

export function setRecipeDraft(value: RecipeFormValue | null) {
  draft = value;
}

export function takeRecipeDraft(): RecipeFormValue | null {
  const value = draft;
  draft = null;
  return value;
}
