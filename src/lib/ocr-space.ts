type OcrSpaceResponse = {
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: string | string[];
  ErrorDetails?: string | string[];
  ParsedResults?: { ParsedText?: string }[];
};

function apiKey(): string {
  return process.env.EXPO_PUBLIC_OCR_SPACE_API_KEY || 'helloworld';
}

function asMessage(value: string | string[] | undefined, fallback: string): string {
  if (Array.isArray(value) && value.length) return value.map(String).join(' ');
  if (typeof value === 'string' && value.trim()) return value.trim();
  return fallback;
}

function textFromPayload(payload: OcrSpaceResponse): string {
  if (payload.IsErroredOnProcessing) {
    throw new Error(asMessage(payload.ErrorMessage ?? payload.ErrorDetails, 'OCR could not read that photo'));
  }
  const text = (payload.ParsedResults ?? []).map((row) => row.ParsedText ?? '').join('\n').trim();
  if (!text) throw new Error('OCR did not find any text on that page');
  return text;
}

/** OCR.space via string fields only — RN/Expo fetch rejects `{ uri, name, type }` file parts. */
export async function ocrImageFile(params: { uri: string; base64: string }): Promise<string> {
  const body = new URLSearchParams({
    apikey: apiKey(),
    language: 'eng',
    isOverlayRequired: 'false',
    OCREngine: '2',
    scale: 'true',
    base64Image: `data:image/jpeg;base64,${params.base64}`,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  let response: Response;
  try {
    response = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('OCR timed out. Try a closer crop of the recipe.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`OCR service returned ${response.status}`);
  }
  return textFromPayload((await response.json()) as OcrSpaceResponse);
}
