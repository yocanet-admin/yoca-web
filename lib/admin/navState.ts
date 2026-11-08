/**
 * Yoca — admin sidebar: which menu groups are open (pure helpers, unit-tested).
 *
 *  - First visit (nothing stored for this user in this browser): only the group
 *    of the current page is open.
 *  - Afterwards the user's own open/closed choices are restored; several groups
 *    may be open at once.
 *  - The current page's group is always opened, so a page reached directly (link,
 *    bookmark, typed address) is visible in the menu.
 *
 * Only group titles and booleans are stored (localStorage, one key per user id).
 */

export type OpenGroups = Record<string, boolean>;

const PREFIX = 'yoca-admin-nav:v1:';

export const navStorageKey = (userId: string) => `${PREFIX}${userId}`;

/** Reads a stored value; anything unexpected counts as "nothing stored". */
export function parseOpenGroups(raw: string | null | undefined): OpenGroups | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const out: OpenGroups = {};
    for (const [key, open] of Object.entries(value as Record<string, unknown>)) {
      if (typeof open === 'boolean') out[key] = open;
    }
    return out;
  } catch {
    return null;
  }
}

/** The group that holds the current page, or null (e.g. the always-visible home link). */
export function groupOfPath<T extends { title: string; items: Array<{ href: string }> }>(
  groups: T[],
  pathname: string,
  isActive: (href: string, pathname: string) => boolean,
): string | null {
  return groups.find((group) => group.items.some((item) => isActive(item.href, pathname)))?.title ?? null;
}

/**
 * Open state for the visible groups. Titles not in `titles` are dropped, so a
 * group the user cannot see never appears through the stored value.
 */
export function resolveOpenGroups(titles: string[], stored: OpenGroups | null, current: string | null): OpenGroups {
  const out: OpenGroups = {};
  for (const title of titles) out[title] = stored ? stored[title] === true : false;
  if (current && titles.includes(current)) out[current] = true;
  return out;
}

/** Flips one group; the others keep their state. */
export function toggleGroup(state: OpenGroups, title: string): OpenGroups {
  return { ...state, [title]: !state[title] };
}

/** Opens the current page's group (after a navigation); same object when already open. */
export function openCurrent(state: OpenGroups, current: string | null): OpenGroups {
  if (!current || state[current]) return state;
  return { ...state, [current]: true };
}
