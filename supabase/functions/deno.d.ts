declare namespace Deno {
  namespace env {
    function get(key: string): string | undefined;
  }
  function serve(handler: (request: Request) => Response | Promise<Response>): void;
}

declare module 'npm:posthog-node@5' {
  export class PostHog {
    constructor(
      apiKey: string,
      options?: {
        flushAt?: number;
        flushInterval?: number;
        host?: string;
        privacyMode?: boolean;
      },
    );
    capture(event: {
      distinctId: string;
      event: string;
      properties?: Record<string, unknown>;
    }): void;
    isFeatureEnabled(flag: string, distinctId: string): Promise<boolean | undefined>;
    shutdown(): Promise<void>;
  }
}
