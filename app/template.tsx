/**
 * Yoca — route template (2026 redesign).
 *
 * The former full-screen lime wipe + delayed content fade ran on every page
 * load and navigation: content stayed invisible until JavaScript hydrated,
 * it covered the project-card → detail cover transition, and it rendered a
 * different tree under reduced motion (hydration errors). Pages now appear
 * immediately; continuity between a project card and its detail page comes
 * from lib/coverTransition.ts instead.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
