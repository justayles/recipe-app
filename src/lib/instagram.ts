/** Keep in sync with `supabase/functions/_shared/instagram.ts`. */
const POST_PATH = /(?:^|\/)(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i;

export function isInstagramUrl(text: string): boolean {
  const match = text.match(/https?:\/\/[^\s]+/i);
  const candidate = (match ? match[0].replace(/[),.;]+$/, '') : text).trim();
  try {
    const parsed = new URL(candidate);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (host !== 'instagram.com' && host !== 'instagr.am') return false;
    return POST_PATH.test(parsed.pathname);
  } catch {
    return false;
  }
}
