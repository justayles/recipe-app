# PostHog AI Observability setup

## Status

**Wired, awaiting a live trigger.** The project sends manual AI Observability generation events for its direct OpenAI HTTP calls from Supabase Edge Functions. No existing PostHog initialization, identify calls, product events, or dashboards were changed.

## Integration selected

- **Variant:** `ai-observability-manual-capture`
- **Reason:** The Node/Expo manifest has no vendor LLM SDK. The app makes direct OpenAI Responses and image-generation HTTP requests from Supabase Edge Functions, so wrapper-based auto-instrumentation is not applicable.
- **SDK:** `posthog-node@5`, imported through Deno's `npm:` compatibility layer in the Edge Function helper.

## What is captured

- AI-assisted URL imports emit one `$ai_generation` event from `supabase/functions/_shared/extract-recipe-from-page.ts`.
- Recipe-photo scans emit an extraction `$ai_generation` from `supabase/functions/scan-recipe/index.ts`.
- When a scan needs a generated dish image, the image generation emits a second `$ai_generation` sharing the scan's trace ID.
- Each Edge Function request creates one trace ID. The scan's extraction and image generation therefore appear together in one trace.
- These are one-shot workloads, so `$ai_session_id` is explicitly `null`; there is no conversation/thread field to group across requests.
- The helper attributes events to the authenticated Supabase JWT subject when it is a UUID. Otherwise the AI event remains anonymous. It does not put user-entered identity data on event properties.
- The recipe-photo data URL is replaced with an omission marker before capture so a large image is not sent as an AI input payload.
- The project registers no LLM tools, so no `$ai_span` events are expected.

## Configuration

- Local Edge Function configuration now has `POSTHOG_API_KEY` and `POSTHOG_HOST` in both `supabase/functions/.env` and `supabase/.env`.
- The same variable names are documented without values in `supabase/functions/.env.example` and `supabase/.env.example`.
- Before deploying the Edge Functions, set those two names as secrets in the deployed Supabase project as well. The repository intentionally does not contain their values.
- If either value is absent, the server helper is a no-op and logs a development warning rather than interrupting the recipe request.

## Verification performed

- `npm run typecheck` completed successfully.
- The local Supabase environment files contain both required PostHog variables.
- The integration was not sent a live model request during setup, so arrival in PostHog is still unverified.

## How to verify live capture

1. Deploy the updated Supabase Edge Functions with the two PostHog environment values configured.
2. In the app, open **Bring a recipe in**, import a page that falls back to **Try with AI**, then use **Try with AI**. This triggers the URL-import OpenAI Responses call.
3. For a trace with multiple generations, scan a recipe photo that has no usable dish photo; this triggers both recipe extraction and image generation in one trace.
4. In PostHog, open **AI Observability → Traces** and inspect the newest trace:
   - URL import: one generation in one trace.
   - Scan without a usable dish photo: two generations under the same trace.
   - Trace attribution: the authenticated user ID when available; otherwise anonymous.
   - No tool spans are expected.

## Privacy mode

- **Effective setting:** privacy mode is off at `supabase/functions/_shared/posthog-ai.ts:74` (`privacyMode: false`). Prompt and completion content is captured for the text-based model calls, along with model, provider, token counts when supplied by OpenAI, response status, and latency.
- The scan's original image payload is deliberately omitted from the captured AI input to avoid transmitting the base64 image data.
- Enable privacy mode before sending prompts or responses whose sensitive content must not be stored in PostHog. Change `privacyMode` to `true` in `supabase/functions/_shared/posthog-ai.ts`; this excludes `$ai_input` and `$ai_output_choices` from SDK-captured events. It does not remove arbitrary custom properties, manually supplied payloads, or data already stored.
- Learn more: [AI Observability privacy mode](https://posthog.com/docs/ai-observability/privacy-mode).
