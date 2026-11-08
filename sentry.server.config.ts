import * as Sentry from '@sentry/nextjs';
import { dropBreadcrumb, toSafeEvent } from '@/lib/observability/scrub';

/**
 * Yoca — server-side error reports to GlitchTip (Sentry protocol).
 *
 * Off unless GLITCHTIP_DSN is set. Browser errors are not collected.
 * What may leave is an allow-list (lib/observability/scrub.ts → toSafeEvent):
 * error type + safe code, route template, stack locations, release. The SDK
 * is also told not to collect anything else (no PII, no request data, no
 * source lines, no local variables, no module list, no breadcrumbs).
 * GlitchTip being slow, down or misconfigured never changes a response.
 * `release` is the deployed commit (VERCEL_GIT_COMMIT_SHA); the SDK version is a
 * separate field and never stands in for it.
 */
const dsn = process.env.GLITCHTIP_DSN?.trim();

// Integrations that would collect data the allow-list drops anyway.
const DROP = new Set(['RequestData', 'ContextLines', 'Modules', 'Console', 'LocalVariables', 'Context', 'ProcessSession']);

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? 'local',
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    sendDefaultPii: false,
    includeLocalVariables: false,
    tracesSampleRate: 0,
    sendClientReports: false,
    maxBreadcrumbs: 0,
    integrations: (defaults) => defaults.filter((integration) => !DROP.has(integration.name)),
    beforeSend: (event, hint) => toSafeEvent(event, hint),
    beforeSendTransaction: () => null,
    beforeBreadcrumb: dropBreadcrumb,
  });
}
