import { supabase } from './supabase';

const BUCKET = 'recipe-images';

export function recipeImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

function inferContentType(uri: string, fallback = 'image/jpeg'): string {
  const lower = uri.split('?')[0].toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.heic') || lower.endsWith('.heif')) return 'image/heic';
  return fallback;
}

function extensionFor(contentType: string): string {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  if (contentType.includes('heic') || contentType.includes('heif')) return 'heic';
  return 'jpg';
}

export async function uploadRecipeImage(params: {
  userId: string;
  recipeId: string;
  uri?: string | null;
  base64?: string | null;
  contentType?: string | null;
}): Promise<string> {
  const contentType = params.contentType ?? inferContentType(params.uri ?? '');
  const path = `${params.userId}/${params.recipeId}/cover.${extensionFor(contentType)}`;

  let body: ArrayBuffer;
  if (params.base64) {
    const binary = atob(params.base64.replace(/^data:[^;]+;base64,/, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    body = bytes.buffer;
  } else if (params.uri) {
    const response = await fetch(params.uri);
    if (!response.ok) throw new Error('Could not read that image');
    body = await response.arrayBuffer();
  } else {
    throw new Error('No image to upload');
  }

  const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
    contentType,
    upsert: true,
  });
  if (error) throw error;
  return path;
}
