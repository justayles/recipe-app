#!/usr/bin/env node
/**
 * OCR + recipe parser for scanned magazine / cookbook pages.
 *
 *   npm run scan:recipe -- scripts/fixtures/magazine-ocr.txt
 *   npm run scan:recipe -- path/to/page.jpg
 *   npm run scan:recipe -- --ocr-only photo.jpg
 *
 * Images are read with tesseract.js. Plain text skips OCR and goes straight
 * to the recipe parser (the same logic the app and scan-recipe function use).
 */
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

import { parseScanText, reconstructOcrLayout } from '../src/lib/parse-scan.ts';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.bmp']);

async function ocrImage(filePath: string): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng');
  try {
    const { data } = await worker.recognize(filePath);
    const words = (data.words ?? [])
      .filter((word) => word.text?.trim() && (word.confidence == null || word.confidence > 25))
      .map((word) => ({
        text: word.text.trim(),
        x: word.bbox.x0,
        y: word.bbox.y0,
        width: word.bbox.x1 - word.bbox.x0,
        height: word.bbox.y1 - word.bbox.y0,
      }));
    if (words.length >= 8) return reconstructOcrLayout(words);
    return data.text ?? '';
  } finally {
    await worker.terminate();
  }
}

async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== '--ocr-only');
  const ocrOnly = process.argv.includes('--ocr-only');
  const filePath = args[0];
  if (!filePath) {
    console.error('Usage: npm run scan:recipe -- <image-or-ocr.txt> [--ocr-only]');
    process.exit(1);
  }

  const ext = extname(filePath).toLowerCase();
  let text: string;
  if (IMAGE_EXT.has(ext)) {
    process.stderr.write(`OCR ${filePath}...\n`);
    text = await ocrImage(filePath);
  } else {
    text = await readFile(filePath, 'utf8');
  }

  if (ocrOnly) {
    process.stdout.write(text);
    return;
  }

  const recipe = parseScanText(text);
  process.stdout.write(`${JSON.stringify({ ocrText: text, recipe }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
