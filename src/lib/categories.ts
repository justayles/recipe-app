export const RECIPE_CATEGORIES = [
  { id: 'starter', label: 'Starter' },
  { id: 'main', label: 'Main' },
  { id: 'side', label: 'Side' },
  { id: 'dessert', label: 'Dessert' },
  { id: 'snack', label: 'Snack' },
  { id: 'drink', label: 'Drink' },
  { id: 'other', label: 'Other' },
] as const;

export type RecipeCategory = (typeof RECIPE_CATEGORIES)[number]['id'];

export function categoryLabel(id: string | null | undefined): string | null {
  if (!id) return null;
  return RECIPE_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export const LABEL_COLORS = ['#C45C26', '#3E7C59', '#8B5E3C', '#5B6B8C', '#B4532A', '#6B4F7A', '#2F6F6A'];
