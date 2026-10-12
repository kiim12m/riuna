import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import { readAppVersion } from "./utils/app-version";

function parseSampleRate(value: string | undefined) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0;
}

const tracesSampleRate = parseSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE);

const profilesSampleRate = parseSampleRate(
  process.env.SENTRY_PROFILES_SAMPLE_RATE,
);

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment:
      process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "production",
    release: process.env.SENTRY_RELEASE ?? readAppVersion(),
    sendDefaultPii: false,
    tracesSampleRate,
    profilesSampleRate,
    integrations: [nodeProfilingIntegration()],
  });
}
