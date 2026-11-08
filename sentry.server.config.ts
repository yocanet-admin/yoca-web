import * as Sentry from '@sentry/nextjs';
import { scrubBreadcrumb, scrubEvent } from '@/lib/observability/scrub';

/**
 * Yoca — server-side error reports to GlitchTip (Sentry protocol).
 *
 * Off unless GLITCHTIP_DSN is set (Production only). Browser errors are not
 * collected yet. Nothing personal is collected by the SDK, and scrubEvent
 * strips/masks whatever is left before an event leaves (lib/observability/scrub.ts).
 * GlitchTip being slow or down never changes a response: events are sent in
 * the background and a flush waits at most 2 s.
 */
const dsn = process.env.GLITCHTIP_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? 'local',
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    sendClientReports: false,
    maxBreadcrumbs: 30,
    integrations: [Sentry.requestDataIntegration({ include: { cookies: false, data: false, headers: false, ip: false, query_string: false, url: true } })],
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
  });
}
