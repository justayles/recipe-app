import { PostHog } from 'npm:posthog-node@5';

const posthogApiKey = Deno.env.get('POSTHOG_API_KEY')?.trim();
const posthogHost = Deno.env.get('POSTHOG_HOST')?.trim();
const isProduction = Boolean(Deno.env.get('DENO_DEPLOYMENT_ID'));

if (!posthogApiKey && !isProduction) {
  console.warn(
    'POSTHOG_API_KEY variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once POSTHOG_API_KEY is configured',
  );
}

if (!posthogHost && !isProduction) {
  console.warn(
    'POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once POSTHOG_HOST is configured',
  );
}

/** Keep in sync with `src/lib/feature-flags.ts`. */
export const RECIPE_SCAN_FLAG = 'recipe-scan';
export const INSTAGRAM_IMPORT_FLAG = 'instagram-import';

export type AiObservabilityContext = {
  distinctId: string | null;
  traceId: string;
};

type AiGeneration = AiObservabilityContext & {
  error?: string;
  httpStatus?: number;
  input: unknown;
  inputTokens?: number;
  isError?: boolean;
  latency: number;
  model: string;
  outputChoices?: unknown;
  outputTokens?: number;
  provider: string;
};

function sanitizeAiPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeAiPayload);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      key === 'image_url' && typeof child === 'string' && child.startsWith('data:')
        ? '[image omitted from observability event]'
        : sanitizeAiPayload(child),
    ]),
  );
}

export function requestDistinctId(authorization: string | null): string | null {
  const token = authorization?.replace(/^Bearer\s+/i, '');
  const payload = token?.split('.')[1];
  if (!payload) return null;

  try {
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const sub = (JSON.parse(decoded) as { sub?: unknown }).sub;
    return typeof sub === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(sub)
      ? sub
      : null;
  } catch {
    return null;
  }
}

export async function isFlagEnabled(flag: string, distinctId: string | null): Promise<boolean> {
  if (!posthogApiKey || !posthogHost || !distinctId) return false;

  const posthog = new PostHog(posthogApiKey, {
    flushAt: 1,
    flushInterval: 0,
    host: posthogHost,
  });

  try {
    const enabled = await Promise.race([
      posthog.isFeatureEnabled(flag, distinctId),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 2_500)),
    ]);
    return enabled === true;
  } catch (error) {
    console.warn('PostHog feature flag check failed:', error);
    return false;
  } finally {
    await Promise.race([
      posthog.shutdown(),
      new Promise<void>((resolve) => setTimeout(resolve, 1_000)),
    ]);
  }
}

export function isRecipeScanEnabled(distinctId: string | null): Promise<boolean> {
  return isFlagEnabled(RECIPE_SCAN_FLAG, distinctId);
}

export function isInstagramImportEnabled(distinctId: string | null): Promise<boolean> {
  return isFlagEnabled(INSTAGRAM_IMPORT_FLAG, distinctId);
}

export async function captureAiGeneration(generation: AiGeneration): Promise<void> {
  if (!posthogApiKey || !posthogHost) return;

  const posthog = new PostHog(posthogApiKey, {
    flushAt: 1,
    flushInterval: 0,
    host: posthogHost,
    privacyMode: false,
  });

  try {
    posthog.capture({
      distinctId: generation.distinctId ?? 'anonymous',
      event: '$ai_generation',
      properties: {
        $ai_error: generation.error,
        $ai_http_status: generation.httpStatus,
        $ai_input: sanitizeAiPayload(generation.input),
        $ai_input_tokens: generation.inputTokens,
        $ai_is_error: generation.isError,
        $ai_latency: generation.latency,
        $ai_model: generation.model,
        $ai_output_choices: sanitizeAiPayload(generation.outputChoices),
        $ai_output_tokens: generation.outputTokens,
        $ai_provider: generation.provider,
        $ai_session_id: null,
        $ai_trace_id: generation.traceId,
      },
    });
    await Promise.race([
      posthog.shutdown(),
      new Promise<void>((resolve) => setTimeout(resolve, 1_000)),
    ]);
  } catch (error) {
    console.warn('PostHog AI Observability capture failed:', error);
  }
}
