import { randomBytes } from "node:crypto";

type ErrorContext = Record<string, unknown>;

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function errorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}

/** Lightweight server-side error reporting (console + optional Sentry DSN). */
export function reportServerError(error: unknown, context?: ErrorContext): void {
  const payload = {
    message: errorMessage(error),
    stack: errorStack(error),
    context,
    at: new Date().toISOString(),
    tier: process.env.VERCEL_ENV ?? "local",
  };

  console.error("[tfes-error]", JSON.stringify(payload));

  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;

  void sendSentryEvent(dsn, payload).catch(() => {
    /* best-effort */
  });
}

async function sendSentryEvent(
  dsn: string,
  payload: { message: string; stack?: string; context?: ErrorContext; at: string; tier: string },
): Promise<void> {
  const match = dsn.match(/^https:\/\/([^@]+)@([^/]+)\/(.+)$/);
  if (!match) return;

  const [, publicKey, host, projectId] = match;
  const envelope = [
    JSON.stringify({ event_id: cryptoRandomId(), sent_at: payload.at }),
    JSON.stringify({ type: "event" }),
    JSON.stringify({
      level: "error",
      platform: "node",
      timestamp: Math.floor(Date.now() / 1000),
      message: payload.message,
      exception: payload.stack
        ? { values: [{ type: "Error", value: payload.message, stacktrace: { frames: [] } }] }
        : undefined,
      tags: { tier: payload.tier },
      extra: payload.context,
    }),
  ].join("\n");

  await fetch(`https://${host}/api/${projectId}/envelope/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-sentry-envelope",
      Authorization: `Sentry sentry_version=7, sentry_key=${publicKey}`,
    },
    body: envelope,
  });
}

function cryptoRandomId(): string {
  return randomBytes(16).toString("hex");
}
