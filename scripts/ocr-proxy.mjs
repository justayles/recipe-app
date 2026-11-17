#!/usr/bin/env node
/**
 * LAN OCR helper. Community Fibre's DNS does not resolve api.ocr.space,
 * so this process uses 8.8.8.8 / 1.1.1.1 and the phone talks to it over Wi-Fi.
 *
 *   npm run ocr:server
 *   (npm start also launches this alongside Expo)
 */
import { createServer } from 'node:http';
import https from 'node:https';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.OCR_PROXY_PORT || 8788);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadDotEnv() {
  try {
    const text = readFileSync(join(ROOT, '.env'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (key && process.env[key] == null) process.env[key] = value;
    }
  } catch {
    // .env is optional; the app can send the key in the request body.
  }
}

loadDotEnv();

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function resolveOcrHost() {
  const response = await fetch('https://8.8.8.8/resolve?name=api.ocr.space&type=A', {
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`DNS lookup failed (${response.status})`);
  const payload = await response.json();
  const ip = (payload.Answer ?? []).find((row) => row.type === 1)?.data;
  if (!ip) throw new Error('Could not resolve api.ocr.space');
  return ip;
}

function postOcrSpace(ip, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: ip,
        servername: 'api.ocr.space',
        port: 443,
        path: '/parse/image',
        method: 'POST',
        headers: {
          Host: 'api.ocr.space',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }),
        );
      },
    );
    req.setTimeout(40_000, () => req.destroy(new Error('OCR timed out')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function ocrSpace(base64, apiKey) {
  const body = new URLSearchParams({
    apikey: apiKey,
    language: 'eng',
    isOverlayRequired: 'true',
    OCREngine: '2',
    scale: 'true',
    base64Image: `data:image/jpeg;base64,${base64}`,
  }).toString();
  const ip = await resolveOcrHost();
  const { status, text: rawJson } = await postOcrSpace(ip, body);
  if (status < 200 || status >= 300) throw new Error(`OCR service returned ${status}`);
  const payload = JSON.parse(rawJson);
  if (payload.IsErroredOnProcessing) {
    const raw = payload.ErrorMessage ?? payload.ErrorDetails;
    const message = Array.isArray(raw) ? raw.join(' ') : raw;
    throw new Error(message || 'OCR could not read that photo');
  }
  const parsed = (payload.ParsedResults ?? []).map((row) => row.ParsedText ?? '').join('\n').trim();
  if (!parsed) throw new Error('OCR did not find any text on that page');
  const words = (payload.ParsedResults ?? []).flatMap((row) =>
    (row.TextOverlay?.Lines ?? []).flatMap((line) =>
      (line.Words ?? [])
        .filter((word) => word.WordText?.trim())
        .map((word) => ({
          text: word.WordText.trim(),
          x: word.Left ?? 0,
          y: word.Top ?? 0,
          width: word.Width ?? 0,
          height: word.Height ?? 0,
        })),
    ),
  );
  return { text: parsed, words };
}

async function ocrTesseract(base64) {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng');
  try {
    const { data } = await worker.recognize(`data:image/jpeg;base64,${base64}`);
    const trimmed = (data.text || '').trim();
    const words = (data.words ?? [])
      .filter((word) => word.text?.trim() && (word.confidence == null || word.confidence > 25))
      .map((word) => ({
        text: word.text.trim(),
        x: word.bbox.x0,
        y: word.bbox.y0,
        width: word.bbox.x1 - word.bbox.x0,
        height: word.bbox.y1 - word.bbox.y0,
      }));
    if (!trimmed && !words.length) throw new Error('OCR did not find any text on that page');
    return { text: trimmed, words };
  } finally {
    await worker.terminate();
  }
}

async function loadLayout() {
  return import('../src/lib/parse-scan.ts');
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    json(res, 200, { ok: true });
    return;
  }
  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    json(res, 200, { ok: true });
    return;
  }
  if (req.method !== 'POST' || req.url !== '/ocr') {
    json(res, 404, { error: 'Not found' });
    return;
  }

  let imageBase64 = '';
  let apiKey = process.env.EXPO_PUBLIC_OCR_SPACE_API_KEY || process.env.OCR_SPACE_API_KEY || 'helloworld';
  try {
    const body = JSON.parse(await readBody(req));
    imageBase64 =
      typeof body.imageBase64 === 'string' ? body.imageBase64.replace(/^data:[^;]+;base64,/, '') : '';
    if (typeof body.apiKey === 'string' && body.apiKey.trim()) apiKey = body.apiKey.trim();
  } catch {
    json(res, 400, { error: 'Expected JSON with imageBase64' });
    return;
  }
  if (!imageBase64) {
    json(res, 400, { error: 'Send a photo of the recipe page' });
    return;
  }

  try {
    let text = '';
    let words = [];
    try {
      const space = await ocrSpace(imageBase64, apiKey);
      text = space.text;
      words = space.words;
    } catch (ocrSpaceError) {
      process.stderr.write(
        `OCR.space failed (${ocrSpaceError instanceof Error ? ocrSpaceError.message : ocrSpaceError}); trying Tesseract.\n`,
      );
    }
    if (words.length < 8) {
      const tess = await ocrTesseract(imageBase64);
      if (tess.words.length >= 8) words = tess.words;
      if (!text) text = tess.text;
    }
    if (words.length >= 8) {
      const { reconstructOcrLayout } = await loadLayout();
      text = reconstructOcrLayout(words);
    }
    if (!text.trim()) throw new Error('OCR did not find any text on that page');
    json(res, 200, { text });
  } catch (error) {
    json(res, 422, { error: error instanceof Error ? error.message : 'Could not read that recipe page' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  process.stderr.write(`OCR helper listening on http://0.0.0.0:${PORT}/ocr\n`);
});
