import { decodeEntities, ogImageFromHtml, ogTagFromHtml } from './extract-recipe-from-page.ts';

/** Keep in sync with `src/lib/instagram.ts`. */
const POST_PATH = /(?:^|\/)(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i;

const PREVIEW_UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const BLOCKED_MESSAGE = 'Instagram would not share that post. It may be private.';

export type InstagramPreview = {
  canonicalUrl: string;
  caption: string;
  author: string | null;
  imageUrl: string | null;
};

export function instagramPostCode(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (host !== 'instagram.com' && host !== 'instagr.am') return null;
    return parsed.pathname.match(POST_PATH)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function isInstagramPostUrl(url: string): boolean {
  return instagramPostCode(url) != null;
}

export function normalizeInstagramUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const code = instagramPostCode(url);
  if (!code) return null;
  const kind = /\/p\//i.test(parsed.pathname) ? 'p' : 'reel';
  return `https://www.instagram.com/${kind}/${code}/`;
}

export function captionFromOgDescription(raw: string | null): string {
  if (!raw) return '';
  const trimmed = decodeEntities(raw).trim();
  if (!trimmed) return '';
  if (looksLikeLoginCopy(trimmed)) return '';
  const withoutCounts = trimmed.replace(
    /^[\d,.]+\s+likes?,\s+[\d,.]+\s+comments?\s+[-–—]\s+/i,
    '',
  );
  const quoted = withoutCounts.match(/^[^\n:]+:\s*[“"']([\s\S]*?)[”"']\s*$/);
  if (quoted?.[1]?.trim()) return quoted[1].trim();
  const colon = withoutCounts.indexOf(': ');
  if (colon >= 0) {
    return withoutCounts
      .slice(colon + 2)
      .replace(/^[“"']/, '')
      .replace(/[”"']$/, '')
      .trim();
  }
  return withoutCounts;
}

export function authorFromOg(title: string | null, description: string | null): string | null {
  const titleMatch = title?.match(/^@?([A-Za-z0-9._]+)\s+on\s+Instagram/i);
  if (titleMatch) return titleMatch[1];
  const desc = description
    ?.replace(/^[\d,.]+\s+likes?,\s+[\d,.]+\s+comments?\s+[-–—]\s+/i, '')
    .trim();
  const descMatch = desc?.match(/^@?([A-Za-z0-9._]+)\s+on\s+/i);
  return descMatch?.[1] ?? null;
}

function looksLikeLoginCopy(text: string): boolean {
  return /log in to instagram|create an account or log in|see posts, likes and/i.test(text);
}

function previewFromHtml(html: string, fallbackUrl: string): InstagramPreview | null {
  const description = ogTagFromHtml(html, 'og:description');
  const title = ogTagFromHtml(html, 'og:title');
  const imageUrl = ogImageFromHtml(html);
  const caption = captionFromOgDescription(description) || captionFromOgDescription(title);
  const author = authorFromOg(title, description);
  if (!caption && !imageUrl) return null;
  return {
    canonicalUrl: normalizeInstagramUrl(fallbackUrl) ?? fallbackUrl,
    caption,
    author,
    imageUrl,
  };
}

async function fetchHtml(
  url: string,
  userAgent: string,
): Promise<{ status: number; html: string; finalUrl: string }> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': userAgent,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-GB,en;q=0.9',
    },
    redirect: 'follow',
  });
  return {
    status: response.status,
    html: await response.text(),
    finalUrl: response.url || url,
  };
}

export async function fetchInstagramPreview(url: string): Promise<InstagramPreview> {
  const canonical = normalizeInstagramUrl(url);
  if (!canonical) {
    throw new Error('That does not look like an Instagram post link');
  }

  const first = await fetchHtml(canonical, PREVIEW_UA);
  if (first.status >= 400) throw new Error(BLOCKED_MESSAGE);

  let preview = previewFromHtml(first.html, first.finalUrl || canonical);
  if (!preview?.caption) {
    const second = await fetchHtml(canonical, BROWSER_UA);
    if (second.status < 400) {
      preview = previewFromHtml(second.html, second.finalUrl || canonical) ?? preview;
    }
  }

  if (!preview) throw new Error(BLOCKED_MESSAGE);
  return preview;
}
