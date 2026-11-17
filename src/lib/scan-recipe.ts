import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { messageFromFunctionError } from './function-error';
import type { ImportResult } from './import-recipe';
import { parseScanText } from './parse-scan';
import { supabase } from './supabase';

type FunctionPayload = ImportResult & {
  ocrText?: string;
  error?: string;
};

const LOCAL_HOSTS = ['localhost', '127.0.0.1'];

function lanHost(): string {
  const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
  if (devHost && !LOCAL_HOSTS.includes(devHost)) return devHost;
  if (Platform.OS === 'android') return '10.0.2.2';
  return '127.0.0.1';
}

async function compressForOcr(
  uri: string,
  maxWidth = 1200,
  compress = 0.6,
): Promise<{ base64: string; contentType: string; uri: string }> {
  const context = ImageManipulator.manipulate(uri, { maxWidth });
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress,
    base64: true,
  });
  if (!result.base64) throw new Error('Could not read that photo');
  if (result.base64.length > 500_000 && maxWidth > 800) {
    return compressForOcr(result.uri, Math.round(maxWidth * 0.75), Math.max(0.45, compress - 0.1));
  }
  return { base64: result.base64, contentType: 'image/jpeg', uri: result.uri };
}

async function pickScanImage(source: 'camera' | 'library') {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new Error('Camera access is needed to scan a magazine page.');
    }
    return ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });
  }

  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Photo library access is needed to scan a saved picture of a recipe.');
  }
  return ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    quality: 0.8,
  });
}

function recipeFromOcr(ocrText: string, imageBase64: string, contentType: string): ImportResult {
  const recipe = parseScanText(ocrText);
  if (!recipe.ingredients.length && !recipe.steps.length) {
    recipe.notes = [recipe.notes, ocrText].filter(Boolean).join('\n\n');
  }
  return { recipe, imageBase64, imageContentType: contentType };
}

async function scanViaProxy(imageBase64: string, contentType: string): Promise<ImportResult> {
  const response = await fetch(`http://${lanHost()}:8788/ocr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64,
      apiKey: process.env.EXPO_PUBLIC_OCR_SPACE_API_KEY,
    }),
  });
  const payload = (await response.json()) as { text?: string; error?: string };
  if (!response.ok || payload.error) {
    throw new Error(payload.error || `OCR helper returned ${response.status}`);
  }
  if (!payload.text?.trim()) throw new Error('OCR did not find any text on that page');
  return recipeFromOcr(payload.text, imageBase64, contentType);
}

async function scanViaFunction(imageBase64: string, contentType: string): Promise<ImportResult> {
  const { data, error } = await supabase.functions.invoke<FunctionPayload>('scan-recipe', {
    body: {
      imageBase64,
      imageContentType: contentType,
      ocrApiKey: process.env.EXPO_PUBLIC_OCR_SPACE_API_KEY,
    },
    timeout: 45_000,
  });
  if (error) throw new Error(await messageFromFunctionError(error, 'Could not read that recipe page'));
  if (data?.error) throw new Error(data.error);
  if (!data?.recipe) throw new Error('The scan function returned an empty recipe');
  return {
    recipe: data.recipe,
    imageBase64: data.imageBase64 ?? imageBase64,
    imageContentType: data.imageContentType ?? contentType,
  };
}

export async function scanRecipeFromImage(source: 'camera' | 'library'): Promise<ImportResult | null> {
  const picked = await pickScanImage(source);
  if (picked.canceled || !picked.assets[0]) return null;

  const prepared = await compressForOcr(picked.assets[0].uri);
  try {
    return await scanViaProxy(prepared.base64, prepared.contentType);
  } catch (proxyError) {
    const proxyDown =
      proxyError instanceof Error &&
      /network request failed|failed to connect|econnrefused/i.test(proxyError.message);
    try {
      return await scanViaFunction(prepared.base64, prepared.contentType);
    } catch (functionError) {
      if (proxyDown) {
        throw new Error(
          'OCR helper is not running. Stop Expo (Ctrl+C) and start it again with npm start.',
        );
      }
      throw functionError instanceof Error
        ? functionError
        : new Error('Could not read that recipe page');
    }
  }
}
