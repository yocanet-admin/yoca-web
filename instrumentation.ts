/** Next.js instrumentation hook: loads the GlitchTip (Sentry) server SDK on the Node.js runtime only. */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('./sentry.server.config');
}
