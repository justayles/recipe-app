import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { messageFromFunctionError } from './function-error';
import type { DishPhotoCrop, ImportResult } from './import-recipe';
import { launchPhotoPicker, type PhotoSource } from './pick-photo';
import { supabase } from './supabase';

type FunctionPayload = ImportResult & {
  error?: string;
};

async function compressPagePhoto(
  uri: string,
  maxWidth = 1280,
  compress = 0.7,
): Promise<{ uri: string; base64: string; contentType: string }> {
  const context = ImageManipulator.manipulate(uri, { maxWidth });
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress,
    base64: true,
  });
  if (!result.base64) throw new Error('Could not read that photo');
  if (result.base64.length > 1_200_000 && maxWidth > 800) {
    return compressPagePhoto(result.uri, Math.round(maxWidth * 0.75), Math.max(0.5, compress - 0.1));
  }
  return { uri: result.uri, base64: result.base64, contentType: 'image/jpeg' };
}

async function cropDishFromPage(pageUri: string, crop: DishPhotoCrop): Promise<string | null> {
  const loaded = await ImageManipulator.manipulate(pageUri).renderAsync();
  const originX = Math.round(crop.left * loaded.width);
  const originY = Math.round(crop.top * loaded.height);
  const width = Math.round(crop.width * loaded.width);
  const height = Math.round(crop.height * loaded.height);
  if (width < 32 || height < 32) return null;

  const cropped = await ImageManipulator.manipulate(loaded)
    .crop({
      originX: Math.max(0, Math.min(originX, loaded.width - 1)),
      originY: Math.max(0, Math.min(originY, loaded.height - 1)),
      width: Math.max(1, Math.min(width, loaded.width - originX)),
      height: Math.max(1, Math.min(height, loaded.height - originY)),
    })
    .renderAsync();
  const saved = await cropped.saveAsync({
    format: SaveFormat.JPEG,
    compress: 0.85,
    base64: true,
  });
  return saved.base64 ?? null;
}

export async function scanRecipeFromImage(source: PhotoSource): Promise<ImportResult | null> {
  const picked = await launchPhotoPicker(source);
  if (picked.canceled || !picked.assets[0]) return null;

  const prepared = await compressPagePhoto(picked.assets[0].uri);
  const { data, error } = await supabase.functions.invoke<FunctionPayload>('scan-recipe', {
    body: {
      imageBase64: prepared.base64,
      imageContentType: prepared.contentType,
    },
  });
  if (error) throw new Error(await messageFromFunctionError(error, 'Could not read that recipe page'));
  if (data?.error) throw new Error(data.error);
  if (!data?.recipe) throw new Error('The scan function returned an empty recipe');

  if (data.useScannedDishPhoto && data.dishPhotoCrop) {
    const cropped = await cropDishFromPage(prepared.uri, data.dishPhotoCrop);
    const imageBase64 = cropped ?? prepared.base64;
    return {
      recipe: data.recipe,
      imageBase64,
      imageContentType: 'image/jpeg',
      imageGenerationFailed: false,
    };
  }

  const imageBase64 = data.imageBase64 ?? null;
  return {
    recipe: data.recipe,
    imageBase64,
    imageContentType: data.imageContentType ?? (imageBase64 ? 'image/jpeg' : null),
    imageGenerationFailed: !imageBase64,
  };
}
