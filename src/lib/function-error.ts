/** Read the JSON body from a Supabase FunctionsHttpError (status 4xx/5xx). */
export async function messageFromFunctionError(error: unknown, fallback: string): Promise<string> {
  const context =
    error && typeof error === 'object' && 'context' in error
      ? (error as { context?: Response }).context
      : undefined;

  if (context && typeof context.json === 'function') {
    try {
      const body = (await context.json()) as { error?: unknown; message?: unknown; msg?: unknown };
      const raw = body.error ?? body.message ?? body.msg;
      if (typeof raw === 'string' && raw.trim()) return raw.trim();
      if (Array.isArray(raw) && raw.length) return raw.map(String).join(' ');
    } catch {
      // Body was not JSON; fall through to the wrapper message.
    }
  }

  if (error instanceof Error && error.message && !/non-2xx status code/i.test(error.message)) {
    return error.message;
  }
  return fallback;
}
